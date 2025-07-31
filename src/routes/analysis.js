const express = require('express');
const router = express.Router();
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const Session = require('../models/Session');
const { 
  queueProfileForN8nAnalysis, 
  queueAllScrapedProfiles, 
  getQueueStats: getN8nQueueStats,
  clearQueue: clearN8nQueue,
  getSessionAnalysisStats 
} = require('../queues/n8nAnalysisQueue');
const n8nWebhookService = require('../services/n8n/N8nWebhookService');
const logger = require('../utils/logger');

/**
 * N8N WEBHOOK ROUTES
 */

/**
 * Test n8n webhook connectivity
 */
router.get('/n8n/test-webhook', async (req, res, next) => {
  try {
    const result = await n8nWebhookService.testWebhook();
    
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    logger.error('Error testing n8n webhook:', error);
    next(error);
  }
});

/**
 * Send test profile data to n8n webhook
 */
router.post('/n8n/test-profile', async (req, res, next) => {
  try {
    // Create minimal test profile data
    const testProfile = {
      _id: 'test-' + Date.now(),
      username: 'test_user_' + Date.now(),
      sessionId: 'test-session',
      depth: 1,
      profileUrl: 'https://instagram.com/test_user',
      profileData: {
        id: '12345',
        username: 'test_user',
        fullName: 'Test User',
        biography: 'This is a test profile',
        profilePicUrl: 'https://example.com/pic.jpg',
        followersCount: 100,
        followsCount: 50,
        postsCount: 10,
        verified: false,
        isBusinessAccount: false,
        isPrivate: false,
        posts: [{
          id: 'post1',
          shortCode: 'TEST123',
          caption: 'Test post',
          hashtags: ['test'],
          mentions: [],
          url: 'https://instagram.com/p/TEST123',
          likesCount: 10,
          commentsCount: 2,
          timestamp: new Date().toISOString(),
          type: 'image',
          displayUrl: 'https://example.com/image.jpg'
        }]
      },
      scrapedAt: new Date()
    };
    
    const result = await n8nWebhookService.sendProfileData(testProfile);
    
    res.json({
      success: result.success,
      data: result,
      testData: {
        username: testProfile.username,
        postsCount: testProfile.profileData.posts.length
      }
    });
  } catch (error) {
    logger.error('Error sending test profile to n8n:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * Queue all scraped profiles for n8n analysis
 */
router.post('/n8n/queue-all', async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Queue all scraped profiles
    const jobs = await queueAllScrapedProfiles(sessionId);

    res.json({
      success: true,
      data: {
        profilesQueued: jobs.length,
        sessionId
      }
    });
  } catch (error) {
    logger.error('Error queuing profiles for n8n:', error);
    next(error);
  }
});

/**
 * Queue single profile for n8n analysis
 */
router.post('/n8n/queue-profile', async (req, res, next) => {
  try {
    const { profileId } = req.body;

    if (!profileId) {
      return res.status(400).json({
        success: false,
        error: 'Profile ID is required'
      });
    }

    // Get profile details
    const profile = await RelatedProfileScraped.findById(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    // Queue profile
    const job = await queueProfileForN8nAnalysis(
      profile._id,
      profile.sessionId,
      profile.username,
      profile.depth
    );

    res.json({
      success: true,
      data: {
        jobId: job.id,
        profileId: profile._id,
        username: profile.username
      }
    });
  } catch (error) {
    logger.error('Error queuing profile for n8n:', error);
    next(error);
  }
});

/**
 * Get n8n queue statistics
 */
router.get('/n8n/queue-stats', async (req, res, next) => {
  try {
    const stats = await getN8nQueueStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting n8n queue stats:', error);
    next(error);
  }
});

/**
 * Get session analysis statistics for n8n
 */
router.get('/n8n/session-stats/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    const stats = await getSessionAnalysisStats(sessionId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting session analysis stats:', error);
    next(error);
  }
});

/**
 * Clear n8n analysis queue
 */
router.post('/n8n/clear-queue', async (req, res, next) => {
  try {
    await clearN8nQueue();
    
    res.json({
      success: true,
      message: 'n8n analysis queue cleared'
    });
  } catch (error) {
    logger.error('Error clearing n8n queue:', error);
    next(error);
  }
});

/**
 * Get analysis status for a session
 */
router.get('/status/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    // Get session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Get n8n analysis statistics
    const stats = await getSessionAnalysisStats(sessionId);
    const queueStats = await getN8nQueueStats();
    
    // Ensure backward compatibility while providing new fields
    res.json({
      success: true,
      data: {
        sessionId,
        ...stats,
        // Ensure these fields are at the top level for the frontend
        totalAnalyzed: stats.totalAnalyzed,
        totalPendingAnalysis: stats.totalPending,
        totalStored: stats.totalStored,
        totalSkipped: stats.totalSkipped,
        percentComplete: stats.percentComplete,
        // Include breakdown for detailed view
        breakdown: stats.breakdown,
        // Queue stats in expected format
        n8nQueueStats: queueStats,
        queueStats, // Legacy support
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    logger.error('Error getting analysis status:', error);
    next(error);
  }
});

module.exports = router;