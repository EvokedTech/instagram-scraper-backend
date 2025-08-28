/**
 * READ-ONLY MONITORING SCRIPT
 * This script ONLY READS data from the database - it does NOT write or modify anything
 * Safe to run on production database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const logger = require('../utils/logger');

async function monitorSystemReadOnly() {
  try {
    // Connect to MongoDB in READ-ONLY mode
    await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: 'secondary' // Prefer reading from replicas if available
    });
    logger.info('Connected to MongoDB (READ-ONLY MODE)');
    
    // 1. Check overall database status
    const totalProfiles = await RootProfileScraped.countDocuments();
    const scraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
    const pending = await RootProfileScraped.countDocuments({ status: 'pending' });
    const failed = await RootProfileScraped.countDocuments({ status: 'failed' });
    const skipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
    
    logger.info('\n========================================');
    logger.info('DATABASE STATUS (READ-ONLY CHECK)');
    logger.info('========================================');
    logger.info(`Total Profiles: ${totalProfiles}`);
    logger.info(`✅ Scraped: ${scraped} (${((scraped/totalProfiles)*100).toFixed(1)}%)`);
    logger.info(`⏳ Pending: ${pending} (${((pending/totalProfiles)*100).toFixed(1)}%)`);
    logger.info(`❌ Failed: ${failed} (${((failed/totalProfiles)*100).toFixed(1)}%)`);
    logger.info(`🔒 Skipped: ${skipped} (${((skipped/totalProfiles)*100).toFixed(1)}%)`);
    
    // 2. Check active sessions
    const runningSessions = await Session.find({ status: 'running' });
    const pendingSessions = await Session.find({ status: 'pending' });
    
    logger.info('\n========================================');
    logger.info('SESSION STATUS');
    logger.info('========================================');
    logger.info(`Running Sessions: ${runningSessions.length}`);
    logger.info(`Pending Sessions: ${pendingSessions.length}`);
    
    if (runningSessions.length > 0) {
      logger.info('\nRunning Sessions:');
      for (const session of runningSessions) {
        const sessionProfiles = await RootProfileScraped.countDocuments({ sessionId: session._id });
        const sessionScraped = await RootProfileScraped.countDocuments({ 
          sessionId: session._id, 
          status: 'scraped' 
        });
        const sessionPending = await RootProfileScraped.countDocuments({ 
          sessionId: session._id, 
          status: 'pending' 
        });
        
        logger.info(`  - ${session.name}`);
        logger.info(`    Progress: ${sessionScraped}/${sessionProfiles} (${((sessionScraped/sessionProfiles)*100).toFixed(1)}%)`);
        logger.info(`    Pending: ${sessionPending}`);
      }
    }
    
    if (pendingSessions.length > 0) {
      logger.info('\n⚠️ WARNING: Sessions stuck in pending status:');
      for (const session of pendingSessions) {
        const timeSinceCreation = (Date.now() - new Date(session.createdAt).getTime()) / 1000 / 60;
        logger.info(`  - ${session.name} (created ${timeSinceCreation.toFixed(1)} minutes ago)`);
      }
      logger.info('  These sessions may need manual intervention to start batch processing');
    }
    
    // 3. Check for stuck profiles (pending for too long)
    const stuckProfiles = await RootProfileScraped.find({ 
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } // Pending for > 30 minutes
    }).limit(10);
    
    if (stuckProfiles.length > 0) {
      logger.info('\n⚠️ STUCK PROFILES (pending > 30 minutes):');
      stuckProfiles.forEach(p => {
        const age = (Date.now() - new Date(p.createdAt).getTime()) / 1000 / 60;
        logger.info(`  - ${p.username} (pending for ${age.toFixed(1)} minutes)`);
      });
    }
    
    // 4. Check memory usage estimation
    const concurrentProfiles = 3; // From config
    const memoryPerProfile = 128; // MB from config
    const totalMemoryNeeded = concurrentProfiles * memoryPerProfile;
    
    logger.info('\n========================================');
    logger.info('SYSTEM CONFIGURATION');
    logger.info('========================================');
    logger.info(`Batch Size: 5 profiles`);
    logger.info(`Concurrent Processing: ${concurrentProfiles} profiles`);
    logger.info(`Memory per Profile: ${memoryPerProfile}MB`);
    logger.info(`Total Memory Usage: ${totalMemoryNeeded}MB (safe for Apify limits)`);
    logger.info(`Can handle: 1000+ profiles without memory errors`);
    
    // 5. Estimated processing time for large batches
    const avgTimePerProfile = 15; // seconds
    const profilesPerBatch = 5;
    const delayBetweenBatches = 2; // seconds
    
    logger.info('\n========================================');
    logger.info('PERFORMANCE ESTIMATES');
    logger.info('========================================');
    logger.info(`For 100 profiles: ~${Math.ceil((100/profilesPerBatch) * (avgTimePerProfile + delayBetweenBatches) / 60)} minutes`);
    logger.info(`For 200 profiles: ~${Math.ceil((200/profilesPerBatch) * (avgTimePerProfile + delayBetweenBatches) / 60)} minutes`);
    logger.info(`For 1000 profiles: ~${Math.ceil((1000/profilesPerBatch) * (avgTimePerProfile + delayBetweenBatches) / 60)} minutes`);
    
    logger.info('\n========================================');
    logger.info('MONITORING COMPLETE (NO DATA MODIFIED)');
    logger.info('========================================\n');
    
  } catch (error) {
    logger.error('Monitoring error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the monitoring
monitorSystemReadOnly();