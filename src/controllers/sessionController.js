const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const batchProcessingService = require('../services/batchProcessingService');
const relatedProfilesService = require('../services/relatedProfilesService');
const depthProcessingService = require('../services/depthProcessingService');
const queuedBatchProcessingService = require('../services/queuedBatchProcessingService');
const directScrapingService = require('../services/directScrapingService');
const batchScrapingService = require('../services/batchScrapingService');
const profileCheckService = require('../services/profileCheckService');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const batchConfig = require('../config/batchConfig');

const sessionController = {
  // Create a new session
  async createSession(req, res, next) {
    try {
      const { name, description, rootProfiles, config } = req.body;
      
      // Check if session with same name already exists
      const existingSession = await Session.findOne({ name });
      if (existingSession) {
        return res.status(409).json({
          success: false,
          error: {
            message: 'A session with this name already exists',
            status: 409
          }
        });
      }
      
      // Check if we should skip privacy check (for faster processing)
      const skipPrivacyCheck = config?.skipPrivacyCheck === true;
      let publicProfileUrls = rootProfiles;
      let privateProfileUrls = [];
      let notFoundProfiles = [];
      
      if (!skipPrivacyCheck) {
        // Check profiles for privacy status
        logger.info(`Checking privacy status of ${rootProfiles.length} profiles...`);
        const profileUsernames = rootProfiles.map(url => {
          const match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
          return match ? match[1] : '';
        }).filter(u => u);
        
        const profileChecks = await profileCheckService.checkMultipleProfiles(profileUsernames);
        
        // Filter out private profiles
        publicProfileUrls = rootProfiles.filter(url => {
          const username = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/)?.[1]?.toLowerCase();
          return username && profileChecks.public.includes(username);
        });
        
        privateProfileUrls = rootProfiles.filter(url => {
          const username = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/)?.[1]?.toLowerCase();
          return username && profileChecks.private.includes(username);
        });
        
        notFoundProfiles = profileChecks.notFound;
        
        logger.info(`Profile check results - Public: ${publicProfileUrls.length}, Private: ${privateProfileUrls.length}, Not Found: ${notFoundProfiles.length}`);
        
        // If no public profiles, return error
        if (publicProfileUrls.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No public profiles found',
            details: {
              private: privateProfileUrls.length,
              notFound: notFoundProfiles.length,
              message: 'All provided profiles are either private or do not exist. Private profiles cannot be scraped.'
            }
          });
        }
      } else {
        logger.info(`Skipping privacy check - processing all ${rootProfiles.length} profiles`);
      }
      
      // Create new session with profiles
      const session = new Session({
        name,
        description,
        rootProfiles: publicProfileUrls,
        config: {
          maxDepth: config?.maxDepth || 2,
          maxProfilesPerDepth: config?.maxProfilesPerDepth === null ? null : (config?.maxProfilesPerDepth || 100),
          analysisEnabled: config?.analysisEnabled !== false,
          analyzeRootProfiles: config?.analyzeRootProfiles || false
        },
        status: 'pending',
        stats: {
          totalProfiles: publicProfileUrls.length,  // Count only public profiles
          scrapedProfiles: 0,
          currentDepth: 0
        }
      });
      
      await session.save();
      
      // Check which root profiles already exist in the database (from ANY session, ANY status)
      const allExistingProfiles = await RootProfileScraped.find({
        profileUrl: { $in: publicProfileUrls }
      }).select('profileUrl username status scrapedAt profileData');
      
      // Separate already scraped vs pending/failed
      const alreadyScrapedProfiles = allExistingProfiles.filter(p => p.status === 'scraped' || p.status === 'analyzed');
      const failedProfiles = allExistingProfiles.filter(p => p.status === 'failed');
      const pendingProfiles = allExistingProfiles.filter(p => p.status === 'pending');
      
      const existingUrlsSet = new Set(allExistingProfiles.map(p => p.profileUrl));
      
      // Only create records for profiles that don't exist at all in database
      const newProfileUrls = publicProfileUrls.filter(url => !existingUrlsSet.has(url));
      
      // For this session, we'll only process new profiles and retry failed ones
      const profilesToProcess = [...newProfileUrls];
      
      // Update failed profiles to retry them
      if (failedProfiles.length > 0) {
        logger.info(`Found ${failedProfiles.length} failed profiles that will be retried`);
        for (const failedProfile of failedProfiles) {
          await RootProfileScraped.findByIdAndUpdate(failedProfile._id, {
            status: 'pending',
            sessionId: session._id,
            error: null
          });
          profilesToProcess.push(failedProfile.profileUrl);
        }
      }
      
      if (newProfileUrls.length > 0) {
        const rootProfileDocs = newProfileUrls.map(profileUrl => {
          const username = profileUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/)?.[1] || '';
          return {
            sessionId: session._id,
            username: username.toLowerCase(),
            profileUrl,
            depth: 0,
            status: 'pending'
          };
        });
        
        await RootProfileScraped.insertMany(rootProfileDocs);
      }
      
      // Log already scraped profiles that will be skipped
      if (alreadyScrapedProfiles.length > 0) {
        logger.info(`Skipping ${alreadyScrapedProfiles.length} already scraped profiles:`, 
          alreadyScrapedProfiles.map(p => p.username).join(', '));
      }
      
      logger.info(`Session created: ${session.name} - Public: ${publicProfileUrls.length}, Private Filtered: ${privateProfileUrls.length}, New: ${newProfileUrls.length}, Already Scraped: ${alreadyScrapedProfiles.length}, Failed to Retry: ${failedProfiles.length}`);
      
      // Automatically start batch processing for the session
      logger.info(`Auto-starting BATCH processing for session: ${session._id}`);
      logger.info(`Profiles will be processed in batches of ${batchConfig.BATCH_SIZE}`);
      
      batchScrapingService.processSessionInBatches(session._id.toString())
        .then((results) => {
          logger.info(`Session ${session._id} batch processing completed:`, results);
        })
        .catch(error => {
          logger.error(`Session ${session._id} batch processing failed:`, error);
        });
      
      res.status(201).json({
        success: true,
        data: session,
        message: `Processing ${newProfileUrls.length + failedProfiles.length} profiles (${alreadyScrapedProfiles.length} already scraped, ${privateProfileUrls.length} private filtered)`,
        profilesInfo: {
          submitted: rootProfiles.length,
          public: publicProfileUrls.length,
          private: privateProfileUrls.length,
          notFound: notFoundProfiles.length,
          alreadyScraped: alreadyScrapedProfiles.length,
          failedToRetry: failedProfiles.length,
          new: newProfileUrls.length,
          toProcess: profilesToProcess.length,
          filteredPrivateProfiles: privateProfileUrls.map(url => url.match(/instagram\.com\/([^\/]+)/)?.[1] || ''),
          skippedProfiles: alreadyScrapedProfiles.map(p => ({
            username: p.username,
            profileUrl: p.profileUrl,
            status: p.status,
            scrapedAt: p.scrapedAt
          })),
          retryingProfiles: failedProfiles.map(p => p.username)
        }
      });
    } catch (error) {
      logger.error('Error creating session:', error);
      next(error);
    }
  },
  
  // Get all sessions
  async getAllSessions(req, res, next) {
    try {
      const { status, limit = 20, offset = 0, sort = '-createdAt' } = req.query;
      
      // Build query
      const query = {};
      if (status) {
        query.status = status;
      }
      
      // Get sessions with pagination
      const sessions = await Session.find(query)
        .sort(sort)
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .select('-__v');
      
      const total = await Session.countDocuments(query);
      
      res.status(200).json({
        success: true,
        data: sessions,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error('Error fetching sessions:', error);
      next(error);
    }
  },
  
  // Get session details by ID
  async getSessionById(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id).select('-__v');
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Get additional statistics
      const [rootProfileStats, relatedProfileStats] = await Promise.all([
        RootProfileScraped.aggregate([
          { $match: { sessionId: session._id } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        RelatedProfileScraped.getDepthStats(session._id)
      ]);
      
      // Format stats
      const profileStats = {
        rootProfiles: rootProfileStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        relatedProfiles: relatedProfileStats
      };
      
      res.status(200).json({
        success: true,
        data: {
          session,
          profileStats
        }
      });
    } catch (error) {
      logger.error('Error fetching session:', error);
      next(error);
    }
  },
  
  // Update session status
  async updateSessionStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Validate status transition
      const currentStatus = session.status;
      const invalidTransitions = {
        'pending': ['completed'],
        'completed': ['pending', 'running', 'paused'],
        'failed': ['pending', 'running', 'paused']
      };
      
      if (invalidTransitions[currentStatus]?.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot transition from '${currentStatus}' to '${status}'`,
            status: 400
          }
        });
      }
      
      // Update status based on action
      let message = '';
      switch (status) {
        case 'running':
          if (currentStatus === 'pending') {
            await session.start();
            message = 'Session started successfully';
          } else if (currentStatus === 'paused') {
            session.status = 'running';
            await session.save();
            message = 'Session resumed successfully';
          }
          break;
          
        case 'paused':
          await session.pause();
          message = 'Session paused successfully';
          break;
          
        case 'completed':
          await session.complete();
          message = 'Session marked as completed';
          break;
          
        case 'failed':
          await session.fail(req.body.error || 'Manual stop');
          message = 'Session marked as failed';
          break;
      }
      
      logger.info(`Session ${id} status updated from ${currentStatus} to ${status}`);
      
      // Emit status change via Socket.IO
      socketService.emitSessionStatusChange(id, status, currentStatus);
      
      res.status(200).json({
        success: true,
        data: session,
        message
      });
    } catch (error) {
      logger.error('Error updating session status:', error);
      next(error);
    }
  },
  
  // Delete a session (soft delete - just marks as deleted)
  async deleteSession(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Don't delete running sessions
      if (session.status === 'running') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Cannot delete a running session. Please pause or stop it first.',
            status: 400
          }
        });
      }
      
      // Perform hard delete - remove from database
      await session.deleteOne();
      
      // Also clean up related data
      await Promise.all([
        RootProfileScraped.deleteMany({ sessionId: id }),
        RelatedProfileScraped.deleteMany({ sessionId: id })
      ]);
      
      logger.info(`Session ${id} and related data deleted from database`);
      
      res.status(200).json({
        success: true,
        message: 'Session deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting session:', error);
      next(error);
    }
  },
  
  // Get session statistics
  async getSessionStats(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Get detailed statistics
      const [
        totalRootProfiles,
        scrapedRootProfiles,
        totalRelatedProfiles,
        profilesByDepth,
        topInfluencers
      ] = await Promise.all([
        RootProfileScraped.countDocuments({ sessionId: session._id }),
        RootProfileScraped.countDocuments({ sessionId: session._id, status: 'scraped' }),
        RelatedProfileScraped.countDocuments({ sessionId: session._id }),
        RelatedProfileScraped.getDepthStats(session._id),
        RelatedProfileScraped.getTopInfluencers(session._id, 10)
      ]);
      
      const stats = {
        session: {
          name: session.name,
          status: session.status,
          progress: session.progressPercentage,
          duration: session.duration
        },
        profiles: {
          total: totalRootProfiles + totalRelatedProfiles,
          rootProfiles: {
            total: totalRootProfiles,
            scraped: scrapedRootProfiles
          },
          relatedProfiles: {
            total: totalRelatedProfiles,
            byDepth: profilesByDepth
          }
        },
        topInfluencers
      };
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching session stats:', error);
      next(error);
    }
  },
  
  // Start batch processing for a session
  async startBatchProcessing(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      if (session.status !== 'pending' && session.status !== 'paused') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot start batch processing for session in '${session.status}' status`,
            status: 400
          }
        });
      }
      
      // Start batch processing
      logger.info(`Starting batch processing for session ${id}`);
      logger.info(`Batch size: ${batchConfig.BATCH_SIZE}, Delay between batches: ${batchConfig.DELAY_BETWEEN_BATCHES}ms`);
      
      // Start batch processing in the background using the new batch scraping service
      batchScrapingService.processSessionInBatches(session._id.toString())
        .then(results => {
          logger.info(`Batch processing completed for session ${id}:`, results);
        })
        .catch(error => {
          logger.error(`Batch processing failed for session ${id}:`, error);
        });
      
      res.status(200).json({
        success: true,
        data: session,
        message: 'Batch processing started successfully'
      });
    } catch (error) {
      logger.error('Error starting batch processing:', error);
      next(error);
    }
  },
  
  // Get batch processing status
  async getBatchProcessingStatus(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Get profiles status counts
      const [pending, scraped, failed, skipped] = await Promise.all([
        RootProfileScraped.countDocuments({ sessionId: id, status: 'pending' }),
        RootProfileScraped.countDocuments({ sessionId: id, status: 'scraped' }),
        RootProfileScraped.countDocuments({ sessionId: id, status: 'failed' }),
        RootProfileScraped.countDocuments({ sessionId: id, status: 'skipped' })
      ]);
      
      const total = pending + scraped + failed + skipped;
      const processed = scraped + failed + skipped;
      
      res.status(200).json({
        success: true,
        data: {
          sessionStatus: session.status,
          batchConfig: {
            batchSize: batchConfig.BATCH_SIZE,
            delayBetweenBatches: batchConfig.DELAY_BETWEEN_BATCHES,
            delayBetweenProfiles: batchConfig.DELAY_BETWEEN_PROFILES
          },
          profiles: {
            total,
            processed,
            pending,
            scraped,
            failed,
            skipped,
            progress: total > 0 ? Math.round((processed / total) * 100) : 0
          },
          estimatedTimeRemaining: pending > 0 ? 
            Math.round((pending * (batchConfig.DELAY_BETWEEN_PROFILES + 20000) + 
            Math.ceil(pending / batchConfig.BATCH_SIZE) * batchConfig.DELAY_BETWEEN_BATCHES) / 60000) : 0
        }
      });
    } catch (error) {
      logger.error('Error fetching batch processing status:', error);
      next(error);
    }
  },
  
  // Extract related profiles from root profiles
  async extractRelatedProfiles(req, res, next) {
    try {
      const { id } = req.params;
      const { maxDepth } = req.body;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      logger.info(`Extracting related profiles for session ${id}`);
      
      const results = await relatedProfilesService.extractRelatedProfiles(
        id,
        maxDepth || session.config.maxDepth || 2
      );
      
      res.status(200).json({
        success: true,
        data: results,
        message: `Extracted and queued ${results.queuedForScraping} related profiles`
      });
    } catch (error) {
      logger.error('Error extracting related profiles:', error);
      next(error);
    }
  },
  
  // Get related profiles statistics
  async getRelatedProfilesStats(req, res, next) {
    try {
      const { id } = req.params;
      
      const stats = await relatedProfilesService.getExtractionStats(id);
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching related profiles stats:', error);
      next(error);
    }
  },
  
  // Start depth processing for a session
  async startDepthProcessing(req, res, next) {
    try {
      const { id } = req.params;
      const { maxDepth, maxProfilesPerDepth } = req.body;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      logger.info(`Starting depth processing for session ${id}`);
      
      // Start depth processing in the background
      depthProcessingService.processAllDepths(id, {
        maxDepth: maxDepth || session.config.maxDepth,
        maxProfilesPerDepth: maxProfilesPerDepth || session.config.maxProfilesPerDepth
      }).catch(error => {
        logger.error(`Depth processing failed for session ${id}:`, error);
      });
      
      res.status(200).json({
        success: true,
        message: 'Depth processing started successfully',
        data: {
          sessionId: id,
          maxDepth: maxDepth || session.config.maxDepth,
          maxProfilesPerDepth: maxProfilesPerDepth || session.config.maxProfilesPerDepth
        }
      });
    } catch (error) {
      logger.error('Error starting depth processing:', error);
      next(error);
    }
  },
  
  // Get depth processing status
  async getDepthProcessingStatus(req, res, next) {
    try {
      const { id } = req.params;
      
      const status = await depthProcessingService.getDepthStatus(id);
      
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error fetching depth processing status:', error);
      next(error);
    }
  },
  
  // Start batch processing using queue system
  async startQueuedBatchProcessing(req, res, next) {
    try {
      const { id } = req.params;
      const { priority, retryAttempts, retryDelay, monitor } = req.body;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      if (session.status !== 'pending' && session.status !== 'paused') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot start processing for session in '${session.status}' status`,
            status: 400
          }
        });
      }
      
      // Start the session
      await session.start();
      
      logger.info(`Starting queued batch processing for session ${id}`);
      
      // Process using queue system
      const result = await queuedBatchProcessingService.processRootProfilesWithQueue(
        session._id.toString(),
        session.rootProfiles,
        {
          priority: priority || 1,
          retryAttempts: retryAttempts || 3,
          retryDelay: retryDelay || 5000,
          monitor: monitor !== false
        }
      );
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Queued batch processing started successfully'
      });
    } catch (error) {
      logger.error('Error starting queued batch processing:', error);
      next(error);
    }
  },
  
  // Get session queue statistics
  async getSessionQueueStats(req, res, next) {
    try {
      const { id } = req.params;
      
      const stats = await queuedBatchProcessingService.getSessionQueueStats(id);
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching session queue stats:', error);
      next(error);
    }
  },
  
  // Pause session queue processing
  async pauseSessionQueue(req, res, next) {
    try {
      const { id } = req.params;
      
      const result = await queuedBatchProcessingService.pauseSession(id);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Session queue processing paused successfully'
      });
    } catch (error) {
      logger.error('Error pausing session queue:', error);
      next(error);
    }
  },
  
  // Resume session queue processing
  async resumeSessionQueue(req, res, next) {
    try {
      const { id } = req.params;
      
      const result = await queuedBatchProcessingService.resumeSession(id);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Session queue processing resumed successfully'
      });
    } catch (error) {
      logger.error('Error resuming session queue:', error);
      next(error);
    }
  },

  // Stop session and clear all related queues
  async stopSession(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      logger.info(`Stopping session ${id} and clearing all queues`);
      
      // Stop the session by updating status
      session.status = 'stopped';
      await session.save();
      
      // Clear all queues for this session
      const result = await queuedBatchProcessingService.stopAndClearSession(id);
      
      res.status(200).json({
        success: true,
        data: {
          sessionId: id,
          status: 'stopped',
          queuesCleared: result.clearedJobs,
          message: 'Session stopped and all queues cleared'
        }
      });
    } catch (error) {
      logger.error('Error stopping session:', error);
      next(error);
    }
  },

  // Manually check and update session completion
  async checkCompletion(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      logger.info(`Manual completion check requested for session ${id}`);
      
      const sessionCompletionService = require('../services/sessionCompletionService');
      const wasCompleted = await sessionCompletionService.checkAndUpdateSessionCompletion(id);
      
      if (wasCompleted) {
        return res.status(200).json({
          success: true,
          message: 'Session has been marked as completed',
          data: {
            sessionId: id,
            status: 'completed'
          }
        });
      } else {
        // Get updated session to return current status
        const updatedSession = await Session.findById(id);
        const sessionData = updatedSession.toObject({ virtuals: true });
        
        return res.status(200).json({
          success: true,
          message: 'Session is not yet complete',
          data: {
            sessionId: id,
            status: updatedSession.status,
            progressPercentage: sessionData.progressPercentage,
            reason: 'Session still has pending work or active jobs'
          }
        });
      }
    } catch (error) {
      logger.error('Error checking session completion:', error);
      next(error);
    }
  },

  // Pause session
  async pauseSession(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Check if session can be paused
      if (session.status !== 'running') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot pause session with status '${session.status}'`,
            status: 400
          }
        });
      }
      
      // Pause the session
      await session.pause();
      
      // Emit socket event
      const socketService = require('../services/socketService');
      socketService.emitSessionUpdate(id, { status: 'paused' });
      
      res.status(200).json({
        success: true,
        data: {
          _id: session._id,
          status: 'paused'
        },
        message: 'Session paused successfully'
      });
    } catch (error) {
      logger.error('Error pausing session:', error);
      next(error);
    }
  },

  // Resume session
  async resumeSession(req, res, next) {
    try {
      const { id } = req.params;
      
      const session = await Session.findById(id);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      // Check if session can be resumed
      if (session.status !== 'paused') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot resume session with status '${session.status}'`,
            status: 400
          }
        });
      }
      
      // Resume the session
      session.status = 'running';
      await session.save();
      
      // Emit socket event
      const socketService = require('../services/socketService');
      socketService.emitSessionUpdate(id, { status: 'running' });
      
      res.status(200).json({
        success: true,
        data: {
          _id: session._id,
          status: 'running'
        },
        message: 'Session resumed successfully'
      });
    } catch (error) {
      logger.error('Error resuming session:', error);
      next(error);
    }
  }
};

module.exports = sessionController;