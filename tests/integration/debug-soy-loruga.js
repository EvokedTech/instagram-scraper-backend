const mongoose = require('mongoose');
const logger = require('./src/utils/logger');
const RootProfileScraped = require('./src/models/RootProfileScraped');
const RelatedProfileScraped = require('./src/models/RelatedProfileScraped');
const relatedProfilesService = require('./src/services/relatedProfilesService');
require('dotenv').config();

async function debugSoyLoruga() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB');

        // Find the most recent soy_loruga root profile
        const rootProfile = await RootProfileScraped.findOne({
            username: 'soy_loruga',
            status: 'scraped'
        }).sort({ scrapedAt: -1 });

        if (!rootProfile) {
            logger.error('No scraped soy_loruga profile found');
            return;
        }

        logger.info('\n=== Root Profile Debug ===');
        logger.info(`Session ID: ${rootProfile.sessionId}`);
        logger.info(`Username: ${rootProfile.username}`);
        logger.info(`Profile URL: ${rootProfile.profileUrl}`);
        logger.info(`Status: ${rootProfile.status}`);
        logger.info(`Scraped At: ${rootProfile.scrapedAt}`);
        
        // Check related profiles in the scraped data
        const relatedProfilesCount = rootProfile.profileData?.relatedProfiles?.length || 0;
        logger.info(`Related profiles in data: ${relatedProfilesCount}`);
        
        if (relatedProfilesCount > 0) {
            logger.info('\nFirst 5 related profiles from scraped data:');
            rootProfile.profileData.relatedProfiles.slice(0, 5).forEach(p => {
                logger.info(`- ${p.username || p.userName || 'unknown'}`);
            });
        }

        // Try to extract related profiles manually
        logger.info('\n=== Manual Related Profiles Extraction ===');
        const extractionResult = await relatedProfilesService.extractRelatedProfiles(
            rootProfile.sessionId.toString(),
            2
        );

        logger.info('Extraction results:');
        logger.info(`- Total extracted: ${extractionResult.totalExtracted}`);
        logger.info(`- Unique profiles: ${extractionResult.uniqueProfiles}`);
        logger.info(`- Already in database: ${extractionResult.alreadyInDatabase}`);
        logger.info(`- Queued for scraping: ${extractionResult.queuedForScraping}`);

        // Check if related profiles were created
        const relatedCount = await RelatedProfileScraped.countDocuments({
            sessionId: rootProfile.sessionId
        });
        logger.info(`\nRelated profiles in database: ${relatedCount}`);

        // Check queue jobs
        const { queueManager } = require('./src/queues/queueManager');
        
        const rootQueueStats = await queueManager.getQueueStats('rootProfileQueue');
        const relatedQueueStats = await queueManager.getQueueStats('relatedProfileQueue');
        const depthQueueStats = await queueManager.getQueueStats('depthProcessingQueue');

        logger.info('\n=== Queue Statistics ===');
        logger.info('Root Profile Queue:', rootQueueStats);
        logger.info('Related Profile Queue:', relatedQueueStats);
        logger.info('Depth Processing Queue:', depthQueueStats);

    } catch (error) {
        logger.error('Debug failed:', error);
    } finally {
        await mongoose.connection.close();
        logger.info('\nDatabase connection closed');
    }
}

debugSoyLoruga();