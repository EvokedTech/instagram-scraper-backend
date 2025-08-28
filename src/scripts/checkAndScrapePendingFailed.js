require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger');

async function checkAndScrapePendingFailed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Find all pending profiles
    const pendingProfiles = await RootProfileScraped.find({ status: 'pending' });
    const failedProfiles = await RootProfileScraped.find({ status: 'failed' });
    
    logger.info(`\n========================================`);
    logger.info(`DATABASE STATUS CHECK`);
    logger.info(`========================================`);
    logger.info(`⏳ PENDING PROFILES: ${pendingProfiles.length}`);
    logger.info(`❌ FAILED PROFILES: ${failedProfiles.length}`);
    logger.info(`========================================\n`);
    
    if (pendingProfiles.length > 0) {
      logger.info(`PENDING PROFILES:`);
      pendingProfiles.forEach(p => {
        logger.info(`  - ${p.username} (${p.profileUrl})`);
      });
      logger.info('');
    }
    
    if (failedProfiles.length > 0) {
      logger.info(`FAILED PROFILES:`);
      failedProfiles.forEach(p => {
        logger.info(`  - ${p.username} (${p.profileUrl})`);
        if (p.error) logger.info(`    Error: ${p.error}`);
      });
      logger.info('');
    }
    
    const allProfilesToScrape = [...pendingProfiles, ...failedProfiles];
    
    if (allProfilesToScrape.length === 0) {
      logger.info('✅ No pending or failed profiles! Database is clean.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Initialize Apify client
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    const actorId = 'shu8hvrXbJbY3Eb9W';
    
    logger.info(`\n========================================`);
    logger.info(`SCRAPING ${allProfilesToScrape.length} PROFILES`);
    logger.info(`Using reduced memory (256MB) and processing one at a time`);
    logger.info(`========================================\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Process each profile individually
    for (const profile of allProfilesToScrape) {
      logger.info(`\nScraping ${profile.username}...`);
      
      try {
        const input = {
          directUrls: [profile.profileUrl],
          resultsLimit: 5,
          resultsType: 'details',
          searchLimit: 20,
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
          memory: 256  // Low memory to avoid limits
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
          const data = items[0];
          
          // Check if private
          if (data.isPrivate || data.private === true) {
            profile.status = 'skipped';
            profile.error = 'Profile is private';
            logger.info(`  🔒 PRIVATE - Skipped`);
          } else {
            profile.status = 'scraped';
            profile.profileData = data;
            profile.scrapedAt = new Date();
            profile.error = null;
            profile.metadata = {
              ...profile.metadata,
              apifyRunId: run.id,
              scrapedAt: new Date()
            };
            successCount++;
            logger.info(`  ✅ SUCCESS - Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
          }
          
          await profile.save();
        } else {
          throw new Error('No data returned from Apify');
        }
        
      } catch (error) {
        profile.status = 'failed';
        profile.error = error.message;
        await profile.save();
        failCount++;
        logger.error(`  ❌ FAILED - ${error.message}`);
      }
      
      // Wait 3 seconds between profiles
      if (allProfilesToScrape.indexOf(profile) < allProfilesToScrape.length - 1) {
        logger.info(`  Waiting 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Final check
    const finalPending = await RootProfileScraped.countDocuments({ status: 'pending' });
    const finalFailed = await RootProfileScraped.countDocuments({ status: 'failed' });
    const totalScraped = await RootProfileScraped.countDocuments({ status: 'scraped' });
    const totalSkipped = await RootProfileScraped.countDocuments({ status: 'skipped' });
    
    logger.info(`\n========================================`);
    logger.info(`SCRAPING COMPLETE`);
    logger.info(`========================================`);
    logger.info(`✅ Successfully scraped: ${successCount}`);
    logger.info(`❌ Failed to scrape: ${failCount}`);
    logger.info(`========================================`);
    logger.info(`FINAL DATABASE STATUS`);
    logger.info(`========================================`);
    logger.info(`✅ Total Scraped: ${totalScraped}`);
    logger.info(`❌ Total Failed: ${finalFailed}`);
    logger.info(`🔒 Total Skipped: ${totalSkipped}`);
    logger.info(`⏳ Total Pending: ${finalPending}`);
    logger.info(`========================================\n`);
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

// Run the script
checkAndScrapePendingFailed();