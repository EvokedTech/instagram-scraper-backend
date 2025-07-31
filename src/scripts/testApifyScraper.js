require('dotenv').config();
const mongoose = require('mongoose');
const apifyService = require('../services/apifyService');
const logger = require('../utils/logger');
const Session = require('../models/Session');

async function testApifyScraper() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB for testing');

        // Create a test session
        const testSession = new Session({
            name: 'Apify Test Session',
            description: 'Testing Apify integration',
            rootProfiles: [
                'https://www.instagram.com/cristiano/',
                'https://www.instagram.com/natgeo/',
                'https://www.instagram.com/humansofny/'
            ],
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 100,
                analysisEnabled: true
            }
        });

        await testSession.save();
        logger.info(`Created test session: ${testSession._id}`);

        const testProfiles = [
            'https://www.instagram.com/cristiano/',
            'https://www.instagram.com/natgeo/',
            'https://www.instagram.com/humansofny/'
        ];

        logger.info('Testing single profile scraping...');
        const singleResult = await apifyService.scrapeProfile(testProfiles[0], true, testSession._id);
        logger.info('Single profile result:', {
            username: singleResult.username,
            status: singleResult.status,
            followersCount: singleResult.profileData?.followersCount,
            postsCount: singleResult.profileData?.postsCount
        });

        logger.info('\nTesting multiple profile scraping...');
        const multipleResults = await apifyService.scrapeMultipleProfiles(testProfiles.slice(1), false, null);
        
        logger.info('Multiple profiles results:');
        logger.info(`Successful: ${multipleResults.successful.length}`);
        multipleResults.successful.forEach(result => {
            logger.info(`- ${result.profile.username}: ${result.profile.followersCount} followers`);
        });
        
        if (multipleResults.failed.length > 0) {
            logger.info(`Failed: ${multipleResults.failed.length}`);
            multipleResults.failed.forEach(result => {
                logger.error(`- ${result.url}: ${result.error}`);
            });
        }

        const RootProfileScraped = require('../models/RootProfileScraped');
        const RelatedProfileScraped = require('../models/RelatedProfileScraped');
        
        const rootCount = await RootProfileScraped.countDocuments();
        const relatedCount = await RelatedProfileScraped.countDocuments();
        
        logger.info(`\nDatabase status:`);
        logger.info(`Root profiles: ${rootCount}`);
        logger.info(`Related profiles: ${relatedCount}`);

    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
        process.exit(0);
    }
}

testApifyScraper();