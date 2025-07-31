require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// Test profiles - using accounts that likely have many related profiles
const TEST_PROFILES = [
  'https://www.instagram.com/soy_loruga/',
  'https://www.instagram.com/lowbri22/',
  'https://www.instagram.com/mary.katee_/'
];

async function testDepthProcessing() {
  try {
    logger.info('Starting recursive depth processing test');
    
    // 1. Create a new session with depth configuration
    logger.info('Creating test session with depth configuration...');
    const createSessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
      name: `Depth Processing Test - ${new Date().toISOString()}`,
      description: 'Testing recursive depth processing with automatic progression',
      rootProfiles: TEST_PROFILES,
      config: {
        maxDepth: 3,                  // Process 3 levels deep
        maxProfilesPerDepth: 20,      // Limit profiles per depth level
        analysisEnabled: true
      }
    });
    
    const session = createSessionResponse.data.data;
    logger.info(`Session created: ${session._id}`);
    logger.info('Configuration:', {
      maxDepth: session.config.maxDepth,
      maxProfilesPerDepth: session.config.maxProfilesPerDepth
    });
    
    // 2. Start batch processing with automatic depth processing
    logger.info('Starting batch processing with automatic depth processing...');
    const batchProcessResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/batch-process`,
      {
        batchSize: 2,
        maxConcurrentRequests: 2,
        extractRelated: true,      // Enable related profiles extraction
        processDepths: true        // Enable automatic depth processing
      }
    );
    
    logger.info('Batch processing started:', batchProcessResponse.data.message);
    
    // 3. Monitor root profiles processing
    logger.info('Monitoring root profiles processing...');
    let rootProcessingComplete = false;
    
    while (!rootProcessingComplete) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await axios.get(
        `${API_BASE_URL}/api/sessions/${session._id}/batch-status`
      );
      
      const status = statusResponse.data.data;
      logger.info('Root profiles status:', {
        sessionStatus: status.sessionStatus,
        progress: `${status.progress}%`,
        profiles: status.profiles
      });
      
      if (['completed', 'failed', 'completed_with_errors'].includes(status.sessionStatus)) {
        rootProcessingComplete = true;
        logger.info('Root profiles processing completed');
      }
    }
    
    // 4. Monitor depth processing
    logger.info('Monitoring recursive depth processing...');
    let depthProcessingActive = true;
    let lastDepthStatus = null;
    let noChangeCount = 0;
    
    while (depthProcessingActive) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
      
      try {
        const depthStatusResponse = await axios.get(
          `${API_BASE_URL}/api/sessions/${session._id}/depth-status`
        );
        
        const depthStatus = depthStatusResponse.data.data;
        
        // Log depth statistics
        logger.info('Depth processing status:', {
          currentDepth: depthStatus.currentDepth,
          maxDepth: depthStatus.maxDepth,
          sessionStatus: depthStatus.sessionStatus
        });
        
        // Log statistics for each depth
        depthStatus.depthStatistics.forEach(depth => {
          const statusCounts = {};
          depth.statuses.forEach(s => {
            statusCounts[s.status] = s.count;
          });
          
          logger.info(`  Depth ${depth._id}:`, {
            total: depth.total,
            ...statusCounts
          });
        });
        
        // Check if processing is complete or stalled
        const currentStatusString = JSON.stringify(depthStatus.depthStatistics);
        if (currentStatusString === lastDepthStatus) {
          noChangeCount++;
          if (noChangeCount >= 6) { // No change for 60 seconds
            logger.info('Depth processing appears to be complete (no changes detected)');
            depthProcessingActive = false;
          }
        } else {
          noChangeCount = 0;
          lastDepthStatus = currentStatusString;
        }
        
        // Check if we've reached max depth
        if (depthStatus.currentDepth >= depthStatus.maxDepth) {
          const pendingCount = depthStatus.depthStatistics.reduce((sum, depth) => {
            const pending = depth.statuses.find(s => s.status === 'pending');
            return sum + (pending ? pending.count : 0);
          }, 0);
          
          if (pendingCount === 0) {
            logger.info('All depths processed successfully');
            depthProcessingActive = false;
          }
        }
        
      } catch (error) {
        logger.error('Error checking depth status:', error.message);
      }
    }
    
    // 5. Get final statistics
    logger.info('Fetching final session statistics...');
    const finalStatsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/stats`
    );
    
    const finalStats = finalStatsResponse.data.data;
    logger.info('Final statistics:', {
      totalProfiles: finalStats.profiles.total,
      rootProfiles: finalStats.profiles.rootProfiles,
      relatedProfiles: finalStats.profiles.relatedProfiles
    });
    
    // 6. Get detailed depth statistics
    const relatedStatsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/related-stats`
    );
    
    const relatedStats = relatedStatsResponse.data.data;
    logger.info('Detailed depth statistics:');
    relatedStats.forEach(depth => {
      logger.info(`  Depth ${depth._id}: ${depth.total} profiles`);
    });
    
    logger.info('Recursive depth processing test completed successfully');
    
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
      return testDepthProcessing();
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

module.exports = testDepthProcessing;