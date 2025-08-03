const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const batchProcessingService = require('../services/batchProcessingService');
const relatedProfilesService = require('../services/relatedProfilesService');
const depthProcessingService = require('../services/depthProcessingService');
const queuedBatchProcessingService = require('../services/queuedBatchProcessingService');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');

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
      
      // Create new session
      const session = new Session({
        name,
        description,
        rootProfiles,
        config: {
          maxDepth: config?.maxDepth || 2,
          maxProfilesPerDepth: config?.maxProfilesPerDepth === null ? null : (config?.maxProfilesPerDepth || 100),
          analysisEnabled: config?.analysisEnabled !== false
        },
        status: 'pending',
        stats: {
          totalProfiles: rootProfiles.length,
          scrapedProfiles: 0,
          currentDepth: 0
        }
      });
      
      await session.save();
      
      // Check which root profiles already exist in the database (from any session)
      const existingProfiles = await RootProfileScraped.find({
        profileUrl: { $in: rootProfiles },
        status: 'scraped'
      }).select('profileUrl profileData');
      
      const existingUrlsSet = new Set(existingProfiles.map(p => p.profileUrl));
      
      // Create pending root profile records only for non-existing profiles
      const newProfileUrls = rootProfiles.filter(url => !existingUrlsSet.has(url));
      
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
      
      // Extract related profiles from existing profiles
      let extractedRelatedCount = 0;
      for (const existingProfile of existingProfiles) {
        if (existingProfile.profileData?.relatedProfiles?.length > 0) {
          extractedRelatedCount += existingProfile.profileData.relatedProfiles.length;
          // Related profiles will be processed when the queue starts
        }
      }
      
      logger.info(`Session created: ${session.name} - Total: ${rootProfiles.length}, New: ${newProfileUrls.length}, Existing: ${existingProfiles.length}`);
      
      res.status(201).json({
        success: true,
        data: session,
        message: `Session created successfully with ${rootProfiles.length} root profiles`,
        profilesInfo: {
          total: rootProfiles.length,
          existing: existingProfiles.length,
          new: newProfileUrls.length,
          existingProfiles: existingProfiles.map(p => ({
            username: p.profileUrl.match(/instagram\.com\/([^\/]+)/)?.[1] || '',
            profileUrl: p.profileUrl,
            relatedProfilesCount: p.profileData?.relatedProfiles?.length || 0
          }))
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
      const { batchSize, maxConcurrentRequests } = req.body;
      
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
      
      // Start the session
      await session.start();
      
      logger.info(`Starting batch processing for session ${id}`);
      
      // Start batch processing in the background
      batchProcessingService.processRootProfilesBatch(
        session._id.toString(),
        session.rootProfiles,
        {
          batchSize: batchSize || undefined,
          maxConcurrentRequests: maxConcurrentRequests || undefined
        }
      ).catch(error => {
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
      
      const status = await batchProcessingService.getBatchStatus(id);
      
      if (!status.sessionStatus) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Session not found',
            status: 404
          }
        });
      }
      
      res.status(200).json({
        success: true,
        data: status
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
  }
};

module.exports = sessionController;