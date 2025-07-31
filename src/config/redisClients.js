const Redis = require('ioredis');
const logger = require('../utils/logger');
const { redisConfig } = require('./redis');

// Shared Redis clients for Bull queues
let sharedClients = null;

/**
 * Create shared Redis clients for Bull queues
 * This prevents creating too many connections
 */
function createSharedClients() {
  if (!redisConfig) {
    logger.warn('Redis not configured, Bull queues will not be available');
    return null;
  }

  if (sharedClients) {
    return sharedClients;
  }

  try {
    // Create the main client
    const client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      username: redisConfig.username,
      password: redisConfig.password,
      db: redisConfig.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Max Redis retry attempts reached for Bull client');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      }
    });

    // Increase max listeners to prevent warning
    client.setMaxListeners(20);
    
    // Create subscriber (for pub/sub)
    const subscriber = client.duplicate();
    subscriber.setMaxListeners(20);
    
    // Create bclient (for blocking operations)
    const bclient = client.duplicate();
    bclient.setMaxListeners(20);

    // Log successful connection only on main client
    client.on('connect', () => {
      logger.info('Shared Redis client connected for Bull queues');
    });

    // Add error handler only on main client
    // Duplicated clients will inherit the error handling behavior
    client.on('error', (err) => {
      logger.error('Shared Redis client error:', err);
    });

    sharedClients = {
      client,
      subscriber,
      bclient
    };

    logger.info('Created shared Redis clients for Bull queues');
    return sharedClients;

  } catch (error) {
    logger.error('Failed to create shared Redis clients:', error);
    return null;
  }
}

/**
 * Get Bull queue options with shared Redis clients
 */
function getBullQueueOptions() {
  const clients = createSharedClients();
  
  if (!clients) {
    return null;
  }

  return {
    createClient: function(type) {
      switch(type) {
        case 'client':
          return clients.client;
        case 'subscriber':
          return clients.subscriber;
        case 'bclient':
          return clients.bclient;
        default:
          logger.warn(`Unknown Redis client type requested: ${type}`);
          return clients.client;
      }
    },
    defaultJobOptions: {
      removeOnComplete: {
        age: 24 * 60 * 60, // Keep completed jobs for 24 hours
        count: 100 // Keep max 100 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60 // Keep failed jobs for 7 days
      },
      attempts: 3,
      backoff: {
        type: 'fixed',
        delay: 0
      }
    }
  };
}

/**
 * Close all shared Redis clients
 */
async function closeSharedClients() {
  if (!sharedClients) {
    return;
  }

  try {
    await Promise.all([
      sharedClients.client.quit(),
      sharedClients.subscriber.quit(),
      sharedClients.bclient.quit()
    ]);
    
    sharedClients = null;
    logger.info('Closed all shared Redis clients');
  } catch (error) {
    logger.error('Error closing shared Redis clients:', error);
  }
}

module.exports = {
  createSharedClients,
  getBullQueueOptions,
  closeSharedClients
};