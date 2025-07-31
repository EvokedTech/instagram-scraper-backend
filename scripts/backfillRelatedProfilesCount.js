const mongoose = require('mongoose');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const logger = require('../src/utils/logger');
require('dotenv').config();

/**
 * Script to backfill metadata.relatedProfilesCount for existing root profiles
 * This ensures all root profiles have the correct count for dashboard display
 */
async function backfillRelatedProfilesCount() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Find all root profiles without relatedProfilesCount
    const profilesToUpdate = await RootProfileScraped.find({
      $or: [
        { 'metadata.relatedProfilesCount': { $exists: false } },
        { 'metadata.relatedProfilesCount': null }
      ],
      'profileData.relatedProfiles': { $exists: true }
    });

    logger.info(`Found ${profilesToUpdate.length} profiles to update`);

    let updatedCount = 0;
    let errorCount = 0;

    // Update each profile
    for (const profile of profilesToUpdate) {
      try {
        if (profile.profileData && Array.isArray(profile.profileData.relatedProfiles)) {
          profile.metadata = profile.metadata || {};
          profile.metadata.relatedProfilesCount = profile.profileData.relatedProfiles.length;
          
          await profile.save();
          updatedCount++;
          
          logger.info(`Updated ${profile.username || profile.profileUrl}: ${profile.metadata.relatedProfilesCount} related profiles`);
        }
      } catch (error) {
        errorCount++;
        logger.error(`Error updating profile ${profile.username || profile.profileUrl}:`, error);
      }
    }

    logger.info(`Backfill completed. Updated: ${updatedCount}, Errors: ${errorCount}`);

    // Verify the update
    const stillMissing = await RootProfileScraped.countDocuments({
      $or: [
        { 'metadata.relatedProfilesCount': { $exists: false } },
        { 'metadata.relatedProfilesCount': null }
      ],
      'profileData.relatedProfiles': { $exists: true }
    });

    if (stillMissing > 0) {
      logger.warn(`There are still ${stillMissing} profiles missing relatedProfilesCount`);
    } else {
      logger.info('All profiles have been successfully updated');
    }

  } catch (error) {
    logger.error('Backfill script failed:', error);
  } finally {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  }
}

// Run the script
backfillRelatedProfilesCount()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });