const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const Session = require('../src/models/Session');
const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');
const sessionCompletionService = require('../src/services/sessionCompletionService');
const { n8nAnalysisQueue } = require('../src/queues/n8nAnalysisQueue');

async function testSessionCompletionFix() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/scraper-system');
        logger.info('Connected to MongoDB');

        // Find a running session
        const runningSessions = await Session.find({ status: 'running' }).limit(1);
        
        if (runningSessions.length === 0) {
            logger.info('No running sessions found to test');
            return;
        }

        const session = runningSessions[0];
        logger.info(`Testing with session: ${session._id} (${session.name})`);

        // Get session progress
        const sessionObj = session.toObject({ virtuals: true });
        logger.info(`Session progress: ${sessionObj.progressPercentage}%`);

        // Check scraped profiles without n8n processing
        const pendingAnalysis = await RelatedProfileScraped.countDocuments({
            sessionId: session._id,
            status: 'scraped',
            n8nProcessed: { $ne: true }
        });
        logger.info(`Profiles pending n8n analysis: ${pendingAnalysis}`);

        // Check n8n queue status
        if (n8nAnalysisQueue) {
            const waitingCount = await n8nAnalysisQueue.getWaitingCount();
            const activeCount = await n8nAnalysisQueue.getActiveCount();
            
            // Check session-specific jobs
            const waitingJobs = await n8nAnalysisQueue.getWaiting();
            const activeJobs = await n8nAnalysisQueue.getActive();
            
            const sessionIdStr = session._id.toString();
            const sessionWaitingJobs = waitingJobs.filter(job => 
                job.data.sessionId?.toString() === sessionIdStr
            );
            const sessionActiveJobs = activeJobs.filter(job => 
                job.data.sessionId?.toString() === sessionIdStr
            );

            logger.info(`n8n queue - Total waiting: ${waitingCount}, active: ${activeCount}`);
            logger.info(`n8n queue - Session ${session._id} waiting: ${sessionWaitingJobs.length}, active: ${sessionActiveJobs.length}`);
        }

        // Test the fixed completion check
        logger.info('Testing session completion check...');
        const isAnalysisComplete = await sessionCompletionService.isAnalysisComplete(session);
        logger.info(`isAnalysisComplete: ${isAnalysisComplete}`);

        const hasActiveJobs = await sessionCompletionService.hasActiveJobsForSession(session._id);
        logger.info(`hasActiveJobsForSession: ${hasActiveJobs}`);

        const isSessionComplete = await sessionCompletionService.isSessionComplete(session);
        logger.info(`isSessionComplete: ${isSessionComplete}`);

        // Check if it would mark as complete
        if (isSessionComplete && session.status === 'running') {
            logger.info('Session would be marked as complete');
            
            if (pendingAnalysis > 0 || (sessionWaitingJobs && sessionWaitingJobs.length > 0) || 
                (sessionActiveJobs && sessionActiveJobs.length > 0)) {
                logger.error('ERROR: Session would complete prematurely!');
                logger.error(`Still have ${pendingAnalysis} profiles pending analysis`);
                logger.error(`Still have ${sessionWaitingJobs?.length || 0} waiting jobs in n8n queue`);
                logger.error(`Still have ${sessionActiveJobs?.length || 0} active jobs in n8n queue`);
            } else {
                logger.info('SUCCESS: Session completion is correct - all analysis is done');
            }
        } else {
            logger.info('Session will not be marked as complete (correct behavior if analysis pending)');
        }

    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Run the test
testSessionCompletionFix();