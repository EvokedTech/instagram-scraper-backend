require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const { ApifyClient } = require('apify-client');

async function retryFinalFailedProfiles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB\n');
    
    // Get all remaining failed profiles
    const failedProfiles = await RootProfileScraped.find({ 
      status: 'failed' 
    }).select('_id username profileUrl sessionId error metadata');
    
    console.log(`Found ${failedProfiles.length} failed profiles to retry\n`);
    
    if (failedProfiles.length === 0) {
      console.log('No failed profiles to retry!');
      return;
    }
    
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    let successCount = 0;
    let stillFailedCount = 0;
    let privateCount = 0;
    
    console.log('========================================');
    console.log('RETRYING FINAL FAILED PROFILES');
    console.log('========================================');
    console.log('✅ MongoDB schema fixed for externalUrls');
    console.log('✅ Using RESIDENTIAL proxies');
    console.log('✅ 120 second timeout per profile');
    console.log('✅ Processing ONE at a time');
    console.log('✅ 10 second delay between profiles');
    console.log('========================================\n');
    
    for (let i = 0; i < failedProfiles.length; i++) {
      const profile = failedProfiles[i];
      console.log(`[${i + 1}/${failedProfiles.length}] Processing ${profile.username}...`);
      
      const input = {
        directUrls: [profile.profileUrl],
        resultsLimit: 10,
        resultsType: 'details',
        searchLimit: 50,
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
          apifyProxyGroups: ['RESIDENTIAL']
        }
      };
      
      try {
        const run = await client.actor(actorId).call(input, {
          timeout: 180,
          memory: 512
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
          const data = items[0];
          
          // Check if profile is private
          if (data.isPrivate || data.private === true) {
            console.log(`  🔒 PRIVATE PROFILE - Marking as skipped`);
            
            await RootProfileScraped.findByIdAndUpdate(profile._id, {
              status: 'skipped',
              error: 'Profile is private',
              metadata: {
                ...profile.metadata,
                isPrivate: true,
                checkedAt: new Date()
              }
            });
            
            privateCount++;
            
          } else {
            // Update profile in database - schema is now fixed!
            await RootProfileScraped.findByIdAndUpdate(profile._id, {
              status: 'scraped',
              profileData: data,
              scrapedAt: new Date(),
              error: null,
              metadata: {
                ...profile.metadata,
                apifyRunId: run.id,
                retrySuccessful: true,
                retriedAt: new Date(),
                finalRetry: true
              }
            });
            
            console.log(`  ✅ SUCCESS! Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
            successCount++;
          }
          
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
            finalRetryError: error.message,
            retryAttempts: (profile.metadata?.retryAttempts || 0) + 1
          }
        });
        
        stillFailedCount++;
      }
      
      // Wait 10 seconds between profiles
      if (i < failedProfiles.length - 1) {
        console.log('  ⏳ Waiting 10 seconds before next profile...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    console.log('\n========================================');
    console.log('FINAL RETRY RESULTS:');
    console.log('========================================');
    console.log(`✅ Successfully scraped: ${successCount}/${failedProfiles.length}`);
    console.log(`🔒 Private profiles: ${privateCount}/${failedProfiles.length}`);
    console.log(`❌ Still failed: ${stillFailedCount}/${failedProfiles.length}`);
    
    if (successCount === failedProfiles.length) {
      console.log('\n🎉 ALL PROFILES SUCCESSFULLY SCRAPED!');
    } else if (successCount > 0) {
      console.log(`\n🎉 Successfully recovered ${successCount} more profiles!`);
    }
    
    if (stillFailedCount > 0) {
      console.log('\n⚠️ Some profiles are still failing. These might be:');
      console.log('1. Deleted or suspended accounts');
      console.log('2. Region-locked profiles');
      console.log('3. Shadow-banned accounts');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

retryFinalFailedProfiles();