require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger');

async function findAndFixFailed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Find ALL failed profiles
    const failedProfiles = await RootProfileScraped.find({ status: 'failed' });
    
    if (failedProfiles.length === 0) {
      logger.info('✅ No failed profiles found! Database is clean.');
      
      // Still check the overall status
      const scraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
      const pending = await RootProfileScraped.countDocuments({ status: 'pending' });
      const skipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
      const failed = await RootProfileScraped.countDocuments({ status: 'failed' });
      
      logger.info(`\nDatabase Status:`);
      logger.info(`✅ Scraped: ${scraped}`);
      logger.info(`⏳ Pending: ${pending}`);
      logger.info(`🔒 Skipped: ${skipped}`);
      logger.info(`❌ Failed: ${failed}`);
      
      await mongoose.disconnect();
      process.exit(0);
    }
    
    logger.info(`\n========================================`);
    logger.info(`FOUND ${failedProfiles.length} FAILED PROFILES`);
    logger.info(`========================================`);
    
    failedProfiles.forEach(p => {
      logger.info(`- ${p.username} (${p.profileUrl})`);
      if (p.error) {
        logger.info(`  Last error: ${p.error}`);
      }
    });
    
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    const actorId = 'shu8hvrXbJbY3Eb9W';
    
    logger.info(`\n========================================`);
    logger.info(`ATTEMPTING TO FIX ${failedProfiles.length} FAILED PROFILES`);
    logger.info(`Using minimal configuration to avoid failures`);
    logger.info(`========================================\n`);
    
    let successCount = 0;
    let privateCount = 0;
    let stillFailedCount = 0;
    
    for (const profile of failedProfiles) {
      logger.info(`\nProcessing ${profile.username}...`);
      
      try {
        // First check if profile exists/is accessible
        const testInput = {
          directUrls: [profile.profileUrl],
          resultsLimit: 1,  // Absolute minimum
          resultsType: 'details',
          searchLimit: 1,   // Absolute minimum
          searchType: 'user',
          addParentData: false,
          enhanceUserSearchWithFacebookPage: false,
          isUserReelFeedURL: false,
          isUserTaggedFeedURL: false,
          maxRequestRetries: 2,
          requestTimeoutSecs: 30,  // Quick timeout
          handleRequestTimeoutSecs: 60,
          maxConcurrency: 1,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL']
          }
        };
        
        logger.info(`  Checking profile accessibility...`);
        const run = await client.actor(actorId).call(testInput, {
          timeout: 60,
          memory: 128  // Minimal memory
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
          const data = items[0];
          
          // Check various privacy indicators
          const isPrivate = data.isPrivate || 
                           data.private === true || 
                           data.isPrivateAccount === true ||
                           (data.error && data.error.includes('private'));
          
          if (isPrivate) {
            profile.status = 'skipped';
            profile.error = 'Profile is private';
            profile.metadata = {
              ...profile.metadata,
              isPrivate: true,
              checkedAt: new Date()
            };
            await profile.save();
            privateCount++;
            logger.info(`  🔒 PRIVATE - Skipped`);
          } else {
            // Profile is public, save the data
            profile.status = 'scraped';
            profile.profileData = data;
            profile.scrapedAt = new Date();
            profile.error = null;
            profile.metadata = {
              ...profile.metadata,
              apifyRunId: run.id,
              scrapedAt: new Date(),
              recovered: true
            };
            await profile.save();
            successCount++;
            logger.info(`  ✅ SUCCESS - Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
          }
        } else {
          // No data returned - profile might not exist
          profile.status = 'skipped';
          profile.error = 'Profile not found or inaccessible';
          profile.metadata = {
            ...profile.metadata,
            notFound: true,
            checkedAt: new Date()
          };
          await profile.save();
          logger.info(`  ⚠️ NOT FOUND - Skipped`);
        }
        
      } catch (error) {
        // Check if it's a memory limit error
        if (error.message && error.message.includes('memory limit')) {
          logger.info(`  ⚠️ Memory limit reached - waiting 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Try once more with even less memory
          try {
            const minimalInput = {
              directUrls: [profile.profileUrl],
              resultsLimit: 1,
              resultsType: 'posts',  // Just get posts, lighter than details
              maxRequestRetries: 1,
              requestTimeoutSecs: 20,
              proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ['RESIDENTIAL']
              }
            };
            
            const run = await client.actor(actorId).call(minimalInput, {
              timeout: 30,
              memory: 64  // Absolute minimum
            });
            
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            if (items && items.length > 0) {
              profile.status = 'scraped';
              profile.profileData = items[0];
              profile.scrapedAt = new Date();
              profile.error = null;
              await profile.save();
              successCount++;
              logger.info(`  ✅ SUCCESS (minimal data)`);
            } else {
              throw new Error('Still no data');
            }
          } catch (retryError) {
            profile.error = `Final attempt failed: ${retryError.message}`;
            await profile.save();
            stillFailedCount++;
            logger.error(`  ❌ STILL FAILED - ${retryError.message}`);
          }
        } else {
          profile.error = `Error: ${error.message}`;
          await profile.save();
          stillFailedCount++;
          logger.error(`  ❌ ERROR - ${error.message}`);
        }
      }
      
      // Wait between profiles
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Final database check
    const finalScraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
    const finalFailed = await RootProfileScraped.countDocuments({ status: 'failed' });
    const finalSkipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
    const finalPending = await RootProfileScraped.countDocuments({ status: 'pending' });
    
    logger.info(`\n========================================`);
    logger.info(`PROCESSING COMPLETE`);
    logger.info(`========================================`);
    logger.info(`✅ Successfully scraped: ${successCount}`);
    logger.info(`🔒 Private profiles skipped: ${privateCount}`);
    logger.info(`❌ Still failed: ${stillFailedCount}`);
    logger.info(`========================================`);
    logger.info(`FINAL DATABASE STATUS`);
    logger.info(`========================================`);
    logger.info(`✅ Total Scraped: ${finalScraped}`);
    logger.info(`❌ Total Failed: ${finalFailed}`);
    logger.info(`🔒 Total Skipped: ${finalSkipped}`);
    logger.info(`⏳ Total Pending: ${finalPending}`);
    logger.info(`========================================\n`);
    
    if (finalFailed > 0) {
      logger.info(`\nRemaining failed profiles:`);
      const stillFailed = await RootProfileScraped.find({ status: 'failed' });
      stillFailed.forEach(p => {
        logger.info(`- ${p.username}: ${p.error}`);
      });
    }
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the script
findAndFixFailed();