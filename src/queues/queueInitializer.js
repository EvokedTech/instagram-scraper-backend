const logger = require('../utils/logger');
const { queues } = require('./queueManager');
const { processRootProfile } = require('./processors/rootProfileProcessor');
const { processRelatedProfile } = require('./processors/relatedProfileProcessor');
const { processDepthLevel } = require('./processors/depthProcessor');
const { processRelatedProfileBatch } = require('./processors/relatedProfileBatchProcessor');
const { closeSharedClients } = require('../config/redisClients');
// Analysis processor removed - handled by n8n webhook

/**
 * Initialize all queue processors
 */
async function initializeQueues() {
  try {
    logger.info('Initializing queue processors...');

    // Check if Redis is available
    try {
      await queues.rootProfileQueue.isReady();
    } catch (error) {
      logger.warn('Redis not available, skipping queue initialization');
      return;
    }

    // Root Profile Queue Processor
    queues.rootProfileQueue.process(5, processRootProfile);
    logger.info('Root profile queue processor initialized');

    // Related Profile Queue Processor
    queues.relatedProfileQueue.process(10, processRelatedProfile);
    logger.info('Related profile queue processor initialized');

    // Depth Processing Queue Processor
    queues.depthProcessingQueue.process(5, processDepthLevel);
    logger.info('Depth processing queue processor initialized');

    // Related Profile Batch Queue Processor
    queues.relatedProfileBatchQueue.process(5, processRelatedProfileBatch);
    logger.info('Related profile batch queue processor initialized');

    // Analysis now handled by n8n webhook
    logger.info('Analysis will be processed through n8n webhook');

    logger.info('All queue processors initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queue processors:', error);
    logger.warn('Server will continue without queue functionality');
  }
}

/**
 * Gracefully shutdown queues
 */
async function shutdownQueues() {
  try {
    logger.info('Shutting down queue processors...');

    const closePromises = Object.entries(queues).map(async ([name, queue]) => {
      if (queue) {
        logger.info(`Closing ${name}...`);
        await queue.close();
      }
    });

    await Promise.all(closePromises);
    
    // Close shared Redis clients
    await closeSharedClients();
    
    logger.info('All queue processors and Redis clients shut down successfully');
  } catch (error) {
    logger.error('Error shutting down queue processors:', error);
    throw error;
  }
}

module.exports = {
  initializeQueues,
  shutdownQueues
};