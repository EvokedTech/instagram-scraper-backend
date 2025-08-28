require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');

async function retryAllFailedWithProgress() {
  const startTime = new Date();
  const logFile = path.join(__dirname, `retry-log-${Date.now()}.txt`);
  
  function log(message) {
    console.log(message);
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
  }
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    log('Connected to MongoDB\n');
    
    // Get all failed profiles
    const failedProfiles = await RootProfileScraped.find({ 
      status: 'failed' 
    }).select('_id username profileUrl sessionId error metadata');
    
    log(`Found ${failedProfiles.length} failed profiles to retry\n`);
    
    if (failedProfiles.length === 0) {
      log('No failed profiles to retry');
      return;
    }
    
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    let successCount = 0;
    let stillFailedCount = 0;
    let privateCount = 0;
    let notFoundCount = 0;
    
    const results = {
      successful: [],
      stillFailed: [],
      private: [],
      notFound: []
    };
    
    log('========================================');
    log('STARTING RETRY WITH OPTIMIZED CONFIG:');
    log('========================================');
    log('✅ Using RESIDENTIAL proxies');
    log('✅ 120 second timeout per profile');
    log('✅ Processing ONE at a time');
    log('✅ 10 second delay between profiles');
    log('✅ Minimal data limits (10 results max)');
    log(`✅ Starting at: ${startTime.toLocaleTimeString()}`);
    log('========================================\n');
    
    for (let i = 0; i < failedProfiles.length; i++) {
      const profile = failedProfiles[i];
      const profileStartTime = new Date();
      
      log(`[${i + 1}/${failedProfiles.length}] Processing ${profile.username}...`);
      log(`  Previous error: ${profile.error || 'No error message'}`);
      
      const input = {
        directUrls: [profile.profileUrl],
        resultsLimit: 10,      // Keep low for success
        resultsType: 'details',
        searchLimit: 50,       // Keep low for success
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
          apifyProxyGroups: ['RESIDENTIAL']  // CRITICAL for success
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
          
          // Check if profile is private
          if (data.isPrivate || data.private === true) {
            log(`  🔒 PRIVATE PROFILE - Marking as skipped`);
            
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
            results.private.push(profile.username);
            
          } else {
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
                retriedAt: new Date(),
                processingTime: (new Date() - profileStartTime) / 1000
              }
            });
            
            log(`  ✅ SUCCESS! Followers: ${data.followersCount || 'N/A'}, Posts: ${data.postsCount || 'N/A'}`);
            log(`  Processing time: ${Math.round((new Date() - profileStartTime) / 1000)}s`);
            successCount++;
            results.successful.push({
              username: profile.username,
              followers: data.followersCount,
              posts: data.postsCount
            });
          }
          
        } else {
          throw new Error('No data returned from Apify');
        }
        
      } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        
        // Check if profile doesn't exist
        if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          log(`  ❌ PROFILE NOT FOUND - Removing from database`);
          
          await RootProfileScraped.findByIdAndDelete(profile._id);
          notFoundCount++;
          results.notFound.push(profile.username);
          
        } else {
          log(`  ❌ STILL FAILED: ${errorMessage}`);
          
          // Update error in database
          await RootProfileScraped.findByIdAndUpdate(profile._id, {
            error: errorMessage,
            metadata: {
              ...profile.metadata,
              lastRetryAt: new Date(),
              retryError: errorMessage,
              retryAttempts: (profile.metadata?.retryAttempts || 0) + 1
            }
          });
          
          stillFailedCount++;
          results.stillFailed.push({
            username: profile.username,
            error: errorMessage
          });
        }
      }
      
      // Progress update every 10 profiles
      if ((i + 1) % 10 === 0 || i === failedProfiles.length - 1) {
        const elapsed = Math.round((new Date() - startTime) / 60000);
        const remaining = Math.round(((failedProfiles.length - i - 1) * 10) / 60);
        log(`\n📊 Progress: ${i + 1}/${failedProfiles.length} (${elapsed} min elapsed, ~${remaining} min remaining)`);
        log(`   Success: ${successCount}, Failed: ${stillFailedCount}, Private: ${privateCount}, Not Found: ${notFoundCount}\n`);
      }
      
      // Wait 10 seconds between profiles to avoid rate limiting
      if (i < failedProfiles.length - 1) {
        log('  ⏳ Waiting 10 seconds before next profile...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    const totalTime = Math.round((new Date() - startTime) / 60000);
    
    log('\n========================================');
    log('FINAL RESULTS:');
    log('========================================');
    log(`✅ Successfully scraped: ${successCount}/${failedProfiles.length} (${Math.round(successCount/failedProfiles.length*100)}%)`);
    log(`❌ Still failed: ${stillFailedCount}/${failedProfiles.length}`);
    log(`🔒 Private profiles: ${privateCount}/${failedProfiles.length}`);
    log(`🚫 Not found (deleted): ${notFoundCount}/${failedProfiles.length}`);
    log(`⏱️ Total processing time: ${totalTime} minutes`);
    
    if (successCount > 0) {
      log('\n🎉 SUCCESSFUL PROFILES:');
      results.successful.slice(0, 10).forEach(p => {
        log(`  - ${p.username} (${p.followers} followers, ${p.posts} posts)`);
      });
      if (results.successful.length > 10) {
        log(`  ... and ${results.successful.length - 10} more`);
      }
    }
    
    if (stillFailedCount > 0) {
      log('\n⚠️ PROFILES STILL FAILING:');
      results.stillFailed.slice(0, 10).forEach(p => {
        log(`  - ${p.username}: ${p.error}`);
      });
      if (results.stillFailed.length > 10) {
        log(`  ... and ${results.stillFailed.length - 10} more`);
      }
      
      log('\nPossible reasons for continued failures:');
      log('1. Instagram is actively blocking these specific profiles');
      log('2. Profiles might be shadow-banned or restricted');
      log('3. Regional restrictions or special characters in URLs');
      log('4. Consider using Instagram Graph API for these profiles');
    }
    
    // Save detailed results to file
    const resultsFile = path.join(__dirname, `retry-results-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    log(`\n📄 Detailed results saved to: ${resultsFile}`);
    log(`📄 Full log saved to: ${logFile}`);
    
  } catch (error) {
    log(`Critical error: ${error.message}`);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    log('\nDisconnected from MongoDB');
  }
}

// Run the retry
console.log('Starting comprehensive retry for all failed profiles...\n');
retryAllFailedWithProgress();