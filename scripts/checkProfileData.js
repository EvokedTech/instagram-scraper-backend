require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');

async function main() {
    try {
        await connectDB();
        console.log('✅ Connected to MongoDB\n');

        // Find profiles for our target usernames
        const targetProfiles = [
            'julmodelsagency',
            'xolod2',
            'fer_portrait',
            'thejoakimkarlsson'
        ];

        for (const username of targetProfiles) {
            const profile = await RootProfileScraped.findOne({
                username: username.toLowerCase()
            }).sort({ createdAt: -1 });

            if (profile) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`@${username}:`);
                console.log(`${'='.repeat(60)}`);
                console.log(`  ID: ${profile._id}`);
                console.log(`  Status: ${profile.status}`);
                console.log(`  Has profileData: ${!!profile.profileData}`);
                console.log(`  Has rawData: ${!!profile.rawData}`);

                // Check if profileData exists
                if (profile.profileData) {
                    console.log(`  ProfileData fields:`);
                    console.log(`    - followersCount: ${profile.profileData.followersCount || 0}`);
                    console.log(`    - followingCount: ${profile.profileData.followingCount || 0}`);
                    console.log(`    - postsCount: ${profile.profileData.postsCount || 0}`);
                    console.log(`    - biography: ${profile.profileData.biography ? 'Yes' : 'No'}`);
                }

                // Direct field check
                console.log(`  Direct fields:`);
                console.log(`    - followersCount: ${profile.followersCount || 0}`);
                console.log(`    - followingCount: ${profile.followingCount || 0}`);
                console.log(`    - postsCount: ${profile.postsCount || 0}`);
                console.log(`    - bio: ${profile.bio ? 'Yes' : 'No'}`);
                console.log(`    - biography: ${profile.biography ? 'Yes' : 'No'}`);
            } else {
                console.log(`\n❌ Profile @${username} not found`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n\n👋 Disconnected from MongoDB');
    }
}

main();