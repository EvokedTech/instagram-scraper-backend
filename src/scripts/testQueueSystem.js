require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// Test profiles
const TEST_PROFILES = [
  'https://www.instagram.com/soy_loruga/',
  'https://www.instagram.com/lowbri22/',
  'https://www.instagram.com/mary.katee_/'
];

async function testQueueSystem() {
  try {
    logger.info('Starting queue system test');
    
    // 1. Check queue status
    logger.info('Checking initial queue status...');
    const queuesStatusResponse = await axios.get(`${API_BASE_URL}/api/queues/status`);
    logger.info('Initial queues status:', queuesStatusResponse.data.data);
    
    // 2. Create a new session
    logger.info('Creating test session...');
    const createSessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
      name: `Queue Test Session - ${new Date().toISOString()}`,
      description: 'Testing Bull queue system with Redis',
      rootProfiles: TEST_PROFILES,
      config: {
        maxDepth: 2,
        maxProfilesPerDepth: 30,
        analysisEnabled: true
      }
    });
    
    const session = createSessionResponse.data.data;
    logger.info(`Session created: ${session._id}`);
    
    // 3. Start queued batch processing
    logger.info('Starting queued batch processing...');
    const queueProcessResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/queue-process`,
      {
        priority: 1,
        retryAttempts: 3,
        retryDelay: 5000,
        monitor: true
      }
    );
    
    logger.info('Queue processing started:', queueProcessResponse.data.data);
    
    // 4. Monitor queue progress
    logger.info('Monitoring queue progress...');
    let isProcessing = true;
    let checkCount = 0;
    
    while (isProcessing && checkCount < 30) { // Max 5 minutes
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      checkCount++;
      
      // Get queue stats
      const queueStatsResponse = await axios.get(
        `${API_BASE_URL}/api/sessions/${session._id}/queue-stats`
      );
      
      const queueStats = queueStatsResponse.data.data;
      logger.info('Queue stats:', queueStats);
      
      // Get session status
      const sessionStatusResponse = await axios.get(
        `${API_BASE_URL}/api/sessions/${session._id}`
      );
      
      const sessionData = sessionStatusResponse.data.data.session;
      logger.info('Session progress:', {
        status: sessionData.status,
        progress: `${sessionData.progressPercentage}%`,
        scrapedProfiles: sessionData.stats.scrapedProfiles,
        totalProfiles: sessionData.stats.totalProfiles
      });
      
      // Check specific queue metrics
      const rootQueueMetrics = await axios.get(
        `${API_BASE_URL}/api/queues/rootProfileQueue/metrics`
      );
      logger.info('Root profile queue metrics:', rootQueueMetrics.data.data);
      
      // Check if processing is complete
      if (queueStats.waiting === 0 && queueStats.active === 0 && 
          (queueStats.completed > 0 || queueStats.failed > 0)) {
        isProcessing = false;
        logger.info('Queue processing completed');
      }
    }
    
    // 5. Test pause/resume functionality
    logger.info('Testing pause/resume functionality...');
    
    // Create another session for pause/resume test
    const pauseTestSession = await axios.post(`${API_BASE_URL}/api/sessions`, {
      name: `Pause/Resume Test - ${new Date().toISOString()}`,
      rootProfiles: TEST_PROFILES.concat([
        'https://www.instagram.com/instagram/',
        'https://www.instagram.com/natgeo/'
      ]),
      config: { maxDepth: 1 }
    });
    
    // Start processing
    await axios.post(
      `${API_BASE_URL}/api/sessions/${pauseTestSession.data.data._id}/queue-process`
    );
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Pause
    const pauseResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${pauseTestSession.data.data._id}/queue-pause`
    );
    logger.info('Pause response:', pauseResponse.data);
    
    // Check queue status
    const pausedStats = await axios.get(
      `${API_BASE_URL}/api/sessions/${pauseTestSession.data.data._id}/queue-stats`
    );
    logger.info('Queue stats after pause:', pausedStats.data.data);
    
    // Resume
    const resumeResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${pauseTestSession.data.data._id}/queue-resume`
    );
    logger.info('Resume response:', resumeResponse.data);
    
    // 6. Test job retry functionality
    logger.info('Testing job retry functionality...');
    
    // Get failed jobs if any
    const failedJobsResponse = await axios.get(
      `${API_BASE_URL}/api/queues/rootProfileQueue/jobs?state=failed&start=0&end=10`
    );
    
    if (failedJobsResponse.data.data.length > 0) {
      const failedJob = failedJobsResponse.data.data[0];
      logger.info(`Retrying failed job ${failedJob.id}...`);
      
      const retryResponse = await axios.post(
        `${API_BASE_URL}/api/queues/rootProfileQueue/jobs/${failedJob.id}/retry`
      );
      logger.info('Retry response:', retryResponse.data);
    } else {
      logger.info('No failed jobs to retry');
    }
    
    // 7. Get final statistics
    logger.info('Fetching final statistics...');
    
    const finalQueuesStatus = await axios.get(`${API_BASE_URL}/api/queues/status`);
    logger.info('Final queues status:', finalQueuesStatus.data.data);
    
    const finalSessionStats = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/stats`
    );
    logger.info('Final session statistics:', {
      totalProfiles: finalSessionStats.data.data.profiles.total,
      rootProfiles: finalSessionStats.data.data.profiles.rootProfiles,
      relatedProfiles: finalSessionStats.data.data.profiles.relatedProfiles
    });
    
    logger.info('Queue system test completed successfully');
    
  } catch (error) {
    if (error.response) {
      logger.error('Test failed with HTTP error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else {
      logger.error('Test failed:', error.message);
    }
    throw error;
  }
}

// Run test if executed directly
if (require.main === module) {
  logger.info('Connecting to database...');
  
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/instagram-scraper')
    .then(() => {
      logger.info('Database connected');
      return testQueueSystem();
    })
    .then(() => {
      logger.info('Test completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testQueueSystem;