const logger = require('../utils/logger');
const { queueManager } = require('../queues/queueManager');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');

class QueuedBatchProcessingService {
    /**
     * Process root profiles using queue system
     * @param {string} sessionId - Session ID
     * @param {Array} profileUrls - Array of Instagram profile URLs
     * @param {Object} options - Processing options
     */
    async processRootProfilesWithQueue(sessionId, profileUrls, options = {}) {
        const startTime = Date.now();
        const priority = options.priority || 1;
        
        logger.info(`Starting queued batch processing for session ${sessionId}`, {
            totalProfiles: profileUrls.length,
            priority
        });

        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            // Check which profiles already exist with scraped status (from any session)
            const existingProfiles = await RootProfileScraped.find({
                profileUrl: { $in: profileUrls },
                status: 'scraped'
            }).select('profileUrl username profileData');

            const existingUrlsSet = new Set(existingProfiles.map(p => p.profileUrl));
            
            // Filter to only new profiles that need scraping
            const profilesToQueue = profileUrls.filter(url => !existingUrlsSet.has(url));

            // Initialize session
            await session.updateStats({
                totalProfiles: profileUrls.length,
                scrapedProfiles: existingProfiles.length,
                currentDepth: 0
            });

            logger.info(`Session ${sessionId} profile check:`, {
                total: profileUrls.length,
                existing: existingProfiles.length,
                toQueue: profilesToQueue.length
            });

            // Process existing profiles to extract related profiles
            for (const existingProfile of existingProfiles) {
                if (existingProfile.profileData?.relatedProfiles?.length > 0) {
                    // Queue the extraction of related profiles
                    await queueManager.addJob('rootProfileQueue', {
                        sessionId,
                        profileUrl: existingProfile.profileUrl,
                        username: existingProfile.username
                    }, {
                        priority,
                        attempts: 1,
                        backoff: {
                            type: 'fixed',
                            delay: 0
                        }
                    });
                }
            }

            // Prepare jobs data for new profiles
            const jobsData = profilesToQueue.map(profileUrl => {
                const username = this.extractUsernameFromUrl(profileUrl);
                return {
                    sessionId,
                    profileUrl,
                    username
                };
            });

            // Add jobs to queue
            const jobs = await queueManager.addBulkJobs('rootProfileQueue', jobsData, {
                priority,
                attempts: options.retryAttempts || 3,
                backoff: {
                    type: 'fixed',
                    delay: 0 // Removed rate limiting delay
                }
            });

            logger.info(`Queued ${jobs.length} new root profile jobs + ${existingProfiles.length} existing profiles for related extraction`);

            // Start monitoring if requested
            if (options.monitor) {
                this.startSessionMonitoring(sessionId);
            }

            return {
                sessionId,
                jobsQueued: jobs.length,
                queueName: 'rootProfileQueue',
                estimatedTime: jobs.length * 10 * 1000, // Rough estimate
                monitoringEnabled: options.monitor || false
            };

        } catch (error) {
            logger.error(`Failed to queue batch processing for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Monitor session progress
     */
    async startSessionMonitoring(sessionId) {
        const monitoringInterval = setInterval(async () => {
            try {
                const session = await Session.findById(sessionId);
                if (!session) {
                    clearInterval(monitoringInterval);
                    return;
                }

                // Get profile statistics
                const stats = await RootProfileScraped.aggregate([
                    { $match: { sessionId: session._id } },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]);

                const statusCounts = {};
                stats.forEach(stat => {
                    statusCounts[stat._id] = stat.count;
                });

                const totalProcessed = (statusCounts.scraped || 0) + (statusCounts.failed || 0);
                const progress = session.stats.totalProfiles > 0 
                    ? Math.round((totalProcessed / session.stats.totalProfiles) * 100)
                    : 0;

                logger.info(`Session ${sessionId} progress: ${progress}%`, {
                    scraped: statusCounts.scraped || 0,
                    failed: statusCounts.failed || 0,
                    pending: statusCounts.pending || 0
                });

                // Check if processing is complete
                if (totalProcessed >= session.stats.totalProfiles) {
                    clearInterval(monitoringInterval);
                    
                    if (statusCounts.failed === 0) {
                        await session.complete();
                    } else {
                        await session.updateStats({
                            completedAt: new Date(),
                            status: 'completed_with_errors'
                        });
                    }
                    
                    logger.info(`Session ${sessionId} monitoring completed`);
                }

            } catch (error) {
                logger.error(`Error monitoring session ${sessionId}:`, error);
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Get queue statistics for a session
     */
    async getSessionQueueStats(sessionId) {
        try {
            // Get jobs related to this session from the queue
            const rootProfileQueue = queueManager.getQueue('rootProfileQueue');
            
            // Get all job states
            const [waiting, active, completed, failed] = await Promise.all([
                rootProfileQueue.getWaiting(),
                rootProfileQueue.getActive(),
                rootProfileQueue.getCompleted(),
                rootProfileQueue.getFailed()
            ]);

            // Filter jobs by sessionId
            const filterBySession = (jobs) => 
                jobs.filter(job => job.data.sessionId === sessionId);

            const sessionJobs = {
                waiting: filterBySession(waiting).length,
                active: filterBySession(active).length,
                completed: filterBySession(completed).length,
                failed: filterBySession(failed).length
            };

            sessionJobs.total = Object.values(sessionJobs).reduce((a, b) => a + b, 0);

            return sessionJobs;

        } catch (error) {
            logger.error(`Failed to get queue stats for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Pause session processing
     */
    async pauseSession(sessionId) {
        try {
            // Get all jobs for this session
            const rootProfileQueue = queueManager.getQueue('rootProfileQueue');
            const waitingJobs = await rootProfileQueue.getWaiting();
            
            // Pause jobs for this session
            const sessionJobs = waitingJobs.filter(job => job.data.sessionId === sessionId);
            
            for (const job of sessionJobs) {
                await job.moveToDelayed(Date.now() + 365 * 24 * 60 * 60 * 1000); // Delay for 1 year
            }

            // Update session status
            const session = await Session.findById(sessionId);
            if (session) {
                await session.pause();
            }

            logger.info(`Paused ${sessionJobs.length} jobs for session ${sessionId}`);
            
            return {
                sessionId,
                jobsPaused: sessionJobs.length
            };

        } catch (error) {
            logger.error(`Failed to pause session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Resume session processing
     */
    async resumeSession(sessionId) {
        try {
            // Get all delayed jobs for this session
            const rootProfileQueue = queueManager.getQueue('rootProfileQueue');
            const delayedJobs = await rootProfileQueue.getDelayed();
            
            // Resume jobs for this session
            const sessionJobs = delayedJobs.filter(job => job.data.sessionId === sessionId);
            
            for (const job of sessionJobs) {
                await job.promote(); // Move back to waiting
            }

            // Update session status
            const session = await Session.findById(sessionId);
            if (session) {
                session.status = 'running';
                await session.save();
            }

            logger.info(`Resumed ${sessionJobs.length} jobs for session ${sessionId}`);
            
            return {
                sessionId,
                jobsResumed: sessionJobs.length
            };

        } catch (error) {
            logger.error(`Failed to resume session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Stop session and clear all related jobs from queues
     */
    async stopAndClearSession(sessionId) {
        try {
            const clearedJobs = {
                rootProfileQueue: 0,
                relatedProfileQueue: 0,
                relatedProfileBatchQueue: 0,
                depthProcessingQueue: 0,
                analysisQueue: 0,
                total: 0
            };

            // Get all queues
            const queues = [
                { name: 'rootProfileQueue', queue: queueManager.getQueue('rootProfileQueue') },
                { name: 'relatedProfileQueue', queue: queueManager.getQueue('relatedProfileQueue') },
                { name: 'relatedProfileBatchQueue', queue: queueManager.getQueue('relatedProfileBatchQueue') },
                { name: 'depthProcessingQueue', queue: queueManager.getQueue('depthProcessingQueue') },
                { name: 'analysisQueue', queue: queueManager.getQueue('analysisQueue') }
            ];

            // Clear jobs from each queue
            for (const { name, queue } of queues) {
                // Get all job types
                const waitingJobs = await queue.getWaiting();
                const activeJobs = await queue.getActive();
                const delayedJobs = await queue.getDelayed();

                // Filter and remove jobs for this session
                const allJobs = [...waitingJobs, ...activeJobs, ...delayedJobs];
                const sessionJobs = allJobs.filter(job => job.data.sessionId === sessionId);

                for (const job of sessionJobs) {
                    try {
                        // For active jobs, move them to failed state first
                        if (await job.isActive()) {
                            await job.moveToFailed({ message: 'Session stopped by user' }, true);
                        }
                        // Then remove the job
                        await job.remove();
                        clearedJobs[name]++;
                        clearedJobs.total++;
                    } catch (err) {
                        logger.warn(`Failed to remove job ${job.id} from ${name}:`, err);
                    }
                }
            }

            logger.info(`Cleared ${clearedJobs.total} jobs for session ${sessionId}`, clearedJobs);

            return { clearedJobs };

        } catch (error) {
            logger.error(`Failed to stop and clear session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Extract username from Instagram URL
     */
    extractUsernameFromUrl(url) {
        const match = url.match(/instagram\.com\/([^\/\?]+)/);
        return match ? match[1] : '';
    }
}

module.exports = new QueuedBatchProcessingService();