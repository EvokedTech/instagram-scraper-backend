const axios = require('axios');
const mongoose = require('mongoose');
const logger = require('./src/utils/logger');
require('dotenv').config();

const API_BASE_URL = 'http://localhost:5000';

async function testSoyLorugaSimple() {
    try {
        logger.info('=== Simple Test with soy_loruga ===');
        
        // Create session
        const sessionResponse = await axios.post(`${API_BASE_URL}/api/sessions`, {
            name: `Simple test ${Date.now()}`,
            rootProfiles: ['soy_loruga'], // Just username
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 50
            }
        });

        const session = sessionResponse.data.data;
        logger.info(`Session created: ${session._id}`);

        // Start processing using queue system
        logger.info('\nStarting queued batch processing...');
        const queueResponse = await axios.post(`${API_BASE_URL}/api/sessions/${session._id}/queue-process`);
        logger.info('Queue response:', queueResponse.data.message);

        // Wait and check results
        logger.info('\nWaiting 30 seconds for processing...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check database directly
        await mongoose.connect(process.env.MONGODB_URI);
        
        const Session = require('./src/models/Session');
        const RootProfileScraped = require('./src/models/RootProfileScraped');
        const RelatedProfileScraped = require('./src/models/RelatedProfileScraped');

        const dbSession = await Session.findById(session._id);
        logger.info('\nSession status:', dbSession.status);
        logger.info('Session stats:', dbSession.stats);

        // Check profiles
        const rootCount = await RootProfileScraped.countDocuments({ sessionId: session._id });
        const relatedCount = await RelatedProfileScraped.countDocuments({ sessionId: session._id });
        
        logger.info(`\nRoot profiles: ${rootCount}`);
        logger.info(`Related profiles: ${relatedCount}`);

        // Check depth statistics
        const depthStats = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: dbSession._id } },
            { $group: {
                _id: { depth: '$depth', status: '$status' },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.depth': 1 } }
        ]);

        logger.info('\nDepth statistics:');
        depthStats.forEach(stat => {
            logger.info(`Depth ${stat._id.depth} - ${stat._id.status}: ${stat.count}`);
        });

        await mongoose.connection.close();

    } catch (error) {
        logger.error('Test failed:', error.response?.data || error.message);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
}

testSoyLorugaSimple();