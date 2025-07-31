const mongoose = require('mongoose');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const { queueManager } = require('../queues/queueManager');
const { getSessionAnalysisStats } = require('../queues/n8nAnalysisQueue');
const depthProgressService = require('../services/depthProgressService');
const logger = require('../utils/logger');

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const dashboardController = {
    /**
     * Get all sessions with stats for dashboard
     */
    async getAllSessionsWithStats(req, res, next) {
        try {
            const { status, limit = 50, offset = 0 } = req.query;

            // Build query
            const query = {};
            if (status) {
                query.status = status;
            }

            // Get sessions
            const sessions = await Session.find(query)
                .sort('-createdAt')
                .limit(parseInt(limit))
                .skip(parseInt(offset))
                .lean();

            // Get detailed stats for each session
            const sessionsWithStats = await Promise.all(
                sessions.map(async (session) => {
                    // Since we used .lean(), session is already a plain object
                    // No need to convert or refetch
                    const sessionData = session;
                    
                    // Add calculated virtuals manually for lean queries
                    if (sessionData.stats?.startedAt && sessionData.stats?.completedAt) {
                        sessionData.duration = new Date(sessionData.stats.completedAt) - new Date(sessionData.stats.startedAt);
                    }
                    sessionData.progressPercentage = sessionData.progressPercentage || 0;

                    // Get profile counts
                    const [rootCount, relatedCountByDepth, analysisCount] = await Promise.all([
                        RootProfileScraped.countDocuments({ sessionId: session._id }),
                        RelatedProfileScraped.aggregate([
                            { $match: { sessionId: session._id } },
                            {
                                $group: {
                                    _id: '$depth',
                                    count: { $sum: 1 },
                                    scraped: {
                                        $sum: { $cond: [{ $eq: ['$status', 'scraped'] }, 1, 0] }
                                    },
                                    failed: {
                                        $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                                    },
                                    pending: {
                                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                                    },
                                    analyzed: {
                                        $sum: { $cond: [{ $eq: ['$status', 'analyzed'] }, 1, 0] }
                                    }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ]),
                        RelatedProfileScraped.countDocuments({ sessionId: session._id, n8nProcessed: true })
                    ]);

                    // Get queue stats for this session
                    let queueStats = {};
                    try {
                        // Try to get queue stats if Redis is available
                        const allQueuesStatus = await queueManager.getAllQueuesStatus();
                        queueStats = {
                            rootProfileQueue: allQueuesStatus.find(q => q.name === 'rootProfileQueue') || {},
                            relatedProfileQueue: allQueuesStatus.find(q => q.name === 'relatedProfileQueue') || {},
                            depthProcessingQueue: allQueuesStatus.find(q => q.name === 'depthProcessingQueue') || {}
                        };
                    } catch (queueError) {
                        logger.warn('Failed to get queue stats, Redis might be down:', queueError.message);
                        // Return empty queue stats if Redis is down
                        queueStats = {
                            rootProfileQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
                            relatedProfileQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
                            depthProcessingQueue: { waiting: 0, active: 0, completed: 0, failed: 0 }
                        };
                    }

                    return {
                        ...sessionData,
                        profileStats: {
                            rootProfiles: rootCount,
                            relatedProfilesByDepth: relatedCountByDepth,
                            totalProfiles: rootCount + relatedCountByDepth.reduce((sum, d) => sum + d.count, 0),
                            analyzedProfiles: analysisCount
                        },
                        queueStats
                    };
                })
            );

            res.json({
                success: true,
                data: sessionsWithStats,
                pagination: {
                    total: await Session.countDocuments(query),
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
        } catch (error) {
            logger.error('Error fetching sessions for dashboard:', error);
            next(error);
        }
    },

    /**
     * Get detailed session monitoring data
     */
    async getSessionMonitoring(req, res, next) {
        try {
            const { id } = req.params;

            const session = await Session.findById(id);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            // Debug: Check a sample root profile's metadata
            const sampleRootProfile = await RootProfileScraped.findOne({ 
                sessionId: session._id, 
                status: 'scraped' 
            }).select('username metadata');
            
            if (sampleRootProfile) {
                logger.info('Sample root profile metadata:', {
                    username: sampleRootProfile.username,
                    metadata: sampleRootProfile.metadata
                });
            }

            // Get comprehensive stats
            const [
                rootProfileStats,
                relatedProfileStats,
                recentProfiles,
                queueStats,
                processingMetrics,
                analysisStats,
                depthProgress
            ] = await Promise.all([
                // Root profile statistics with enhanced metrics
                RootProfileScraped.aggregate([
                    { $match: { sessionId: session._id } },
                    {
                        $project: {
                            status: 1,
                            username: 1,
                            profileUrl: 1,
                            // Calculate related count from profileData.relatedProfiles array if metadata is missing
                            relatedCount: { 
                                $ifNull: [
                                    '$metadata.relatedProfilesCount', 
                                    { $size: { $ifNull: ['$profileData.relatedProfiles', []] } }
                                ] 
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            profiles: { $push: { username: '$username', profileUrl: '$profileUrl' } },
                            totalRelatedProfilesFound: { $sum: '$relatedCount' }
                        }
                    }
                ]).then(result => {
                    logger.info('Root profile aggregation result:', {
                        sessionId: session._id,
                        result: JSON.stringify(result, null, 2)
                    });
                    return result;
                }),

                // Related profile statistics by depth with enhanced metrics
                RelatedProfileScraped.aggregate([
                    { $match: { sessionId: session._id } },
                    {
                        $group: {
                            _id: { depth: '$depth', status: '$status' },
                            count: { $sum: 1 },
                            avgProcessingTime: { $avg: '$metadata.processingTime' },
                            relatedProfilesFound: { $sum: '$metadata.relatedProfilesCount' }
                        }
                    },
                    {
                        $group: {
                            _id: '$_id.depth',
                            statusBreakdown: {
                                $push: {
                                    status: '$_id.status',
                                    count: '$count',
                                    avgProcessingTime: '$avgProcessingTime'
                                }
                            },
                            total: { $sum: '$count' },
                            totalRelatedProfilesFound: { $sum: '$relatedProfilesFound' }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]),

                // Recent profiles (last 20)
                RelatedProfileScraped.find({ sessionId: session._id })
                    .sort('-updatedAt')
                    .limit(20)
                    .select('username profileUrl depth status parentUsername updatedAt'),

                // Queue statistics
                dashboardController.getSessionQueueStats(id),

                // Processing metrics
                dashboardController.calculateProcessingMetrics(session._id),

                // Analysis statistics
                getSessionAnalysisStats(session._id),

                // Depth progress statistics
                depthProgressService.getDetailedProgress(session._id)
            ]);

            // Calculate current processing info
            const currentlyProcessing = await RelatedProfileScraped.countDocuments({
                sessionId: session._id,
                status: 'scraping'
            });

            // Get profiles that were reused from database (already existed)
            const profileReuseStats = await RelatedProfileScraped.aggregate([
                { $match: { sessionId: session._id } },
                {
                    $group: {
                        _id: '$depth',
                        totalProfiles: { $sum: 1 },
                        existingProfiles: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$metadata.existingProfile', true] },
                                    1,
                                    0
                                ]
                            }
                        },
                        scrapedProfiles: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'scraped'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            // Get root profile reuse statistics
            // Since root profiles don't have metadata.existingProfile, we'll count based on:
            // - Total in session.rootProfiles (includes existing that weren't re-scraped)
            // - Actually scraped (those with records in RootProfileScraped)
            const rootProfileCount = await RootProfileScraped.countDocuments({ 
                sessionId: session._id 
            });
            
            const rootProfileScrapedCount = await RootProfileScraped.countDocuments({ 
                sessionId: session._id,
                status: 'scraped'
            });
            
            // Total root profiles from session includes both existing and new
            const totalRootProfiles = session.rootProfiles.length;
            const existingRootProfiles = totalRootProfiles - rootProfileCount;
            
            const rootProfileReuseStats = [{
                _id: null,
                totalProfiles: totalRootProfiles,
                existingProfiles: existingRootProfiles,
                scrapedProfiles: rootProfileScrapedCount
            }];

            // Calculate queue stats by depth
            const queueStatsByDepth = await queueManager.getQueueStatsByDepth(session._id);

            // Convert session to object and include virtual properties
            const sessionData = session.toObject({ virtuals: true });
            
            // Check if session should be marked as completed
            if (sessionData.progressPercentage >= 100 && session.status === 'running') {
                logger.info(`Session ${session._id} has 100% progress but still running, checking completion`);
                const sessionCompletionService = require('../services/sessionCompletionService');
                // Run completion check asynchronously without blocking the response
                setImmediate(async () => {
                    try {
                        const wasCompleted = await sessionCompletionService.checkAndUpdateSessionCompletion(session._id);
                        if (wasCompleted) {
                            logger.info(`Session ${session._id} was successfully marked as completed`);
                        }
                    } catch (error) {
                        logger.error(`Error checking completion for session ${session._id}:`, error);
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    session: sessionData,
                    rootProfileStats,
                    relatedProfileStats,
                    recentProfiles,
                    queueStats,
                    processingMetrics,
                    analysisStats,
                    currentlyProcessing,
                    profileReuseStats,
                    rootProfileReuseStats,
                    queueStatsByDepth,
                    depthProgress,
                    lastUpdated: new Date()
                }
            });
        } catch (error) {
            logger.error('Error fetching session monitoring data:', error);
            next(error);
        }
    },

    /**
     * Get system-wide analytics
     */
    async getSystemAnalytics(req, res, next) {
        try {
            const [
                sessionStats,
                profileStats,
                queueStats,
                systemHealth,
                recentActivity,
                analysisOverview,
                collectionStats
            ] = await Promise.all([
                // Session statistics
                Session.aggregate([
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]),

                // Profile statistics
                Promise.all([
                    RootProfileScraped.countDocuments(),
                    RelatedProfileScraped.countDocuments(),
                    RelatedProfileScraped.aggregate([
                        {
                            $group: {
                                _id: '$depth',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ])
                ]),

                // All queues statistics
                dashboardController.getAllQueuesStats(),

                // System health check
                dashboardController.checkSystemHealth(),

                // Recent activity (last 50 actions)
                dashboardController.getRecentActivity(50),

                // Analysis overview
                dashboardController.getAnalysisOverview(),

                // Collection statistics
                dashboardController.getCollectionStats()
            ]);

            // Calculate aggregated metrics
            const totalProfiles = profileStats[0] + profileStats[1];
            const successRate = await dashboardController.calculateGlobalSuccessRate();
            const processingSpeed = await dashboardController.calculateGlobalProcessingSpeed();

            res.json({
                success: true,
                data: {
                    overview: {
                        totalSessions: sessionStats.reduce((sum, s) => sum + s.count, 0),
                        sessionsByStatus: sessionStats,
                        totalProfiles,
                        rootProfiles: profileStats[0],
                        relatedProfiles: profileStats[1],
                        profilesByDepth: profileStats[2]
                    },
                    performance: {
                        successRate,
                        processingSpeed,
                        queueStats
                    },
                    analysis: analysisOverview,
                    systemHealth,
                    collectionStats,
                    recentActivity,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Error fetching system analytics:', error);
            next(error);
        }
    },

    /**
     * Get paginated profile lists by depth for a session
     */
    async getSessionProfilesByDepth(req, res, next) {
        try {
            const { id } = req.params;
            const { 
                depth = 0, 
                status, 
                limit = 50, 
                offset = 0,
                search
            } = req.query;

            const depthInt = parseInt(depth);
            let profiles = [];
            let total = 0;
            let statusBreakdown = [];

            if (depthInt === 0) {
                // Depth 0: Query RootProfileScraped collection
                const query = {
                    sessionId: new mongoose.Types.ObjectId(id)
                };

                if (status) {
                    query.status = status;
                }

                if (search) {
                    query.username = { $regex: search, $options: 'i' };
                }

                // Get root profiles
                const rootProfiles = await RootProfileScraped.find(query)
                    .sort('-createdAt')
                    .limit(parseInt(limit))
                    .skip(parseInt(offset))
                    .select('username profileUrl status profileData scrapedAt createdAt updatedAt metadata.processingTime')
                    .lean();

                // Transform root profiles to match related profile structure
                profiles = rootProfiles.map(profile => ({
                    _id: profile._id,
                    username: profile.username,
                    profileUrl: profile.profileUrl,
                    depth: 0,
                    status: profile.status,
                    parentUsername: null, // Root profiles have no parent
                    profileData: profile.profileData ? {
                        fullName: profile.profileData.fullName,
                        followersCount: profile.profileData.followersCount,
                        followsCount: profile.profileData.followsCount,
                        postsCount: profile.profileData.postsCount,
                        verified: profile.profileData.verified,
                        isPrivate: profile.profileData.private
                    } : null,
                    metadata: {
                        processingTime: profile.metadata?.processingTime
                    },
                    scrapedAt: profile.scrapedAt,
                    createdAt: profile.createdAt,
                    updatedAt: profile.updatedAt
                }));

                // Get total count
                total = await RootProfileScraped.countDocuments(query);

                // Get status breakdown
                statusBreakdown = await RootProfileScraped.aggregate([
                    { $match: { sessionId: new mongoose.Types.ObjectId(id) } },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]);
            } else {
                // Depth > 0: Query RelatedProfileScraped collection
                const query = {
                    sessionId: new mongoose.Types.ObjectId(id),
                    depth: depthInt
                };

                if (status) {
                    query.status = status;
                }

                if (search) {
                    query.username = { $regex: search, $options: 'i' };
                }

                // Get related profiles
                const relatedProfiles = await RelatedProfileScraped.find(query)
                    .sort('-createdAt')
                    .limit(parseInt(limit))
                    .skip(parseInt(offset))
                    .select('username profileUrl depth status parentUsername profileData scrapedAt createdAt updatedAt metadata.processingTime')
                    .lean();

                // Transform to ensure consistent structure
                profiles = relatedProfiles.map(profile => ({
                    _id: profile._id,
                    username: profile.username,
                    profileUrl: profile.profileUrl,
                    depth: profile.depth,
                    status: profile.status,
                    parentUsername: profile.parentUsername,
                    profileData: profile.profileData ? {
                        fullName: profile.profileData.fullName,
                        followersCount: profile.profileData.followersCount,
                        followsCount: profile.profileData.followsCount,
                        postsCount: profile.profileData.postsCount,
                        verified: profile.profileData.verified,
                        isPrivate: profile.profileData.private
                    } : null,
                    metadata: {
                        processingTime: profile.metadata?.processingTime
                    },
                    scrapedAt: profile.scrapedAt,
                    createdAt: profile.createdAt,
                    updatedAt: profile.updatedAt
                }));

                // Get total count
                total = await RelatedProfileScraped.countDocuments(query);

                // Get status breakdown
                statusBreakdown = await RelatedProfileScraped.aggregate([
                    { $match: { sessionId: new mongoose.Types.ObjectId(id), depth: depthInt } },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]);
            }

            res.json({
                success: true,
                data: {
                    profiles,
                    statusBreakdown,
                    pagination: {
                        total,
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        pages: Math.ceil(total / parseInt(limit))
                    }
                }
            });
        } catch (error) {
            logger.error('Error fetching session profiles by depth:', error);
            next(error);
        }
    },

    // Helper methods
    async getSessionQueueStats(sessionId) {
        try {
            const queues = ['rootProfileQueue', 'relatedProfileBatchQueue'];
            const stats = {};

            for (const queueName of queues) {
                const queue = queueManager.getQueue(queueName);
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.getCompletedCount(),
                    queue.getFailedCount()
                ]);

                // Get session-specific jobs
                const allJobs = await queue.getJobs(['waiting', 'active']);
                const sessionJobs = allJobs.filter(job => job.data.sessionId === sessionId);

                stats[queueName] = {
                    total: { waiting, active, completed, failed },
                    session: {
                        waiting: sessionJobs.filter(j => j.opts.delay === undefined).length,
                        active: sessionJobs.filter(j => j.isActive()).length
                    }
                };
            }

            return stats;
        } catch (error) {
            logger.error('Error getting session queue stats:', error);
            return {};
        }
    },

    async getAllQueuesStats() {
        try {
            const queueNames = [
                'rootProfileQueue',
                'relatedProfileQueue',
                'relatedProfileBatchQueue',
                'depthProcessingQueue',
                'analysisQueue'
            ];

            const stats = {};
            for (const queueName of queueNames) {
                const queue = queueManager.getQueue(queueName);
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.getCompletedCount(),
                    queue.getFailedCount()
                ]);

                stats[queueName] = {
                    waiting,
                    active,
                    completed,
                    failed,
                    total: waiting + active + completed + failed
                };
            }

            return stats;
        } catch (error) {
            logger.error('Error getting all queues stats:', error);
            return {};
        }
    },

    async calculateProcessingMetrics(sessionId) {
        try {
            const metrics = await RelatedProfileScraped.aggregate([
                { $match: { sessionId, status: 'scraped' } },
                {
                    $group: {
                        _id: null,
                        avgProcessingTime: { $avg: '$metadata.processingTime' },
                        minProcessingTime: { $min: '$metadata.processingTime' },
                        maxProcessingTime: { $max: '$metadata.processingTime' },
                        totalProcessed: { $sum: 1 }
                    }
                }
            ]);

            // Calculate processing rate (profiles per minute)
            const session = await Session.findById(sessionId);
            const duration = session.duration || 0; // in milliseconds
            const processingRate = duration > 0 
                ? (metrics[0]?.totalProcessed || 0) / (duration / 60000) 
                : 0;

            return {
                ...metrics[0],
                processingRate,
                estimatedTimeRemaining: await dashboardController.estimateTimeRemaining(sessionId)
            };
        } catch (error) {
            logger.error('Error calculating processing metrics:', error);
            return {};
        }
    },

    async estimateTimeRemaining(sessionId) {
        try {
            const [pending, avgTime] = await Promise.all([
                RelatedProfileScraped.countDocuments({ sessionId, status: 'pending' }),
                RelatedProfileScraped.aggregate([
                    { $match: { sessionId, status: 'scraped' } },
                    { $group: { _id: null, avg: { $avg: '$metadata.processingTime' } } }
                ])
            ]);

            const avgProcessingTime = avgTime[0]?.avg || 10; // seconds
            return pending * avgProcessingTime; // seconds
        } catch (error) {
            return 0;
        }
    },

    async calculateGlobalSuccessRate() {
        try {
            const [successful, failed] = await Promise.all([
                RelatedProfileScraped.countDocuments({ status: 'scraped' }),
                RelatedProfileScraped.countDocuments({ status: 'failed' })
            ]);

            const total = successful + failed;
            return total > 0 ? (successful / total) * 100 : 0;
        } catch (error) {
            return 0;
        }
    },

    async calculateGlobalProcessingSpeed() {
        try {
            // Get profiles processed in last hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const processed = await RelatedProfileScraped.countDocuments({
                status: 'scraped',
                updatedAt: { $gte: oneHourAgo }
            });

            return processed; // profiles per hour
        } catch (error) {
            return 0;
        }
    },

    async checkSystemHealth() {
        try {
            const health = {
                mongodb: 'healthy',
                redis: 'healthy',
                api: 'healthy',
                timestamp: new Date()
            };

            // Check MongoDB
            try {
                await Session.findOne().limit(1);
            } catch (error) {
                health.mongodb = 'unhealthy';
            }

            // Check Redis (via queue)
            try {
                const queue = queueManager.getQueue('rootProfileQueue');
                await queue.getJobCounts();
            } catch (error) {
                health.redis = 'unhealthy';
            }

            // API is healthy if we got here
            health.overall = health.mongodb === 'healthy' && health.redis === 'healthy' 
                ? 'healthy' : 'degraded';

            return health;
        } catch (error) {
            return {
                overall: 'unhealthy',
                mongodb: 'unknown',
                redis: 'unknown',
                api: 'unknown',
                timestamp: new Date()
            };
        }
    },

    async getRecentActivity(limit = 50) {
        try {
            const recentProfiles = await RelatedProfileScraped.find({ status: 'scraped' })
                .sort('-updatedAt')
                .limit(limit)
                .select('username profileUrl sessionId depth updatedAt')
                .lean();

            const recentSessions = await Session.find({ status: { $in: ['running', 'completed'] } })
                .sort('-updatedAt')
                .limit(10)
                .select('name status updatedAt')
                .lean();

            return {
                profiles: recentProfiles,
                sessions: recentSessions
            };
        } catch (error) {
            return { profiles: [], sessions: [] };
        }
    },

    async getAnalysisOverview() {
        try {
            const [
                totalAnalyzed,
                totalPendingAnalysis,
                n8nQueueStats
            ] = await Promise.all([
                // Total profiles analyzed (from analyzed_relatedprofiles collection)
                mongoose.connection.collection('analyzed_relatedprofiles').countDocuments({}),
                
                // Total pending n8n analysis
                RelatedProfileScraped.countDocuments({ status: 'scraped', n8nProcessed: { $ne: true } }),
                
                // n8n queue stats
                require('../queues/n8nAnalysisQueue').getQueueStats()
            ]);

            return {
                totalAnalyzed,
                totalPendingAnalysis,
                n8nQueueStats,
                percentComplete: (totalAnalyzed + totalPendingAnalysis) > 0 
                    ? Math.round((totalAnalyzed / (totalAnalyzed + totalPendingAnalysis)) * 100) 
                    : 0
            };
        } catch (error) {
            logger.error('Error getting analysis overview:', error);
            return {
                totalAnalyzed: 0,
                totalPendingAnalysis: 0,
                n8nQueueStats: { waiting: 0, active: 0, completed: 0, failed: 0 },
                percentComplete: 0
            };
        }
    },

    /**
     * Get database-wide profile statistics and recent profiles
     */
    async getCollectionStats() {
        try {
            const collections = [
                { name: 'sessions', displayName: 'Sessions' },
                { name: 'rootprofiles_scraped_datas', displayName: 'Root Profiles' },
                { name: 'relatedprofiles_scraped_datas', displayName: 'Related Profiles' },
                { name: 'analyzed_relatedprofiles', displayName: 'Analyzed Profiles' }
            ];

            const stats = await Promise.all(
                collections.map(async (col) => {
                    try {
                        const count = await mongoose.connection.collection(col.name).countDocuments({});
                        const stats = await mongoose.connection.collection(col.name).stats();
                        return {
                            name: col.displayName,
                            count,
                            size: formatBytes(stats.size || 0)
                        };
                    } catch (error) {
                        // Collection might not exist
                        return {
                            name: col.displayName,
                            count: 0,
                            size: '0 B'
                        };
                    }
                })
            );

            return stats;
        } catch (error) {
            logger.error('Error getting collection stats:', error);
            return [];
        }
    },

    async getDatabaseProfiles(req, res, next) {
        try {
            const { limit = 20, offset = 0, type = 'all' } = req.query;

            // Get total counts from all collections
            const [totalRootProfiles, totalRelatedProfiles, analyzedProfiles] = await Promise.all([
                RootProfileScraped.countDocuments({}),
                RelatedProfileScraped.countDocuments({}),
                mongoose.connection.collection('analyzed_relatedprofiles').countDocuments({})
            ]);


            // Get recent profiles based on type
            let profiles = [];
            
            if (type === 'all' || type === 'root') {
                const rootProfiles = await RootProfileScraped.find({ status: 'scraped' })
                    .sort('-createdAt')
                    .limit(parseInt(limit))
                    .skip(parseInt(offset))
                    .select('username profileData createdAt sessionId')
                    .lean();
                
                profiles = profiles.concat(rootProfiles.map(p => ({
                    ...p,
                    type: 'root',
                    depth: 0,
                    // Map profileData fields to top level for consistency
                    metadata: {
                        fullName: p.profileData?.fullName,
                        profilePicUrl: p.profileData?.profilePicUrl,
                        followersCount: p.profileData?.followersCount,
                        followsCount: p.profileData?.followsCount,
                        postsCount: p.profileData?.postsCount,
                        biography: p.profileData?.biography,
                        isVerified: p.profileData?.isVerified
                    }
                })));
            }

            if (type === 'all' || type === 'related') {
                const relatedProfiles = await RelatedProfileScraped.find({ status: 'scraped' })
                    .sort('-createdAt')
                    .limit(parseInt(limit))
                    .skip(parseInt(offset))
                    .select('username profileData depth createdAt sessionId n8nProcessed parentUsername')
                    .lean();
                
                profiles = profiles.concat(relatedProfiles.map(p => ({
                    ...p,
                    type: 'related',
                    isAnalyzed: p.n8nProcessed,
                    parentUsername: p.parentUsername,
                    // Map profileData fields to top level for consistency
                    metadata: {
                        fullName: p.profileData?.fullName,
                        profilePicUrl: p.profileData?.profilePicUrl,
                        followersCount: p.profileData?.followersCount,
                        followsCount: p.profileData?.followsCount,
                        postsCount: p.profileData?.postsCount,
                        biography: p.profileData?.biography,
                        isVerified: p.profileData?.isVerified
                    }
                })));
            }

            if (type === 'all' || type === 'analyzed') {
                const analyzedProfiles = await mongoose.connection.collection('analyzed_relatedprofiles')
                    .find({})
                    .sort({ _id: -1 })
                    .limit(parseInt(limit))
                    .skip(parseInt(offset))
                    .toArray();
                
                profiles = profiles.concat(analyzedProfiles.map(p => ({
                    _id: p._id,
                    username: p.username,
                    type: 'analyzed',
                    depth: null,
                    isAnalyzed: true,
                    parentUsername: p.parentUsername,
                    adultContentScore: p.adultContentScore,
                    storedTag: p.contentType?.[0] || 
                               p.businessCategorySuitability?.perfectMatch?.[0]?.category || 
                               'Analyzed',
                    createdAt: p._id.getTimestamp ? p._id.getTimestamp() : new Date(),
                    // Analyzed profiles have data at top level
                    metadata: {
                        fullName: p.fullName,
                        profilePicUrl: p.profilePicUrl,
                        followersCount: p.accountMetrics?.followersCount,
                        followsCount: p.accountMetrics?.followingCount,
                        postsCount: p.accountMetrics?.postsCount,
                        biography: p.profileSummary?.[0] || '',
                        isVerified: p.accountMetrics?.verified,
                        engagementRate: p.engagementRate,
                        contentType: p.contentType
                    }
                })));
            }

            // Sort by creation date if mixing types
            if (type === 'all') {
                profiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                profiles = profiles.slice(0, parseInt(limit));
            }

            res.json({
                success: true,
                data: {
                    statistics: {
                        totalRootProfiles,
                        totalRelatedProfiles,
                        totalProfiles: totalRootProfiles + totalRelatedProfiles,
                        analyzedProfiles
                    },
                    profiles,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: profiles.length === parseInt(limit)
                    }
                }
            });
        } catch (error) {
            logger.error('Error fetching database profiles:', error);
            next(error);
        }
    }
};

module.exports = dashboardController;