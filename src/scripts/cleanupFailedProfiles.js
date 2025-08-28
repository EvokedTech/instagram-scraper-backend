require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const logger = require('../utils/logger');

async function cleanupFailedProfiles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Connected to MongoDB');
    
    // Find all failed profiles
    const failedProfiles = await RootProfileScraped.find({ status: 'failed' });
    logger.info(`Found ${failedProfiles.length} failed profiles to remove`);
    
    if (failedProfiles.length > 0) {
      // Log the profiles that will be deleted
      logger.info('Profiles to be deleted:');
      failedProfiles.forEach(profile => {
        logger.info(`- ${profile.username} (${profile.profileUrl}) - Error: ${profile.error || 'Unknown'}`);
      });
      
      // Delete all failed profiles
      const result = await RootProfileScraped.deleteMany({ status: 'failed' });
      logger.info(`Successfully deleted ${result.deletedCount} failed profiles from rootprofiles_scraped_datas`);
    } else {
      logger.info('No failed profiles found to delete');
    }
    
    // Also check for 'skipped' status (private profiles) if you want to remove them too
    const skippedProfiles = await RootProfileScraped.countDocuments({ status: 'skipped' });
    if (skippedProfiles > 0) {
      logger.info(`Note: Found ${skippedProfiles} skipped profiles (private). Run with --include-skipped to remove these as well.`);
    }
    
  } catch (error) {
    logger.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Check if we should also delete skipped profiles
const includeSkipped = process.argv.includes('--include-skipped');

if (includeSkipped) {
  async function cleanupFailedAndSkippedProfiles() {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      logger.info('Connected to MongoDB');
      
      // Delete both failed and skipped profiles
      const result = await RootProfileScraped.deleteMany({ 
        status: { $in: ['failed', 'skipped'] } 
      });
      
      logger.info(`Successfully deleted ${result.deletedCount} failed/skipped profiles from rootprofiles_scraped_datas`);
      
    } catch (error) {
      logger.error('Error during cleanup:', error);
    } finally {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    }
  }
  
  cleanupFailedAndSkippedProfiles();
} else {
  cleanupFailedProfiles();
}