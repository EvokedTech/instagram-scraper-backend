const mongoose = require('mongoose');
const logger = require('./src/utils/logger');
const Session = require('./src/models/Session');
const RootProfileScraped = require('./src/models/RootProfileScraped');
const RelatedProfileScraped = require('./src/models/RelatedProfileScraped');
require('dotenv').config();

async function checkSoyLorugaTest() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB');

        // Find the most recent soy_loruga session
        const session = await Session.findOne({
            name: { $regex: /soy_loruga/i }
        }).sort({ createdAt: -1 });

        if (!session) {
            logger.error('No soy_loruga session found');
            return;
        }

        logger.info('\n=== Session Information ===');
        logger.info(`Session ID: ${session._id}`);
        logger.info(`Name: ${session.name}`);
        logger.info(`Status: ${session.status}`);
        logger.info(`Root Profiles: ${session.rootProfiles}`);
        logger.info(`Max Depth: ${session.config.maxDepth}`);
        logger.info(`Stats:`, session.stats);

        // Check root profile
        const rootProfile = await RootProfileScraped.findOne({
            sessionId: session._id,
            username: 'soy_loruga'
        });

        logger.info('\n=== Root Profile Status ===');
        if (rootProfile) {
            logger.info(`Username: ${rootProfile.username}`);
            logger.info(`Profile URL: ${rootProfile.profileUrl}`);
            logger.info(`Status: ${rootProfile.status}`);
            logger.info(`Scraped At: ${rootProfile.scrapedAt}`);
            logger.info(`Related Profiles Count: ${rootProfile.profileData?.relatedProfiles?.length || 0}`);
        } else {
            logger.info('Root profile not found in database');
        }

        // Check related profiles statistics
        const relatedStats = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: session._id } },
            {
                $group: {
                    _id: { depth: '$depth', status: '$status' },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.depth',
                    statuses: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    },
                    total: { $sum: '$count' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        logger.info('\n=== Related Profiles by Depth ===');
        relatedStats.forEach(depth => {
            logger.info(`\nDepth ${depth._id}:`);
            logger.info(`Total: ${depth.total}`);
            depth.statuses.forEach(status => {
                logger.info(`- ${status.status}: ${status.count}`);
            });
        });

        // Sample some related profiles at each depth
        logger.info('\n=== Sample Related Profiles ===');
        
        // Depth 1 samples
        const depth1Samples = await RelatedProfileScraped.find({
            sessionId: session._id,
            depth: 1
        }).select('username profileUrl status parentUsername').limit(5);

        logger.info('\nDepth 1 (first 5):');
        depth1Samples.forEach(profile => {
            logger.info(`- ${profile.username} (parent: ${profile.parentUsername}) - ${profile.status}`);
            logger.info(`  URL: ${profile.profileUrl}`);
        });

        // Depth 2 samples
        const depth2Samples = await RelatedProfileScraped.find({
            sessionId: session._id,
            depth: 2
        }).select('username profileUrl status parentUsername').limit(5);

        logger.info('\nDepth 2 (first 5):');
        depth2Samples.forEach(profile => {
            logger.info(`- ${profile.username} (parent: ${profile.parentUsername}) - ${profile.status}`);
            logger.info(`  URL: ${profile.profileUrl}`);
        });

        // Check for duplicate profiles
        logger.info('\n=== Duplicate Check ===');
        const duplicates = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: session._id } },
            {
                $group: {
                    _id: { profileUrl: '$profileUrl' },
                    count: { $sum: 1 },
                    usernames: { $push: '$username' },
                    depths: { $push: '$depth' }
                }
            },
            { $match: { count: { $gt: 1 } } },
            { $limit: 10 }
        ]);

        if (duplicates.length > 0) {
            logger.warn(`Found ${duplicates.length} duplicate profiles:`);
            duplicates.forEach(dup => {
                logger.warn(`- URL: ${dup._id.profileUrl}`);
                logger.warn(`  Appears ${dup.count} times at depths: ${dup.depths.join(', ')}`);
            });
        } else {
            logger.info('✅ No duplicate profiles found!');
        }

        // Check bulk URL usage
        logger.info('\n=== Bulk URL Checking Verification ===');
        const urlPatterns = await RelatedProfileScraped.find({
            sessionId: session._id
        }).select('username profileUrl').limit(10);

        logger.info('Profile URL patterns (first 10):');
        urlPatterns.forEach(profile => {
            const expectedUrl = `https://www.instagram.com/${profile.username}/`;
            const matches = profile.profileUrl === expectedUrl;
            logger.info(`- ${profile.username}: ${matches ? '✅' : '❌'} ${profile.profileUrl}`);
        });

        // Processing timeline
        logger.info('\n=== Processing Timeline ===');
        const timeline = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: session._id, scrapedAt: { $exists: true } } },
            {
                $group: {
                    _id: {
                        depth: '$depth',
                        minute: {
                            $dateToString: {
                                format: '%Y-%m-%d %H:%M',
                                date: '$scrapedAt'
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.minute': 1 } },
            { $limit: 20 }
        ]);

        logger.info('Scraping activity by minute:');
        timeline.forEach(t => {
            logger.info(`- ${t._id.minute} (Depth ${t._id.depth}): ${t.count} profiles`);
        });

    } catch (error) {
        logger.error('Error:', error);
    } finally {
        await mongoose.connection.close();
        logger.info('\nDatabase connection closed');
    }
}

// Run the check
checkSoyLorugaTest();