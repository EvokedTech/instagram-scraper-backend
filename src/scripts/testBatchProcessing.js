require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// Test profiles - using provided Instagram accounts
const TEST_PROFILES = [
  'https://www.instagram.com/soy_loruga/',
  'https://www.instagram.com/lowbri22/',
  'https://www.instagram.com/mary.katee_/'
];

async function testBatchProcessing() {
  try {
    logger.info('Starting batch processing test');
    
    // 1. Create a new session
    logger.info('Creating test session...');
    const createSessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
      name: `Batch Test Session - ${new Date().toISOString()}`,
      description: 'Testing batch processing functionality',
      rootProfiles: TEST_PROFILES,
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 10,
        analysisEnabled: true
      }
    });
    
    const session = createSessionResponse.data.data;
    logger.info(`Session created: ${session._id}`);
    
    // 2. Start batch processing
    logger.info('Starting batch processing...');
    const batchProcessResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/batch-process`,
      {
        batchSize: 2, // Process 2 profiles at a time
        maxConcurrentRequests: 2
      }
    );
    
    logger.info('Batch processing started:', batchProcessResponse.data.message);
    
    // 3. Monitor batch processing status
    logger.info('Monitoring batch processing status...');
    let isProcessing = true;
    let lastStatus = null;
    
    while (isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      try {
        const statusResponse = await axios.get(
          `${API_BASE_URL}/api/sessions/${session._id}/batch-status`
        );
        
        const status = statusResponse.data.data;
        
        // Log progress if changed
        if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
          logger.info('Batch processing status:', {
            sessionStatus: status.sessionStatus,
            progress: `${status.progress}%`,
            profiles: status.profiles,
            duration: status.duration ? `${Math.round(status.duration / 1000)}s` : 'N/A'
          });
          lastStatus = status;
        }
        
        // Check if processing is complete
        if (['completed', 'failed', 'completed_with_errors'].includes(status.sessionStatus)) {
          isProcessing = false;
          logger.info('Batch processing completed');
        }
      } catch (error) {
        logger.error('Error checking status:', error.message);
      }
    }
    
    // 4. Get final session statistics
    logger.info('Fetching final session statistics...');
    const statsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/stats`
    );
    
    const stats = statsResponse.data.data;
    logger.info('Final session statistics:', {
      totalProfiles: stats.profiles.total,
      rootProfiles: stats.profiles.rootProfiles,
      relatedProfiles: stats.profiles.relatedProfiles,
      duration: stats.session.duration ? `${Math.round(stats.session.duration / 1000)}s` : 'N/A'
    });
    
    // 5. Test re-scraping prevention
    logger.info('Testing re-scraping prevention...');
    const reScrapeResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/batch-process`,
      {
        batchSize: 2
      }
    ).catch(error => {
      logger.info('Re-scraping prevented as expected:', error.response?.data?.error || error.message);
      return null;
    });
    
    if (reScrapeResponse) {
      logger.warn('Re-scraping was not prevented!');
    }
    
    logger.info('Batch processing test completed successfully');
    
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
      return testBatchProcessing();
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

module.exports = testBatchProcessing;