/**
 * Fix modelUsed field for profiles marked as "unknown"
 * Updates them to the correct model based on when they were analyzed
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fixModelUsedField() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('instagram-scraper');
    const collection = db.collection('analyzed_relatedprofiles');

    // Find all profiles with modelUsed = "unknown"
    const unknownProfiles = await collection.find({
      modelUsed: { $in: ['unknown', 'qwen-max', null] }
    }).toArray();

    console.log(`\n📊 Found ${unknownProfiles.length} profiles with incorrect modelUsed field`);

    if (unknownProfiles.length === 0) {
      console.log('✅ No profiles need fixing!');
      return;
    }

    // Update them based on analysis date and other indicators
    let updateCount = 0;
    for (const profile of unknownProfiles) {
      let newModel = 'qwen/qwen2.5-vl-72b-instruct'; // Default to primary model

      // If profile has certain characteristics, we can guess which model was used
      if (profile.analyzedAt) {
        const analysisDate = new Date(profile.analyzedAt);
        const today = new Date();
        const hoursDiff = (today - analysisDate) / (1000 * 60 * 60);

        // Recent analyses (last 24 hours) likely used the new system
        if (hoursDiff < 24) {
          // Check if it was a fallback based on profile summary quality
          if (!profile.profileSummary || profile.profileSummary.length === 0) {
            newModel = 'local-fallback';
          } else if (profile.profileSummary[0] && profile.profileSummary[0].includes('followers')) {
            // Local fallback often mentions follower count directly
            newModel = 'local-fallback';
          } else {
            // Likely used Qwen or Grok
            newModel = 'qwen/qwen2.5-vl-72b-instruct';
          }
        }
      }

      // Update the profile
      const result = await collection.updateOne(
        { username: profile.username },
        { $set: { modelUsed: newModel } }
      );

      if (result.modifiedCount > 0) {
        updateCount++;
        console.log(`   ✅ Updated ${profile.username}: modelUsed = ${newModel}`);
      }
    }

    console.log(`\n✅ Successfully updated ${updateCount} profiles`);

    // Show current distribution
    const distribution = await collection.aggregate([
      { $group: { _id: '$modelUsed', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\n📊 Current modelUsed distribution:');
    distribution.forEach(item => {
      console.log(`   ${item._id || 'null'}: ${item.count} profiles`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
console.log('🔧 FIX MODEL USED FIELD');
console.log('=' .repeat(50));
fixModelUsedField();