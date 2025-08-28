require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const batchScrapingService = require('../services/batchScrapingService');
const logger = require('../utils/logger');

async function scrapePendingProfiles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Find all pending profiles
    const pendingProfiles = await RootProfileScraped.find({ status: 'pending' });
    
    if (pendingProfiles.length === 0) {
      logger.info('No pending profiles found in database');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    logger.info(`\n========================================`);
    logger.info(`FOUND ${pendingProfiles.length} PENDING PROFILES`);
    logger.info(`========================================`);
    
    // Group by session
    const profilesBySession = {};
    pendingProfiles.forEach(profile => {
      const sessionId = profile.sessionId?.toString() || 'no-session';
      if (!profilesBySession[sessionId]) {
        profilesBySession[sessionId] = [];
      }
      profilesBySession[sessionId].push({
        username: profile.username,
        profileUrl: profile.profileUrl,
        sessionId: sessionId
      });
    });
    
    // Show pending profiles by session
    for (const [sessionId, profiles] of Object.entries(profilesBySession)) {
      logger.info(`\nSession ${sessionId}: ${profiles.length} pending profiles`);
      profiles.forEach(p => logger.info(`  - ${p.username} (${p.profileUrl})`));
    }
    
    logger.info(`\n========================================`);
    logger.info(`STARTING BATCH PROCESSING FOR ALL PENDING PROFILES`);
    logger.info(`========================================\n`);
    
    // Process each session's pending profiles
    for (const [sessionId, profiles] of Object.entries(profilesBySession)) {
      if (sessionId !== 'no-session') {
        logger.info(`\nProcessing session ${sessionId} with ${profiles.length} profiles...`);
        try {
          await batchScrapingService.processSessionInBatches(sessionId);
          logger.info(`✅ Completed processing session ${sessionId}`);
        } catch (error) {
          logger.error(`❌ Failed to process session ${sessionId}:`, error.message);
        }
      } else {
        logger.info(`\n⚠️ Found ${profiles.length} profiles without session ID - skipping`);
      }
    }
    
    // Check final status
    const stillPending = await RootProfileScraped.countDocuments({ status: 'pending' });
    const scraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
    const failed = await RootProfileScraped.countDocuments({ status: 'failed' });
    const skipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
    
    logger.info(`\n========================================`);
    logger.info(`FINAL STATUS`);
    logger.info(`========================================`);
    logger.info(`✅ Scraped: ${scraped}`);
    logger.info(`❌ Failed: ${failed}`);
    logger.info(`🔒 Skipped: ${skipped}`);
    logger.info(`⏳ Still Pending: ${stillPending}`);
    logger.info(`========================================\n`);
    
  } catch (error) {
    logger.error('Error processing pending profiles:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the script
scrapePendingProfiles();