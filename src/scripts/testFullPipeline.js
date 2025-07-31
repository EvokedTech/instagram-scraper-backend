require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// Test profiles with your specific accounts
const TEST_PROFILES = [
  'https://www.instagram.com/soy_loruga/',
];

async function testFullPipeline() {
  try {
    logger.info('Starting full pipeline test with related profiles extraction');
    
    // 1. Create a new session
    logger.info('Creating test session...');
    const createSessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
      name: `Full Pipeline Test - ${new Date().toISOString()}`,
      description: 'Testing batch processing with automatic related profiles extraction',
      rootProfiles: TEST_PROFILES,
      config: {
        maxDepth: 2,
        maxProfilesPerDepth: 50,
        analysisEnabled: true
      }
    });
    
    const session = createSessionResponse.data.data;
    logger.info(`Session created: ${session._id}`);
    
    // 2. Start batch processing with related profiles extraction
    logger.info('Starting batch processing with related profiles extraction...');
    const batchProcessResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/batch-process`,
      {
        batchSize: 2,
        maxConcurrentRequests: 2,
        extractRelated: true // Enable automatic related profiles extraction
      }
    );
    
    logger.info('Batch processing started:', batchProcessResponse.data.message);
    
    // 3. Monitor batch processing
    let isProcessing = true;
    let lastStatus = null;
    
    while (isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const statusResponse = await axios.get(
          `${API_BASE_URL}/api/sessions/${session._id}/batch-status`
        );
        
        const status = statusResponse.data.data;
        
        if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
          logger.info('Batch processing status:', {
            sessionStatus: status.sessionStatus,
            progress: `${status.progress}%`,
            profiles: status.profiles
          });
          lastStatus = status;
        }
        
        if (['completed', 'failed', 'completed_with_errors'].includes(status.sessionStatus)) {
          isProcessing = false;
          logger.info('Root profiles batch processing completed');
        }
      } catch (error) {
        logger.error('Error checking status:', error.message);
      }
    }
    
    // 4. Check related profiles extraction results
    logger.info('Checking related profiles extraction results...');
    
    const relatedStatsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/related-stats`
    );
    
    const relatedStats = relatedStatsResponse.data.data;
    logger.info('Related profiles statistics:');
    relatedStats.forEach(depthStat => {
      logger.info(`  Depth ${depthStat._id}:`, {
        total: depthStat.total,
        statuses: depthStat.statuses
      });
    });
    
    // 5. Get final session statistics
    const statsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/stats`
    );
    
    const finalStats = statsResponse.data.data;
    logger.info('Final session statistics:', {
      totalProfiles: finalStats.profiles.total,
      rootProfiles: finalStats.profiles.rootProfiles,
      relatedProfiles: finalStats.profiles.relatedProfiles
    });
    
    // 6. Test deduplication by re-running extraction
    logger.info('Testing deduplication by re-extracting...');
    const reExtractResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/extract-related`
    );
    
    const reExtractResults = reExtractResponse.data.data;
    logger.info('Re-extraction results:', {
      alreadyInDatabase: reExtractResults.alreadyInDatabase,
      newProfilesQueued: reExtractResults.queuedForScraping
    });
    
    if (reExtractResults.alreadyInDatabase > 0 && reExtractResults.queuedForScraping === 0) {
      logger.info('✓ Deduplication working correctly - no new profiles queued on re-extraction');
    }
    
    logger.info('Full pipeline test completed successfully');
    
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
      return testFullPipeline();
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

module.exports = testFullPipeline;