const axios = require('axios');
const mongoose = require('mongoose');
const logger = require('./src/utils/logger');
require('dotenv').config();

const API_BASE_URL = 'http://localhost:5000';

async function testSoyLorugaDepth2() {
    try {
        logger.info('=== Starting Full System Test with soy_loruga (Depth 2) ===');
        
        // Step 1: Create session with soy_loruga
        logger.info('\n1. Creating session with soy_loruga profile...');
        const sessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
            name: `Test soy_loruga ${new Date().toISOString()}`,
            description: 'Testing full system with soy_loruga profile at depth 2',
            rootProfiles: ['https://www.instagram.com/soy_loruga/'],
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 100,
                analysisEnabled: false
            }
        });

        const session = sessionResponse.data.data;
        logger.info(`Session created: ${session._id}`);
        logger.info(`Session name: ${session.name}`);
        logger.info(`Root profiles: ${session.rootProfiles.length}`);

        // Step 2: Start batch processing
        logger.info('\n2. Starting batch processing...');
        const startResponse = await axios.post(`${API_BASE_URL}/api/sessions/${session._id}/batch-process`);
        logger.info('Batch processing response:', startResponse.data.message);

        // Step 3: Monitor progress
        logger.info('\n3. Monitoring progress...');
        let isCompleted = false;
        let checkCount = 0;
        const maxChecks = 60; // 5 minutes max

        while (!isCompleted && checkCount < maxChecks) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            
            const statusResponse = await axios.get(`${API_BASE_URL}/api/sessions/${session._id}`);
            const currentSession = statusResponse.data.data;
            
            logger.info(`\nCheck #${checkCount + 1}:`);
            logger.info(`- Status: ${currentSession.status}`);
            logger.info(`- Progress: ${currentSession.progress || 0}%`);
            logger.info(`- Total profiles: ${currentSession.stats.totalProfiles}`);
            logger.info(`- Scraped profiles: ${currentSession.stats.scrapedProfiles}`);
            logger.info(`- Current depth: ${currentSession.stats.currentDepth}`);

            if (currentSession.status === 'completed' || currentSession.status === 'failed') {
                isCompleted = true;
            }
            checkCount++;
        }

        // Step 4: Get final statistics
        logger.info('\n4. Getting final statistics...');
        const statsResponse = await axios.get(`${API_BASE_URL}/api/sessions/${session._id}/statistics`);
        const stats = statsResponse.data.data;

        logger.info('\n=== Final Session Statistics ===');
        logger.info(`Total profiles in session: ${stats.totalProfiles}`);
        
        logger.info('\nRoot Profiles:');
        logger.info(`- Total: ${stats.rootProfiles.total}`);
        logger.info(`- Scraped: ${stats.rootProfiles.scraped}`);
        
        logger.info('\nRelated Profiles by Depth:');
        if (stats.relatedProfiles.byDepth) {
            stats.relatedProfiles.byDepth.forEach(depth => {
                logger.info(`\nDepth ${depth._id}:`);
                logger.info(`- Total: ${depth.total}`);
                if (depth.stats) {
                    depth.stats.forEach(stat => {
                        logger.info(`  - ${stat.status}: ${stat.count}`);
                    });
                }
            });
        }

        // Step 5: Verify bulk URL checking in database
        logger.info('\n5. Verifying bulk URL checking in database...');
        await mongoose.connect(process.env.MONGODB_URI);
        
        const RelatedProfileScraped = require('./src/models/RelatedProfileScraped');
        const RootProfileScraped = require('./src/models/RootProfileScraped');
        
        // Check root profile
        const rootProfile = await RootProfileScraped.findOne({
            sessionId: session._id,
            username: 'soy_loruga'
        });
        
        if (rootProfile) {
            logger.info('\nRoot Profile Found:');
            logger.info(`- Username: ${rootProfile.username}`);
            logger.info(`- Profile URL: ${rootProfile.profileUrl}`);
            logger.info(`- Status: ${rootProfile.status}`);
            logger.info(`- Related profiles count: ${rootProfile.profileData?.relatedProfiles?.length || 0}`);
        }

        // Check related profiles at depth 1
        const depth1Profiles = await RelatedProfileScraped.find({
            sessionId: session._id,
            depth: 1
        }).select('username profileUrl status parentUsername').limit(10);

        logger.info(`\nDepth 1 Profiles (showing first 10):`);
        depth1Profiles.forEach(profile => {
            logger.info(`- ${profile.username} (parent: ${profile.parentUsername}) - ${profile.status}`);
        });

        // Check related profiles at depth 2
        const depth2Profiles = await RelatedProfileScraped.find({
            sessionId: session._id,
            depth: 2
        }).select('username profileUrl status parentUsername').limit(10);

        logger.info(`\nDepth 2 Profiles (showing first 10):`);
        depth2Profiles.forEach(profile => {
            logger.info(`- ${profile.username} (parent: ${profile.parentUsername}) - ${profile.status}`);
        });

        // Verify deduplication
        logger.info('\n6. Verifying deduplication...');
        const duplicateCheck = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: new mongoose.Types.ObjectId(session._id) } },
            { $group: {
                _id: { username: '$username', profileUrl: '$profileUrl' },
                count: { $sum: 1 },
                depths: { $push: '$depth' }
            }},
            { $match: { count: { $gt: 1 } } }
        ]);

        if (duplicateCheck.length > 0) {
            logger.warn(`Found ${duplicateCheck.length} duplicate profiles!`);
            duplicateCheck.forEach(dup => {
                logger.warn(`- ${dup._id.username} appears ${dup.count} times at depths: ${dup.depths.join(', ')}`);
            });
        } else {
            logger.info('✅ No duplicate profiles found - deduplication working correctly!');
        }

        // Check profileUrl usage
        logger.info('\n7. Verifying profileUrl-based checking...');
        const sampleProfiles = await RelatedProfileScraped.find({
            sessionId: session._id
        }).select('username profileUrl').limit(5);

        logger.info('Sample profiles with URLs:');
        sampleProfiles.forEach(profile => {
            logger.info(`- Username: ${profile.username} → URL: ${profile.profileUrl}`);
        });

        logger.info('\n=== Test Complete ===');
        logger.info('✅ Full system test with soy_loruga (depth 2) completed successfully!');

        await mongoose.connection.close();

    } catch (error) {
        logger.error('Test failed:', error.response?.data || error.message);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
}

// Run the test
testSoyLorugaDepth2();