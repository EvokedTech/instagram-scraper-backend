const Redis = require('redis');
const logger = require('../utils/logger');

// Parse Redis URL if provided
const parseRedisUrl = (url) => {
  try {
    const parsed = new URL(url);
    return {
      username: parsed.username || 'default',
      password: parsed.password || undefined,
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      db: parseInt(parsed.pathname.slice(1)) || 0
    };
  } catch (error) {
    logger.error('Failed to parse Redis URL:', error);
    return null;
  }
};

// Redis configuration
let redisConfig;

if (process.env.REDIS_URL) {
  // Use Redis URL if provided (Railway, Redis Cloud, etc.)
  const parsed = parseRedisUrl(process.env.REDIS_URL);
  if (parsed) {
    redisConfig = parsed;
    logger.info(`Using Redis URL configuration for ${parsed.host}:${parsed.port}`);
  } else {
    logger.error('Invalid REDIS_URL provided');
    redisConfig = null;
  }
} else {
  // Fall back to individual parameters
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  };
}

// Create Redis client
let redisClient = null;

if (redisConfig) {
  redisClient = Redis.createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (retries > 3) {
          logger.error('Max Redis reconnection attempts reached');
          return new Error('Max retries reached');
        }
        return Math.min(retries * 100, 3000); // Exponential backoff
      }
    },
    username: redisConfig.username,
    password: redisConfig.password,
    database: redisConfig.db
  });

  // Redis connection event handlers
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  redisClient.on('end', () => {
    logger.info('Redis client disconnected');
  });
}

// Connect to Redis
const connectRedis = async () => {
  // Skip Redis if disabled or not configured
  if (process.env.REDIS_HOST === 'disabled' || !redisConfig) {
    logger.info('Redis is disabled or not configured, queue functionality will not be available');
    return null;
  }
  
  try {
    await redisClient.connect();
    logger.info(`Connected to Redis at ${redisConfig.host}:${redisConfig.port}`);
    
    // Test connection
    await redisClient.ping();
    logger.info('Redis connection verified with PING');
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    logger.warn('Server will continue without Redis/Queue functionality');
    return null;
  }
};

// Disconnect from Redis
const disconnectRedis = async () => {
  if (!redisClient) return;
  
  try {
    await redisClient.quit();
    logger.info('Disconnected from Redis');
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
  }
};

module.exports = {
  redisClient,
  redisConfig,
  connectRedis,
  disconnectRedis
};