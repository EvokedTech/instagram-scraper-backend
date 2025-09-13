require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');

async function main() {
    try {
        await connectDB();
        console.log('✅ Connected to MongoDB\n');

        // Find all profiles
        const profiles = await RootProfileScraped.find({})
            .select('username fullName followersCount followingCount postsCount createdAt')
            .sort({ createdAt: -1 })
            .limit(20);

        console.log(`Found ${profiles.length} profiles in RootProfileScraped:\n`);

        profiles.forEach(profile => {
            console.log(`@${profile.username}:`);
            console.log(`  Full Name: ${profile.fullName || 'N/A'}`);
            console.log(`  Followers: ${profile.followersCount?.toLocaleString() || 0}`);
            console.log(`  Following: ${profile.followingCount?.toLocaleString() || 0}`);
            console.log(`  Posts: ${profile.postsCount?.toLocaleString() || 0}`);
            console.log(`  Created: ${profile.createdAt}`);
            console.log('');
        });

        // Find profiles with actual data
        const profilesWithData = await RootProfileScraped.find({
            followersCount: { $gt: 0 }
        }).select('username followersCount').sort({ followersCount: -1 });

        console.log(`\nProfiles with followers > 0: ${profilesWithData.length}`);
        profilesWithData.forEach(p => {
            console.log(`  @${p.username}: ${p.followersCount?.toLocaleString()} followers`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

main();