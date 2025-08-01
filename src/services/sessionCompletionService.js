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
        
        // Get session with virtuals to access progressPercentage
        const sessionWithVirtuals = await Session.findById(sessionId);
        if (!sessionWithVirtuals) {
            logger.error(`Session ${sessionId} not found`);
            return false;
        }
        
        const progressPercentage = sessionWithVirtuals.progressPercentage;
        logger.info(`Session ${sessionId} progress: ${progressPercentage}%`);
        
        // Simple check: if progress is 100%, session is complete
        const isComplete = progressPercentage >= 100;
        
        if (isComplete) {
            logger.info(`Session ${sessionId} is complete! (${progressPercentage}% progress)`);
        } else {
            logger.info(`Session ${sessionId} is not complete yet (${progressPercentage}% progress)`);
        }
        
        return isComplete;
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
                    
                    // Check all running sessions, especially those at 100%
                    if (sessionObj.progressPercentage >= 100) {
                        logger.info(`Session ${session._id} has ${sessionObj.progressPercentage}% progress, marking as complete`);
                        await this.checkAndUpdateSessionCompletion(session._id);
                    } else if (sessionObj.progressPercentage >= 90) {
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