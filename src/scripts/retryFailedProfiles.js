require('dotenv').config();
const { ApifyClient } = require('apify-client');
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const logger = require('../utils/logger');

async function retryFailedProfiles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Find all failed profiles from database
    const failedProfiles = await RootProfileScraped.find({ status: 'failed' });
    
    if (failedProfiles.length === 0) {
      logger.info('No failed profiles found in database');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    logger.info(`\n========================================`);
    logger.info(`FOUND ${failedProfiles.length} FAILED PROFILES`);
    logger.info(`========================================`);
    
    failedProfiles.forEach(profile => {
      logger.info(`- ${profile.username} (${profile.profileUrl})`);
    });
    
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    
    logger.info(`\n========================================`);
    logger.info(`RETRYING WITH REDUCED MEMORY (256MB)`);
    logger.info(`========================================\n`);
    
    let successCount = 0;
    let stillFailedCount = 0;
    
    // Process each failed profile one by one
    for (const profile of failedProfiles) {
      logger.info(`\nRetrying ${profile.username}...`);
      
      try {
        // Special configuration for failed profiles
        const input = {
          directUrls: [profile.profileUrl],
          resultsLimit: 5,   // Reduced limit
          resultsType: 'details',
          searchLimit: 20,   // Reduced limit
          searchType: 'user',
          addParentData: false,
          enhanceUserSearchWithFacebookPage: false,
          isUserReelFeedURL: false,
          isUserTaggedFeedURL: false,
          maxRequestRetries: 3,
          requestTimeoutSecs: 60,
          handleRequestTimeoutSecs: 120,
          maxConcurrency: 1,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL']
          }
        };
        
        const run = await client.actor(actorId).call(input, {
          timeout: 90,
          memory: 256  // Reduced memory to avoid limit
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
          const data = items[0];
          
          // Update profile in database
          profile.status = 'scraped';
          profile.profileData = data;
          profile.scrapedAt = new Date();
          profile.error = null;
          profile.metadata = {
            ...profile.metadata,
            apifyRunId: run.id,
            retriedAt: new Date()
          };
          
          await profile.save();
          successCount++;
          
          logger.info(`  ✅ SUCCESS - Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
        } else {
          throw new Error('No data returned from Apify');
        }
        
      } catch (error) {
        stillFailedCount++;
        profile.error = `Retry failed: ${error.message}`;
        profile.metadata = {
          ...profile.metadata,
          lastRetryAt: new Date(),
          retryError: error.message
        };
        await profile.save();
        logger.error(`  ❌ STILL FAILED - ${error.message}`);
      }
      
      // Wait 3 seconds between profiles
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Final status check
    const scraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
    const failed = await RootProfileScraped.countDocuments({ status: 'failed' });
    const skipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
    
    logger.info(`\n========================================`);
    logger.info(`RETRY RESULTS`);
    logger.info(`========================================`);
    logger.info(`✅ Successfully recovered: ${successCount}`);
    logger.info(`❌ Still failed: ${stillFailedCount}`);
    logger.info(`========================================`);
    logger.info(`FINAL DATABASE STATUS`);
    logger.info(`========================================`);
    logger.info(`✅ Total Scraped: ${scraped}`);
    logger.info(`❌ Total Failed: ${failed}`);
    logger.info(`🔒 Total Skipped: ${skipped}`);
    logger.info(`========================================\n`);
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the retry
retryFailedProfiles();