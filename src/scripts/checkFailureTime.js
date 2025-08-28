require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');

async function checkFailureTimes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Get all failed profiles with their timestamps
    const failedProfiles = await RootProfileScraped.find({ 
      status: 'failed' 
    }).select('username updatedAt createdAt error metadata').sort('-updatedAt');
    
    console.log(`\nTotal Failed Profiles: ${failedProfiles.length}\n`);
    console.log('========================================');
    console.log('FAILURE TIMELINE:');
    console.log('========================================\n');
    
    const now = new Date();
    const last5Min = [];
    const last30Min = [];
    const last1Hour = [];
    const older = [];
    
    failedProfiles.forEach(profile => {
      const minutesAgo = Math.round((now - profile.updatedAt) / 60000);
      
      if (minutesAgo <= 5) {
        last5Min.push(profile);
      } else if (minutesAgo <= 30) {
        last30Min.push(profile);
      } else if (minutesAgo <= 60) {
        last1Hour.push(profile);
      } else {
        older.push(profile);
      }
    });
    
    if (last5Min.length > 0) {
      console.log(`⚡ FAILED IN LAST 5 MINUTES (${last5Min.length}):`);
      last5Min.forEach(p => {
        const ago = Math.round((now - p.updatedAt) / 60000);
        console.log(`  - ${p.username} (${ago} min ago) - Error: ${p.error || 'No error'}`);
      });
      console.log();
    }
    
    if (last30Min.length > 0) {
      console.log(`🕐 FAILED IN LAST 30 MINUTES (${last30Min.length}):`);
      last30Min.slice(0, 5).forEach(p => {
        const ago = Math.round((now - p.updatedAt) / 60000);
        console.log(`  - ${p.username} (${ago} min ago)`);
      });
      if (last30Min.length > 5) {
        console.log(`  ... and ${last30Min.length - 5} more`);
      }
      console.log();
    }
    
    if (last1Hour.length > 0) {
      console.log(`🕑 FAILED IN LAST HOUR (${last1Hour.length}):`);
      console.log(`  Count: ${last1Hour.length} profiles`);
      console.log();
    }
    
    if (older.length > 0) {
      console.log(`📅 OLDER FAILURES (${older.length}):`);
      console.log(`  Count: ${older.length} profiles`);
      console.log();
    }
    
    // Check if any have metadata about retries
    const retriedProfiles = failedProfiles.filter(p => 
      p.metadata?.lastRetryAt || p.metadata?.retryError
    );
    
    if (retriedProfiles.length > 0) {
      console.log('========================================');
      console.log('PROFILES THAT WERE RETRIED BUT STILL FAILED:');
      console.log('========================================');
      retriedProfiles.forEach(p => {
        console.log(`- ${p.username}: ${p.metadata?.retryError || p.error || 'Unknown error'}`);
      });
    }
    
    console.log('\n========================================');
    console.log('ANALYSIS:');
    console.log('========================================');
    
    if (last5Min.length > 0) {
      console.log('🚨 CRITICAL: Profiles are failing RIGHT NOW!');
      console.log('   This means the current configuration is not working.');
    } else if (last30Min.length > 0) {
      console.log('⚠️  These are recent failures from the last run.');
      console.log('   They need to be retried with the fixed configuration.');
    } else {
      console.log('✅ No recent failures - all failures are old.');
      console.log('   Run the retry script to fix them.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkFailureTimes();