require('dotenv').config();
const { connectRedis, disconnectRedis, redisClient } = require('../config/redis');
const logger = require('../utils/logger');

async function testRedisConnection() {
  console.log('Testing Redis connection...');
  console.log('Redis URL:', process.env.REDIS_URL ? 'Configured' : 'Not configured');
  console.log('Redis Host:', process.env.REDIS_HOST || 'Not configured');
  
  try {
    // Connect to Redis
    const client = await connectRedis();
    
    if (!client) {
      console.log('Redis connection failed or is disabled');
      return;
    }
    
    // Test basic operations
    console.log('\nTesting basic Redis operations...');
    
    // SET operation
    await redisClient.set('test:key', 'Hello Redis Cloud!');
    console.log('✓ SET operation successful');
    
    // GET operation
    const value = await redisClient.get('test:key');
    console.log(`✓ GET operation successful: ${value}`);
    
    // DELETE operation
    await redisClient.del('test:key');
    console.log('✓ DEL operation successful');
    
    // Test expiration
    await redisClient.setEx('test:expiring', 5, 'This will expire in 5 seconds');
    const ttl = await redisClient.ttl('test:expiring');
    console.log(`✓ SETEX operation successful, TTL: ${ttl} seconds`);
    
    // Clean up
    await redisClient.del('test:expiring');
    
    console.log('\n✅ All Redis operations completed successfully!');
    
  } catch (error) {
    console.error('Redis test failed:', error);
  } finally {
    // Disconnect
    await disconnectRedis();
    process.exit(0);
  }
}

// Run the test
testRedisConnection();