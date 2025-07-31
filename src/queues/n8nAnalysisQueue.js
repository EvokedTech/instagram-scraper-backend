const Queue = require('bull');
const mongoose = require('mongoose');
const n8nWebhookService = require('../services/n8n/N8nWebhookService');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const Session = require('../models/Session');
const depthProgressService = require('../services/depthProgressService');
const logger = require('../utils/logger');
const { getIO } = require('../socket');
const { getBullQueueOptions } = require('../config/redisClients');

// Get shared queue options
const queueOptions = getBullQueueOptions();

// Create n8n analysis queue with concurrency of 1
const n8nAnalysisQueue = queueOptions ? new Queue('n8n-analysis', {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
}) : null;

// Process profiles sequentially - CONCURRENCY OF 1
if (n8nAnalysisQueue) {
  n8nAnalysisQueue.process(1, async (job) => {
  const { profileId, sessionId, username, depth } = job.data;
  const startTime = Date.now();

  logger.info(`Processing profile for n8n analysis: ${username} (depth: ${depth})`);

  try {
    // Update job progress
    await job.progress(10);

    // Fetch the scraped profile data
    const scrapedProfile = await RelatedProfileScraped.findById(profileId)
      .select('-relatedProfiles -igtvVideos -IgtvVideos');
    
    if (!scrapedProfile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    await job.progress(20);

    // Check if already sent to n8n
    if (scrapedProfile.n8nProcessed) {
      logger.info(`Profile ${username} already sent to n8n`);
      
      // Emit update to frontend
      const io = getIO();
      if (io) {
        io.to(sessionId.toString()).emit('analysis:duplicate', {
          profileId,
          username,
          message: 'Profile already sent to n8n'
        });
      }

      return {
        success: true,
        reason: 'Already processed',
        username
      };
    }

    await job.progress(40);

    // Emit start event to frontend
    const io = getIO();
    if (io) {
      io.to(sessionId.toString()).emit('analysis:started', {
        profileId,
        username,
        depth
      });
    }

    // Send profile data to n8n webhook
    const webhookResult = await n8nWebhookService.sendProfileData(scrapedProfile);
    await job.progress(70);

    if (webhookResult.success) {
      // Extract analysis result
      const analysisResult = webhookResult.analysisResult || {};
      const isStored = analysisResult.status === 'stored';
      const isSkipped = analysisResult.status === 'skipped';
      const adultContentScore = analysisResult.adultContentScore || 0;
      
      // Mark profile as processed with analysis results
      scrapedProfile.n8nProcessed = true;
      scrapedProfile.n8nProcessedAt = new Date();
      scrapedProfile.n8nAnalysisResult = {
        status: analysisResult.status || 'unknown',
        adultContentScore: adultContentScore,
        reason: isSkipped ? 'low_adult_score' : (isStored ? 'adult_content' : 'unknown'),
        isAdultCreator: adultContentScore > 30,
        markAsStored: analysisResult.markAsStored || false,
        markAsSkipped: analysisResult.markAsSkipped || false,
        analyzedAt: new Date()
      };
      await scrapedProfile.save();
      
      await job.progress(90);

      // Emit specific event based on result
      if (io) {
        if (isStored) {
          io.to(sessionId.toString()).emit('analysis:stored', {
            profileId,
            username,
            adultContentScore,
            processingTime: Date.now() - startTime
          });
        } else if (isSkipped) {
          io.to(sessionId.toString()).emit('analysis:skipped', {
            profileId,
            username,
            adultContentScore,
            reason: 'low_adult_score',
            processingTime: Date.now() - startTime
          });
        }
        
        io.to(sessionId.toString()).emit('analysis:completed', {
          profileId,
          username,
          status: analysisResult.status,
          adultContentScore,
          processingTime: Date.now() - startTime
        });

        // Emit overall progress update
        const stats = await getSessionAnalysisStats(sessionId);
        io.to(sessionId.toString()).emit('analysis:progress', stats);
      }

      logger.info(`Successfully processed profile through n8n: ${username}`, {
        profileId,
        status: analysisResult.status,
        adultContentScore,
        isStored,
        isSkipped,
        processingTime: Date.now() - startTime
      });

      // Update depth analysis progress
      await depthProgressService.updateAnalysisProgress(sessionId, depth);

      return {
        success: true,
        profileId,
        username,
        status: analysisResult.status,
        adultContentScore,
        processingTime: Date.now() - startTime
      };

    } else {
      // Webhook failed
      // Emit failure event to frontend
      if (io) {
        io.to(sessionId.toString()).emit('analysis:failed', {
          profileId,
          username,
          error: webhookResult.error
        });

        // Emit overall progress update
        const stats = await getSessionAnalysisStats(sessionId);
        io.to(sessionId.toString()).emit('analysis:progress', stats);
      }

      throw new Error(`Webhook failed: ${webhookResult.error}`);
    }

  } catch (error) {
    logger.error(`n8n analysis processor error for ${username}:`, error);

    // Emit error event to frontend
    const io = getIO();
    if (io) {
      io.to(sessionId.toString()).emit('analysis:error', {
        profileId,
        username,
        error: error.message
      });
    }

    throw error;
  }
  });
}

// Get session analysis statistics
async function getSessionAnalysisStats(sessionId) {
  try {
    const [
      totalScraped,
      totalProcessed,
      totalPending,
      totalStored,
      totalSkipped,
      adultCreatorStats,
      session
    ] = await Promise.all([
      RelatedProfileScraped.countDocuments({ sessionId, status: 'scraped' }),
      RelatedProfileScraped.countDocuments({ sessionId, n8nProcessed: true }),
      RelatedProfileScraped.countDocuments({ sessionId, status: 'scraped', n8nProcessed: { $ne: true } }),
      RelatedProfileScraped.countDocuments({ sessionId, 'n8nAnalysisResult.status': 'stored' }),
      RelatedProfileScraped.countDocuments({ sessionId, 'n8nAnalysisResult.status': 'skipped' }),
      RelatedProfileScraped.aggregate([
        { $match: { sessionId: new mongoose.Types.ObjectId(sessionId), n8nProcessed: true } },
        {
          $group: {
            _id: null,
            avgAdultScore: { $avg: '$n8nAnalysisResult.adultContentScore' },
            minAdultScore: { $min: '$n8nAnalysisResult.adultContentScore' },
            maxAdultScore: { $max: '$n8nAnalysisResult.adultContentScore' },
            adultCreators: {
              $sum: {
                $cond: [{ $gt: ['$n8nAnalysisResult.adultContentScore', 30] }, 1, 0]
              }
            }
          }
        }
      ]),
      Session.findById(sessionId)
    ]);

    const queueStats = await getQueueStats();
    const adultStats = adultCreatorStats[0] || { avgAdultScore: 0, minAdultScore: 0, maxAdultScore: 0, adultCreators: 0 };

    // Get depth progress if session exists
    const depthProgress = session ? await depthProgressService.getDetailedProgress(sessionId) : null;

    return {
      totalScraped,
      totalAnalyzed: totalProcessed,
      totalPending,
      totalStored,
      totalSkipped,
      percentComplete: totalScraped > 0 ? Math.round((totalProcessed / totalScraped) * 100) : 0,
      breakdown: {
        storedAdultCreators: totalStored,
        skippedLowScore: totalSkipped,
        adultContentStats: {
          average: Math.round(adultStats.avgAdultScore || 0),
          min: adultStats.minAdultScore || 0,
          max: adultStats.maxAdultScore || 0,
          threshold: 30
        }
      },
      queue: queueStats,
      depthProgress: depthProgress ? depthProgress.depthDetails : []
    };
  } catch (error) {
    logger.error('Failed to get session analysis stats:', error);
    return {
      totalScraped: 0,
      totalAnalyzed: 0,
      totalPending: 0,
      totalStored: 0,
      totalSkipped: 0,
      percentComplete: 0,
      breakdown: {
        storedAdultCreators: 0,
        skippedLowScore: 0,
        adultContentStats: {
          average: 0,
          min: 0,
          max: 0,
          threshold: 30
        }
      },
      queue: { waiting: 0, active: 0 },
      depthProgress: []
    };
  }
}

// Queue event handlers
if (n8nAnalysisQueue) {
  // Increase max listeners to prevent warnings
  if (n8nAnalysisQueue.setMaxListeners) {
    n8nAnalysisQueue.setMaxListeners(15);
  }
  
  n8nAnalysisQueue.on('completed', (job, result) => {
    logger.info(`n8n analysis job completed for ${result.username}`, {
      jobId: job.id,
      processingTime: result.processingTime
    });
  });

  n8nAnalysisQueue.on('failed', (job, error) => {
    logger.error(`n8n analysis job failed for ${job.data.username}`, {
      jobId: job.id,
      error: error.message,
      attempts: job.attemptsMade
    });
  });

  n8nAnalysisQueue.on('stalled', (job) => {
    logger.warn(`n8n analysis job stalled for ${job.data.username}`, {
      jobId: job.id
    });
  });
}

// Helper functions
async function queueProfileForN8nAnalysis(profileId, sessionId, username, depth) {
  if (!n8nAnalysisQueue) {
    logger.warn('n8n analysis queue not available (Redis not configured)');
    return null;
  }
  
  try {
    const job = await n8nAnalysisQueue.add({
      profileId,
      sessionId,
      username,
      depth
    });

    logger.info(`Queued profile for n8n analysis: ${username}`, {
      jobId: job.id,
      profileId,
      depth
    });

    return job;
  } catch (error) {
    logger.error(`Failed to queue profile for n8n analysis: ${username}`, error);
    throw error;
  }
}

async function queueAllScrapedProfiles(sessionId) {
  if (!n8nAnalysisQueue) {
    logger.warn('n8n analysis queue not available (Redis not configured)');
    return { queued: 0, total: 0 };
  }
  
  try {
    // Find all scraped profiles that haven't been sent to n8n
    const profiles = await RelatedProfileScraped.find({
      sessionId,
      status: 'scraped',
      n8nProcessed: { $ne: true }
    }).select('_id username profileUrl depth');

    logger.info(`Found ${profiles.length} profiles to queue for n8n analysis`);

    const jobs = [];
    for (const profile of profiles) {
      const job = await queueProfileForN8nAnalysis(
        profile._id,
        sessionId,
        profile.username,
        profile.depth
      );
      jobs.push(job);
    }

    return jobs;
  } catch (error) {
    logger.error('Failed to queue scraped profiles:', error);
    throw error;
  }
}

async function getQueueStats() {
  if (!n8nAnalysisQueue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0
    };
  }
  
  try {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed
    ] = await Promise.all([
      n8nAnalysisQueue.getWaitingCount(),
      n8nAnalysisQueue.getActiveCount(),
      n8nAnalysisQueue.getCompletedCount(),
      n8nAnalysisQueue.getFailedCount(),
      n8nAnalysisQueue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0
    };
  }
}

async function clearQueue() {
  if (!n8nAnalysisQueue) {
    logger.warn('n8n analysis queue not available (Redis not configured)');
    return;
  }
  
  try {
    await n8nAnalysisQueue.empty();
    await n8nAnalysisQueue.clean(0, 'completed');
    await n8nAnalysisQueue.clean(0, 'failed');
    logger.info('n8n analysis queue cleared');
  } catch (error) {
    logger.error('Failed to clear queue:', error);
    throw error;
  }
}

module.exports = {
  n8nAnalysisQueue,
  queueProfileForN8nAnalysis,
  queueAllScrapedProfiles,
  getQueueStats,
  clearQueue,
  getSessionAnalysisStats
};