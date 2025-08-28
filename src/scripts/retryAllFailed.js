require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger');

async function retryAllFailedProfiles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB\n');
    
    // Get all failed profiles
    const failedProfiles = await RootProfileScraped.find({ 
      status: 'failed' 
    }).select('_id username profileUrl sessionId');
    
    console.log(`Found ${failedProfiles.length} failed profiles to retry\n`);
    
    if (failedProfiles.length === 0) {
      console.log('No failed profiles to retry');
      return;
    }
    
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    let successCount = 0;
    let stillFailedCount = 0;
    
    console.log('========================================');
    console.log('RETRYING WITH OPTIMAL CONFIGURATION:');
    console.log('========================================');
    console.log('✅ Using RESIDENTIAL proxies');
    console.log('✅ 120 second timeout per profile');
    console.log('✅ Processing ONE at a time');
    console.log('✅ 15 second delay between profiles');
    console.log('✅ Minimal data limits (10 results max)');
    console.log('========================================\n');
    
    for (let i = 0; i < failedProfiles.length; i++) {
      const profile = failedProfiles[i];
      console.log(`[${i + 1}/${failedProfiles.length}] Retrying ${profile.username}...`);
      
      const input = {
        directUrls: [profile.profileUrl],
        resultsLimit: 5,    // ULTRA LOW to ensure success
        resultsType: 'details',
        searchLimit: 20,    // ULTRA LOW to ensure success
        searchType: 'user',
        addParentData: false,
        enhanceUserSearchWithFacebookPage: false,
        isUserReelFeedURL: false,
        isUserTaggedFeedURL: false,
        maxRequestRetries: 5,
        requestTimeoutSecs: 120,
        handleRequestTimeoutSecs: 180,
        maxConcurrency: 1,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'] // CRITICAL
        }
      };
      
      try {
        const run = await client.actor(actorId).call(input, {
          timeout: 180,  // 3 minute timeout
          memory: 512
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
          const data = items[0];
          
          // Update profile in database
          await RootProfileScraped.findByIdAndUpdate(profile._id, {
            status: 'scraped',
            profileData: data,
            scrapedAt: new Date(),
            error: null,
            metadata: {
              ...profile.metadata,
              apifyRunId: run.id,
              retrySuccessful: true,
              retriedAt: new Date()
            }
          });
          
          console.log(`  ✅ SUCCESS! Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
          successCount++;
          
        } else {
          throw new Error('No data returned from Apify');
        }
        
      } catch (error) {
        console.log(`  ❌ STILL FAILED: ${error.message}`);
        
        // Update error in database
        await RootProfileScraped.findByIdAndUpdate(profile._id, {
          error: error.message,
          metadata: {
            ...profile.metadata,
            lastRetryAt: new Date(),
            retryError: error.message
          }
        });
        
        stillFailedCount++;
      }
      
      // Wait 15 seconds between profiles to avoid rate limiting
      if (i < failedProfiles.length - 1) {
        console.log('  ⏳ Waiting 15 seconds before next profile...\n');
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }
    
    console.log('\n========================================');
    console.log('RETRY RESULTS:');
    console.log('========================================');
    console.log(`✅ Successfully recovered: ${successCount}/${failedProfiles.length}`);
    console.log(`❌ Still failed: ${stillFailedCount}/${failedProfiles.length}`);
    
    if (successCount > 0) {
      console.log('\n🎉 Recovery successful for some profiles!');
    }
    
    if (stillFailedCount > 0) {
      console.log('\n⚠️ Some profiles still failing. Possible reasons:');
      console.log('1. Instagram is blocking Apify completely for these profiles');
      console.log('2. The profiles might have special characters or be region-locked');
      console.log('3. Try using a different Apify actor');
      console.log('4. Consider manual verification or using Instagram API directly');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run with command line option to limit number of retries
const limit = process.argv[2] ? parseInt(process.argv[2]) : null;
if (limit) {
  console.log(`Limiting retry to first ${limit} profiles\n`);
}

retryAllFailedProfiles();