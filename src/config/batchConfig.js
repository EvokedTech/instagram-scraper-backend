module.exports = {
  // Batch processing configuration - Optimized for 1000+ profiles
  BATCH_SIZE: 5,                     // Process 5 profiles at a time (safe for memory)
  DELAY_BETWEEN_BATCHES: 2000,       // 2 second delay between batches 
  DELAY_BETWEEN_PROFILES: 1000,      // 1 second delay between starting profiles
  MAX_CONCURRENT_PROFILES: 3,        // Only 3 parallel to avoid memory limits
  
  // Apify configuration for batch processing
  APIFY_TIMEOUT_PER_PROFILE: 90,     // 90 seconds timeout per profile
  APIFY_MEMORY: 128,                  // Minimal memory to avoid hitting limits
  
  // Database batch save configuration
  DB_BATCH_SAVE_SIZE: 5,              // Save to database every 5 profiles
  
  // Retry configuration
  MAX_RETRIES_PER_PROFILE: 2,        // Maximum retries for failed profiles
  RETRY_DELAY: 15000,                 // 15 seconds delay before retry
};