require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const apifyService = require('../services/apifyService');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const Session = require('../models/Session');
const logger = require('../utils/logger');

const API_BASE_URL = 'http://localhost:5000/api';

async function testDepthScraping() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB for testing');

        // Test profile
        const testProfile = 'soy_loruga';
        const profileUrl = `https://www.instagram.com/${testProfile}/`;
        
        console.log('\n📱 Testing depth-based scraping');
        console.log('================================');
        console.log(`Target Profile: @${testProfile}`);
        console.log(`Max Depth: 1`);
        console.log('================================\n');

        // Step 1: Create a session with depth 1
        console.log('1️⃣ Creating session with max depth 1...');
        let sessionId;
        try {
            const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`, {
                name: `Depth Test - ${testProfile} - ${Date.now()}`,
                description: `Testing depth scraping for @${testProfile}`,
                rootProfiles: [profileUrl],
                config: {
                    maxDepth: 1,
                    maxProfilesPerDepth: 50,
                    analysisEnabled: true
                }
            });
            
            const session = sessionResponse.data.data;
            sessionId = session._id;
            console.log(`✅ Session created: ${sessionId}`);
        } catch (error) {
            console.error('Failed to create session:', error.message);
            throw error;
        }

        // Step 2: Scrape the root profile
        console.log(`\n2️⃣ Scraping root profile @${testProfile}...`);
        const startTime = Date.now();
        
        const scrapeResponse = await axios.post(`${API_BASE_URL}/scraper/scrape/${testProfile}`, {
            sessionId: sessionId,
            useApify: true
        });
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (!scrapeResponse.data.success) {
            throw new Error(`Failed to scrape profile: ${scrapeResponse.data.message}`);
        }
        
        console.log(`✅ Successfully scraped @${testProfile} in ${duration}s`);

        // Step 3: Verify data is stored in MongoDB
        console.log('\n3️⃣ Verifying data in MongoDB...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for DB write
        
        const rootProfile = await RootProfileScraped.findOne({ 
            username: testProfile,
            sessionId: sessionId 
        });
        
        if (!rootProfile) {
            throw new Error('Root profile not found in database');
        }
        
        console.log(`✅ Root profile found in database`);
        console.log(`  - Status: ${rootProfile.status}`);
        console.log(`  - Followers: ${rootProfile.profileData?.followersCount?.toLocaleString()}`);
        console.log(`  - Following: ${rootProfile.profileData?.followingCount?.toLocaleString()}`);
        console.log(`  - Posts: ${rootProfile.profileData?.postsCount?.toLocaleString()}`);

        // Step 4: Extract related profiles
        console.log('\n4️⃣ Extracting related profiles...');
        const relatedProfiles = rootProfile.profileData?.relatedProfiles || [];
        console.log(`Found ${relatedProfiles.length} related profiles`);
        
        if (relatedProfiles.length === 0) {
            console.log('⚠️ No related profiles found in the scraped data');
            return;
        }

        // Show first 10 related profiles
        console.log('\nFirst 10 related profiles:');
        relatedProfiles.slice(0, 10).forEach((profile, index) => {
            console.log(`  ${index + 1}. @${profile.username || 'unknown'}`);
        });

        // Step 5: Filter unique profiles and check existing ones
        console.log('\n5️⃣ Filtering unique profiles and checking database...');
        
        // Extract unique usernames
        const uniqueUsernames = [...new Set(relatedProfiles
            .map(p => p.username)
            .filter(username => username && username.length > 0))];
        
        console.log(`Unique profiles to check: ${uniqueUsernames.length}`);

        // Check which profiles already exist in the database
        const existingProfiles = await RelatedProfileScraped.find({
            username: { $in: uniqueUsernames }
        }).select('username');
        
        const existingUsernames = existingProfiles.map(p => p.username);
        console.log(`Existing profiles in database: ${existingUsernames.length}`);
        
        // Filter out existing profiles
        const profilesToScrape = uniqueUsernames.filter(
            username => !existingUsernames.includes(username)
        );
        
        console.log(`New profiles to scrape: ${profilesToScrape.length}`);

        // Step 6: Scrape new related profiles (limit to first 5 for testing)
        if (profilesToScrape.length > 0) {
            console.log('\n6️⃣ Scraping new related profiles (first 5)...');
            const profilesToProcess = profilesToScrape.slice(0, 5);
            
            for (const username of profilesToProcess) {
                try {
                    console.log(`\n  Scraping @${username}...`);
                    const relatedProfileUrl = `https://www.instagram.com/${username}/`;
                    
                    // Scrape as related profile (not root)
                    const relatedProfile = await apifyService.scrapeProfile(
                        relatedProfileUrl, 
                        false, // isRootProfile = false
                        sessionId,
                        {
                            depth: 1,
                            parentUsername: testProfile,
                            parentProfileUrl: profileUrl
                        }
                    );
                    
                    // Save to RelatedProfileScraped collection
                    const savedProfile = new RelatedProfileScraped({
                        sessionId: sessionId,
                        username: username,
                        profileUrl: relatedProfileUrl,
                        depth: 1,
                        parentUsername: testProfile,
                        parentProfileUrl: profileUrl,
                        profileData: relatedProfile.profileData || relatedProfile,
                        scrapedAt: new Date()
                    });
                    
                    await savedProfile.save();
                    console.log(`  ✅ Saved @${username} to related profiles collection`);
                    
                    // Small delay to be respectful
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.log(`  ❌ Failed to scrape @${username}: ${error.message}`);
                }
            }
        }

        // Step 7: Final summary
        console.log('\n7️⃣ Final Summary');
        console.log('=================');
        const finalRootCount = await RootProfileScraped.countDocuments({ sessionId });
        const finalRelatedCount = await RelatedProfileScraped.countDocuments({ sessionId });
        
        console.log(`Session ID: ${sessionId}`);
        console.log(`Root profiles in session: ${finalRootCount}`);
        console.log(`Related profiles in session: ${finalRelatedCount}`);
        console.log(`Total profiles processed: ${finalRootCount + finalRelatedCount}`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    } finally {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    }
}

// Run the test
testDepthScraping();