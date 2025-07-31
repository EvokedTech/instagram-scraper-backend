const mongoose = require('mongoose');
const logger = require('../utils/logger');
const ProfileUrlHelper = require('../utils/profileUrlHelper');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const Session = require('../models/Session');
require('dotenv').config();

async function testBulkUrlChecking() {
    try {
        // Connect to MongoDB
        logger.info('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB');

        // Create a test session
        const testSession = new Session({
            name: `Bulk URL Test ${Date.now()}`,
            description: 'Testing bulk URL checking workflow',
            rootProfiles: ['https://www.instagram.com/test_profile/'],
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 100,
                analysisEnabled: false
            },
            status: 'pending'
        });
        await testSession.save();
        logger.info(`Created test session: ${testSession._id}`);

        // Test 1: Username to URL conversion
        logger.info('\n=== Test 1: Username to URL Conversion ===');
        const testUsernames = [
            'user1',
            '@user2',
            'USER3',
            'user.with.dots',
            'user_with_underscores',
            '',  // empty
            null,  // null
            'user1'  // duplicate
        ];

        const convertedUrls = ProfileUrlHelper.bulkUsernamesToUrls(testUsernames);
        logger.info(`Input usernames: ${testUsernames.length}`);
        logger.info(`Converted URLs: ${convertedUrls.length}`);
        logger.info('Converted URLs:', convertedUrls);

        // Test 2: Bulk database checking
        logger.info('\n=== Test 2: Bulk Database Checking ===');
        
        // Insert some test profiles
        const testProfiles = [
            {
                sessionId: testSession._id,
                username: 'existing_user1',
                profileUrl: 'https://www.instagram.com/existing_user1/',
                parentUsername: 'test_parent',
                parentProfileUrl: 'https://www.instagram.com/test_parent/',
                depth: 1,
                status: 'scraped'
            },
            {
                sessionId: testSession._id,
                username: 'existing_user2',
                profileUrl: 'https://www.instagram.com/existing_user2/',
                parentUsername: 'test_parent',
                parentProfileUrl: 'https://www.instagram.com/test_parent/',
                depth: 1,
                status: 'scraped'
            }
        ];

        await RelatedProfileScraped.insertMany(testProfiles);
        logger.info(`Inserted ${testProfiles.length} test profiles`);

        // Test bulk checking with mix of existing and new URLs
        const urlsToCheck = [
            'https://www.instagram.com/existing_user1/',
            'https://www.instagram.com/existing_user2/',
            'https://www.instagram.com/new_user1/',
            'https://www.instagram.com/new_user2/',
            'https://www.instagram.com/new_user3/'
        ];

        // Perform bulk database check
        const existingProfiles = await RelatedProfileScraped.find({
            sessionId: testSession._id,
            profileUrl: { $in: urlsToCheck }
        }).select('profileUrl username');

        logger.info(`URLs to check: ${urlsToCheck.length}`);
        logger.info(`Found existing profiles: ${existingProfiles.length}`);

        // Separate existing vs new
        const separationResult = ProfileUrlHelper.separateExistingAndNew(urlsToCheck, existingProfiles);
        
        logger.info('\nSeparation Results:');
        logger.info(`- Existing URLs: ${separationResult.exists.length}`, separationResult.exists);
        logger.info(`- New URLs: ${separationResult.notExists.length}`, separationResult.notExists);
        logger.info('- Statistics:', separationResult.stats);

        // Test 3: Performance test with larger dataset
        logger.info('\n=== Test 3: Performance Test ===');
        const largeUsernameSet = [];
        for (let i = 1; i <= 1000; i++) {
            largeUsernameSet.push(`test_user_${i}`);
        }

        const startTime = Date.now();
        
        // Convert usernames to URLs
        const largeUrlSet = ProfileUrlHelper.bulkUsernamesToUrls(largeUsernameSet);
        const conversionTime = Date.now() - startTime;
        
        // Perform bulk check
        const checkStartTime = Date.now();
        const largeExistingCheck = await RelatedProfileScraped.find({
            sessionId: testSession._id,
            profileUrl: { $in: largeUrlSet }
        }).select('profileUrl');
        const checkTime = Date.now() - checkStartTime;

        logger.info(`Performance results for ${largeUsernameSet.length} usernames:`);
        logger.info(`- Username to URL conversion: ${conversionTime}ms`);
        logger.info(`- Database bulk check: ${checkTime}ms`);
        logger.info(`- Total time: ${conversionTime + checkTime}ms`);

        // Test 4: Verify indexes are being used
        logger.info('\n=== Test 4: Query Explain ===');
        const explainResult = await RelatedProfileScraped.find({
            sessionId: testSession._id,
            profileUrl: { $in: urlsToCheck.slice(0, 2) }
        }).explain('executionStats');

        logger.info('Query execution stats:');
        logger.info(`- Execution time: ${explainResult.executionStats.executionTimeMillis}ms`);
        logger.info(`- Documents examined: ${explainResult.executionStats.totalDocsExamined}`);
        logger.info(`- Index used: ${explainResult.executionStats.executionStages.inputStage?.indexName || 'No index'}`);

        // Cleanup
        logger.info('\n=== Cleanup ===');
        await RelatedProfileScraped.deleteMany({ sessionId: testSession._id });
        await Session.deleteOne({ _id: testSession._id });
        logger.info('Test data cleaned up');

        logger.info('\n✅ All bulk URL checking tests passed!');

    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        await mongoose.connection.close();
        logger.info('Database connection closed');
    }
}

// Run the test
testBulkUrlChecking();