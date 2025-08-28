require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const batchScrapingService = require('../services/batchScrapingService');
const logger = require('../utils/logger');

async function testFastBatchProcessing() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Create a new session directly
    const session = new Session({
      name: 'Ultra Fast Parallel Batch Test',
      description: 'Testing super fast parallel batch processing - 10 profiles at once, no delays',
      rootProfiles: [
        'https://www.instagram.com/nike',
        'https://www.instagram.com/adidas',
        'https://www.instagram.com/puma',
        'https://www.instagram.com/underarmour',
        'https://www.instagram.com/newbalance',
        'https://www.instagram.com/reebok',
        'https://www.instagram.com/asics',
        'https://www.instagram.com/fila',
        'https://www.instagram.com/champion',
        'https://www.instagram.com/vans',
        'https://www.instagram.com/converse',
        'https://www.instagram.com/jordanbrand',
        'https://www.instagram.com/nba',
        'https://www.instagram.com/espn',
        'https://www.instagram.com/sportscenter'
      ],
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 5,
        analysisEnabled: false,
        analyzeRootProfiles: false
      },
      status: 'pending',
      stats: {
        totalProfiles: 15,
        scrapedProfiles: 0
      }
    });
    
    await session.save();
    logger.info(`Created session: ${session.name} (ID: ${session._id})`);
    
    // Create root profiles directly (skip privacy check)
    const rootProfiles = session.rootProfiles.map(url => {
      const username = url.split('/').filter(Boolean).pop();
      return {
        sessionId: session._id,
        username,
        profileUrl: url,
        status: 'pending',
        depth: 0,
        isRootProfile: true,
        metadata: {}
      };
    });
    
    await RootProfileScraped.insertMany(rootProfiles);
    logger.info(`Created ${rootProfiles.length} root profiles`);
    
    // Start batch processing
    logger.info('\n========================================');
    logger.info('STARTING ULTRA FAST BATCH PROCESSING');
    logger.info('========================================');
    logger.info('Configuration:');
    logger.info('- Batch Size: 10 profiles');
    logger.info('- Parallel Processing: YES (10 concurrent)');
    logger.info('- Delay Between Profiles: 0 seconds');
    logger.info('- Delay Between Batches: 0 seconds');
    logger.info('- Total Profiles: 15');
    logger.info('- Expected Batches: 2 (10 + 5)');
    logger.info('========================================\n');
    
    const startTime = Date.now();
    
    // Process the session
    await batchScrapingService.processSessionInBatches(session._id.toString());
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    logger.info('\n========================================');
    logger.info('BATCH PROCESSING COMPLETE');
    logger.info('========================================');
    logger.info(`Total Duration: ${duration} seconds`);
    logger.info(`Average per profile: ${(duration / 15).toFixed(2)} seconds`);
    logger.info('========================================\n');
    
  } catch (error) {
    logger.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the test
testFastBatchProcessing();