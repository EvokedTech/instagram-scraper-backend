/**
 * RECOVERY SCRIPT FOR STUCK SESSIONS
 * This script finds sessions that are stuck and restarts their batch processing
 * It does NOT create new data, only processes existing pending profiles
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const batchScrapingService = require('../services/batchScrapingService');
const logger = require('../utils/logger');

async function recoverStuckSessions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Find sessions that might be stuck
    const stuckSessions = await Session.find({
      status: { $in: ['pending', 'running'] },
      createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } // Older than 10 minutes
    });
    
    if (stuckSessions.length === 0) {
      logger.info('✅ No stuck sessions found');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    logger.info(`Found ${stuckSessions.length} potentially stuck sessions`);
    
    for (const session of stuckSessions) {
      // Check if session has pending profiles
      const pendingCount = await RootProfileScraped.countDocuments({
        sessionId: session._id,
        status: 'pending'
      });
      
      if (pendingCount > 0) {
        logger.info(`\n========================================`);
        logger.info(`Session: ${session.name}`);
        logger.info(`Status: ${session.status}`);
        logger.info(`Pending Profiles: ${pendingCount}`);
        logger.info(`========================================`);
        
        // Update session status to pending to allow restart
        if (session.status !== 'running') {
          session.status = 'pending';
          await session.save();
        }
        
        logger.info('Restarting batch processing...');
        
        try {
          // Restart batch processing for this session
          await batchScrapingService.processSessionInBatches(session._id.toString());
          logger.info('✅ Batch processing restarted successfully');
        } catch (error) {
          logger.error(`❌ Failed to restart batch processing: ${error.message}`);
        }
      } else {
        logger.info(`Session "${session.name}" has no pending profiles`);
        
        // Check if it should be marked as completed
        const scrapedCount = await RootProfileScraped.countDocuments({
          sessionId: session._id,
          status: 'scraped'
        });
        
        if (scrapedCount > 0 && session.status !== 'completed') {
          session.status = 'completed';
          await session.save();
          logger.info(`✅ Marked session as completed (${scrapedCount} profiles scraped)`);
        }
      }
    }
    
    logger.info('\n========================================');
    logger.info('RECOVERY COMPLETE');
    logger.info('========================================');
    
  } catch (error) {
    logger.error('Recovery error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Check if running directly (not imported)
if (require.main === module) {
  logger.info('Starting session recovery...');
  recoverStuckSessions();
}

module.exports = recoverStuckSessions;