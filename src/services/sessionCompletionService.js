const logger = require('../utils/logger');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const { queueManager } = require('../queues/queueManager');
const { n8nAnalysisQueue } = require('../queues/n8nAnalysisQueue');

class SessionCompletionService {
    /**
     * Check if a session is complete and update its status accordingly
     * @param {string} sessionId - The session ID to check
     * @returns {Promise<boolean>} - True if session was marked as completed
     */
    async checkAndUpdateSessionCompletion(sessionId) {
        try {
            logger.info(`Checking completion status for session ${sessionId}`);

            const session = await Session.findById(sessionId);
            if (!session) {
                logger.error(`Session ${sessionId} not found`);
                return false;
            }

            // Don't check if session is already completed, failed, or stopped
            if (['completed', 'failed', 'stopped'].includes(session.status)) {
                logger.info(`Session ${sessionId} is already in final state: ${session.status}`);
                return false;
            }

            // Check if all depths are processed
            const isComplete = await this.isSessionComplete(session);

            if (isComplete) {
                logger.info(`Session ${sessionId} is complete. Marking as completed.`);
                await session.complete();
                
                // Emit completion event
                const socketService = require('./socketService');
                socketService.emitSessionUpdate(sessionId, {
                    status: 'completed',
                    completedAt: session.stats.completedAt,
                    message: 'All profiles have been scraped and analyzed successfully'
                });

                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error checking session completion for ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * Check if a session is complete
     * @param {Object} session - The session document
     * @returns {Promise<boolean>} - True if session is complete
     */
    async isSessionComplete(session) {
        const sessionId = session._id;
        const maxDepth = session.config.maxDepth;

        logger.info(`Checking completion for session ${sessionId} with maxDepth ${maxDepth}`);

        // Check root profiles completion
        const rootProfileStats = await RootProfileScraped.aggregate([
            { $match: { sessionId: session._id } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const rootStats = rootProfileStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
        }, {});

        logger.info(`Root profile stats for session ${sessionId}:`, rootStats);

        // If there are any pending root profiles, not complete
        if (rootStats.pending && rootStats.pending > 0) {
            logger.info(`Session ${sessionId} has ${rootStats.pending} pending root profiles`);
            return false;
        }

        // Check all depths
        for (let depth = 1; depth <= maxDepth; depth++) {
            const depthStats = await RelatedProfileScraped.aggregate([
                { 
                    $match: { 
                        sessionId: session._id,
                        depth: depth 
                    } 
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const stats = depthStats.reduce((acc, stat) => {
                acc[stat._id] = stat.count;
                return acc;
            }, {});

            const totalAtDepth = Object.values(stats).reduce((sum, count) => sum + count, 0);
            logger.info(`Depth ${depth} stats for session ${sessionId}:`, { ...stats, total: totalAtDepth });

            // If this depth has profiles and any are pending, not complete
            if (stats.pending && stats.pending > 0) {
                logger.info(`Session ${sessionId} has ${stats.pending} pending profiles at depth ${depth}`);
                return false;
            }

            // If this depth has no profiles at all and we haven't reached max depth, 
            // it might still be processing from previous depth
            if (totalAtDepth === 0 && depth < maxDepth) {
                // Check if previous depth is still being processed
                const prevDepthPending = await this.hasActiveBatchJobsForDepth(sessionId, depth - 1);
                if (prevDepthPending) {
                    logger.info(`Session ${sessionId} is still processing depth ${depth - 1}`);
                    return false;
                }
            }
        }

        // Check if there are any active jobs in queues for this session
        const hasActiveJobs = await this.hasActiveJobsForSession(sessionId);
        if (hasActiveJobs) {
            logger.info(`Session ${sessionId} still has active jobs in queues`);
            return false;
        }

        // Check if analysis is enabled and complete
        if (session.config.analysisEnabled !== false) {
            const isAnalysisComplete = await this.isAnalysisComplete(session);
            if (!isAnalysisComplete) {
                logger.info(`Session ${sessionId} analysis is not complete`);
                return false;
            }
        } else {
            logger.info(`Session ${sessionId} has analysis disabled, skipping analysis check`);
        }

        logger.info(`Session ${sessionId} is complete!`);
        return true;
    }

    /**
     * Check if there are active batch jobs for a specific depth
     * @param {string} sessionId - The session ID
     * @param {number} depth - The depth to check
     * @returns {Promise<boolean>} - True if there are active jobs
     */
    async hasActiveBatchJobsForDepth(sessionId, depth) {
        try {
            const queues = ['rootProfileQueue', 'relatedProfileBatchQueue', 'depthProcessingQueue'];
            const sessionIdStr = sessionId.toString();
            
            for (const queueName of queues) {
                const queue = queueManager.getQueue(queueName);
                if (!queue) {
                    logger.warn(`Queue ${queueName} not found for depth check`);
                    continue;
                }

                try {
                    // Check waiting jobs
                    const waitingJobs = await queue.getWaiting();
                    const hasWaitingForDepth = waitingJobs.some(job => {
                        const jobSessionId = job.data.sessionId?.toString();
                        return jobSessionId === sessionIdStr && 
                            (job.data.depth === depth || (job.data.profiles && job.data.profiles[0]?.depth === depth));
                    });
                    if (hasWaitingForDepth) {
                        logger.info(`Session ${sessionIdStr} has waiting jobs at depth ${depth} in ${queueName}`);
                        return true;
                    }

                    // Check active jobs
                    const activeJobs = await queue.getActive();
                    const hasActiveForDepth = activeJobs.some(job => {
                        const jobSessionId = job.data.sessionId?.toString();
                        return jobSessionId === sessionIdStr && 
                            (job.data.depth === depth || (job.data.profiles && job.data.profiles[0]?.depth === depth));
                    });
                    if (hasActiveForDepth) {
                        logger.info(`Session ${sessionIdStr} has active jobs at depth ${depth} in ${queueName}`);
                        return true;
                    }
                } catch (queueError) {
                    logger.warn(`Error checking queue ${queueName} for depth ${depth}:`, queueError.message);
                }
            }

            return false;
        } catch (error) {
            logger.error(`Error checking active jobs for depth ${depth}:`, error);
            return true; // Assume there might be jobs to be safe
        }
    }

    /**
     * Check if there are any active jobs for a session
     * @param {string} sessionId - The session ID
     * @returns {Promise<boolean>} - True if there are active jobs
     */
    async hasActiveJobsForSession(sessionId) {
        try {
            const queues = ['rootProfileQueue', 'relatedProfileBatchQueue', 'depthProcessingQueue'];
            const sessionIdStr = sessionId.toString();
            
            // Check queues managed by queueManager
            for (const queueName of queues) {
                const queue = queueManager.getQueue(queueName);
                if (!queue) {
                    logger.warn(`Queue ${queueName} not found, skipping`);
                    continue;
                }

                try {
                    // Check waiting jobs
                    const waitingCount = await queue.getWaitingCount();
                    if (waitingCount > 0) {
                        const waitingJobs = await queue.getWaiting();
                        const hasWaiting = waitingJobs.some(job => {
                            const jobSessionId = job.data.sessionId?.toString();
                            return jobSessionId === sessionIdStr;
                        });
                        if (hasWaiting) {
                            logger.info(`Session ${sessionIdStr} has waiting jobs in ${queueName}`);
                            return true;
                        }
                    }

                    // Check active jobs
                    const activeCount = await queue.getActiveCount();
                    if (activeCount > 0) {
                        const activeJobs = await queue.getActive();
                        const hasActive = activeJobs.some(job => {
                            const jobSessionId = job.data.sessionId?.toString();
                            return jobSessionId === sessionIdStr;
                        });
                        if (hasActive) {
                            logger.info(`Session ${sessionIdStr} has active jobs in ${queueName}`);
                            return true;
                        }
                    }
                } catch (queueError) {
                    logger.warn(`Error checking queue ${queueName}:`, queueError.message);
                    // Continue checking other queues
                }
            }

            // Check n8n analysis queue separately
            if (n8nAnalysisQueue) {
                try {
                    // Check waiting jobs
                    const waitingCount = await n8nAnalysisQueue.getWaitingCount();
                    if (waitingCount > 0) {
                        const waitingJobs = await n8nAnalysisQueue.getWaiting();
                        const hasWaiting = waitingJobs.some(job => {
                            const jobSessionId = job.data.sessionId?.toString();
                            return jobSessionId === sessionIdStr;
                        });
                        if (hasWaiting) {
                            logger.info(`Session ${sessionIdStr} has waiting jobs in n8nAnalysisQueue`);
                            return true;
                        }
                    }

                    // Check active jobs
                    const activeCount = await n8nAnalysisQueue.getActiveCount();
                    if (activeCount > 0) {
                        const activeJobs = await n8nAnalysisQueue.getActive();
                        const hasActive = activeJobs.some(job => {
                            const jobSessionId = job.data.sessionId?.toString();
                            return jobSessionId === sessionIdStr;
                        });
                        if (hasActive) {
                            logger.info(`Session ${sessionIdStr} has active jobs in n8nAnalysisQueue`);
                            return true;
                        }
                    }
                } catch (queueError) {
                    logger.warn(`Error checking n8nAnalysisQueue:`, queueError.message);
                }
            }

            logger.info(`No active jobs found for session ${sessionIdStr}`);
            return false;
        } catch (error) {
            logger.error(`Error checking active jobs for session:`, error);
            return true; // Assume there might be jobs to be safe
        }
    }

    /**
     * Check if analysis is complete for a session
     * @param {Object} session - The session document
     * @returns {Promise<boolean>} - True if analysis is complete
     */
    async isAnalysisComplete(session) {
        // Check if all scraped profiles have been analyzed
        const rootAnalysisPending = await RootProfileScraped.countDocuments({
            sessionId: session._id,
            status: 'scraped',
            n8nProcessed: { $ne: true }
        });

        const relatedAnalysisPending = await RelatedProfileScraped.countDocuments({
            sessionId: session._id,
            status: 'scraped',
            n8nProcessed: { $ne: true }
        });

        return rootAnalysisPending === 0 && relatedAnalysisPending === 0;
    }

    /**
     * Schedule periodic completion checks for all running sessions
     */
    async scheduleCompletionChecks() {
        setInterval(async () => {
            try {
                // Get all running sessions (can't query virtual properties)
                const runningSessions = await Session.find({ 
                    status: 'running'
                });

                logger.info(`Checking ${runningSessions.length} running sessions for completion`);

                for (const session of runningSessions) {
                    // Calculate progress using virtual property
                    const sessionObj = session.toObject({ virtuals: true });
                    
                    // Only check sessions that are near completion (90% or more)
                    if (sessionObj.progressPercentage >= 90) {
                        logger.info(`Session ${session._id} has ${sessionObj.progressPercentage}% progress, checking for completion`);
                        await this.checkAndUpdateSessionCompletion(session._id);
                    }
                }
            } catch (error) {
                logger.error('Error in scheduled completion check:', error);
            }
        }, 10000); // Check every 10 seconds for faster completion detection
    }
}

module.exports = new SessionCompletionService();