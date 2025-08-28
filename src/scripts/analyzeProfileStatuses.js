require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');

async function analyzeStatuses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB\n');
    
    // Get all profiles grouped by status
    const statusGroups = await RootProfileScraped.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          profiles: { 
            $push: {
              username: '$username',
              error: '$error',
              createdAt: '$createdAt',
              updatedAt: '$updatedAt'
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    console.log('========================================');
    console.log('PROFILE STATUS BREAKDOWN:');
    console.log('========================================\n');
    
    let totalProfiles = 0;
    const failedProfiles = [];
    const pendingProfiles = [];
    const skippedProfiles = [];
    
    for (const group of statusGroups) {
      console.log(`📊 Status: ${group._id || 'unknown'} - Count: ${group.count}`);
      totalProfiles += group.count;
      
      if (group._id === 'failed') {
        console.log('   Failed Profiles:');
        group.profiles.slice(0, 10).forEach(p => {
          console.log(`   - ${p.username}: ${p.error || 'No error message'}`);
          failedProfiles.push(p);
        });
        if (group.count > 10) {
          console.log(`   ... and ${group.count - 10} more`);
        }
      }
      
      if (group._id === 'pending') {
        console.log('   Pending Profiles (first 5):');
        group.profiles.slice(0, 5).forEach(p => {
          console.log(`   - ${p.username}`);
          pendingProfiles.push(p);
        });
        if (group.count > 5) {
          console.log(`   ... and ${group.count - 5} more`);
        }
      }
      
      if (group._id === 'skipped') {
        console.log('   Skipped Profiles (private):');
        group.profiles.slice(0, 5).forEach(p => {
          console.log(`   - ${p.username}: ${p.error}`);
          skippedProfiles.push(p);
        });
      }
      
      console.log();
    }
    
    // Get recently failed profiles (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentlyFailed = await RootProfileScraped.find({
      status: 'failed',
      updatedAt: { $gte: oneHourAgo }
    }).select('username error updatedAt');
    
    if (recentlyFailed.length > 0) {
      console.log('========================================');
      console.log('RECENTLY FAILED (Last Hour):');
      console.log('========================================');
      recentlyFailed.forEach(p => {
        const timeAgo = Math.round((Date.now() - p.updatedAt) / 60000);
        console.log(`- ${p.username} (${timeAgo} min ago): ${p.error || 'No error'}`);
      });
    }
    
    // Analyze error patterns
    const errorPatterns = await RootProfileScraped.aggregate([
      { $match: { status: 'failed' } },
      {
        $group: {
          _id: '$error',
          count: { $sum: 1 },
          usernames: { $push: '$username' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    if (errorPatterns.length > 0) {
      console.log('\n========================================');
      console.log('ERROR PATTERNS:');
      console.log('========================================');
      errorPatterns.forEach(pattern => {
        console.log(`\n"${pattern._id || 'No error message'}" - ${pattern.count} profiles`);
        console.log('  Examples:', pattern.usernames.slice(0, 3).join(', '));
      });
    }
    
    // Summary
    console.log('\n========================================');
    console.log('SUMMARY:');
    console.log('========================================');
    console.log(`Total Profiles: ${totalProfiles}`);
    console.log(`✅ Scraped: ${statusGroups.find(g => g._id === 'scraped')?.count || 0}`);
    console.log(`✅ Analyzed: ${statusGroups.find(g => g._id === 'analyzed')?.count || 0}`);
    console.log(`⏳ Pending: ${statusGroups.find(g => g._id === 'pending')?.count || 0}`);
    console.log(`❌ Failed: ${statusGroups.find(g => g._id === 'failed')?.count || 0}`);
    console.log(`🔒 Skipped (Private): ${statusGroups.find(g => g._id === 'skipped')?.count || 0}`);
    
    // Recommendations
    console.log('\n========================================');
    console.log('RECOMMENDATIONS:');
    console.log('========================================');
    
    const failedCount = statusGroups.find(g => g._id === 'failed')?.count || 0;
    if (failedCount > 0) {
      console.log('🚨 You have', failedCount, 'failed profiles!');
      console.log('\nTo fix this:');
      console.log('1. Check if these profiles still exist on Instagram');
      console.log('2. The new configuration with RESIDENTIAL proxies should help');
      console.log('3. Process them one by one with 10-15 second delays');
      console.log('4. Consider using a different Apify actor if problems persist');
      
      // Check for specific error patterns
      const noDataErrors = errorPatterns.find(e => e._id?.includes('No data received'));
      if (noDataErrors) {
        console.log('\n⚠️ "No data received" errors indicate Apify timeouts or blocks');
        console.log('   This is usually fixed by using residential proxies');
      }
    }
    
    const pendingCount = statusGroups.find(g => g._id === 'pending')?.count || 0;
    if (pendingCount > 0) {
      console.log('\n⏳ You have', pendingCount, 'pending profiles waiting to be processed');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

analyzeStatuses();