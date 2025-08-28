const { ApifyClient } = require('apify-client');
const RootProfileScraped = require('../models/RootProfileScraped');
const Session = require('../models/Session');
const socketService = require('./socketService');
const logger = require('../utils/logger');
const batchConfig = require('../config/batchConfig');

class BatchScrapingService {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    this.actorId = 'shu8hvrXbJbY3Eb9W';
  }

  /**
   * Process session profiles in batches
   */
  async processSessionInBatches(sessionId) {
    try {
      const session = await Session.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      logger.info(`Starting batch processing for session ${sessionId}`);
      
      // Update session status
      session.status = 'running';
      await session.save();
      
      // Get all pending profiles for this session
      const pendingProfiles = await RootProfileScraped.find({
        sessionId,
        status: 'pending'
      });

      logger.info(`Found ${pendingProfiles.length} profiles to process in batches of ${batchConfig.BATCH_SIZE}`);

      // Process in batches
      const batches = this.createBatches(pendingProfiles, batchConfig.BATCH_SIZE);
      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        
        logger.info(`\n========================================`);
        logger.info(`Processing Batch ${batchNumber}/${batches.length}`);
        logger.info(`Profiles in batch: ${batch.length}`);
        logger.info(`========================================\n`);

        // Emit batch start event
        this.emitBatchStatus(sessionId, {
          event: 'batch:start',
          batchNumber,
          totalBatches: batches.length,
          batchSize: batch.length,
          totalProcessed
        });

        // Process profiles in the batch sequentially
        const batchResults = await this.processBatch(sessionId, batch, batchNumber);
        
        totalProcessed += batchResults.processed;
        totalSuccess += batchResults.success;
        totalFailed += batchResults.failed;
        totalSkipped += batchResults.skipped;

        // Update session stats
        await this.updateSessionStats(sessionId, {
          scrapedProfiles: totalSuccess,
          failedProfiles: totalFailed,
          skippedProfiles: totalSkipped
        });

        // Emit batch complete event
        this.emitBatchStatus(sessionId, {
          event: 'batch:complete',
          batchNumber,
          totalBatches: batches.length,
          batchResults,
          totalProcessed,
          totalSuccess,
          totalFailed
        });

        // Add small delay between batches to prevent overload
        if (batchIndex < batches.length - 1 && batchConfig.DELAY_BETWEEN_BATCHES > 0) {
          logger.info(`Waiting ${batchConfig.DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
          await this.delay(batchConfig.DELAY_BETWEEN_BATCHES);
        }
      }

      // Update session as completed
      session.status = 'completed';
      session.stats.scrapedProfiles = totalSuccess;
      await session.save();

      logger.info(`\n========================================`);
      logger.info(`SESSION PROCESSING COMPLETE`);
      logger.info(`========================================`);
      logger.info(`Total Processed: ${totalProcessed}`);
      logger.info(`✅ Success: ${totalSuccess}`);
      logger.info(`❌ Failed: ${totalFailed}`);
      logger.info(`🔒 Skipped (Private): ${totalSkipped}`);
      logger.info(`========================================\n`);

      return {
        totalProcessed,
        totalSuccess,
        totalFailed,
        totalSkipped
      };

    } catch (error) {
      logger.error(`Batch processing error for session ${sessionId}:`, error);
      
      // Update session as failed
      const session = await Session.findById(sessionId);
      if (session) {
        session.status = 'failed';
        session.error = error.message;
        await session.save();
      }
      
      throw error;
    }
  }

  /**
   * Process a single batch of profiles in parallel
   */
  async processBatch(sessionId, profiles, batchNumber) {
    logger.info(`[Batch ${batchNumber}] Starting controlled processing of ${profiles.length} profiles...`);
    
    // Process profiles with delays to avoid memory overload
    const scrapingPromises = profiles.map(async (profile, index) => {
      const profileNumber = index + 1;
      
      // Add delay between starting each profile to prevent memory spike
      if (index > 0 && batchConfig.DELAY_BETWEEN_PROFILES > 0) {
        await this.delay(index * batchConfig.DELAY_BETWEEN_PROFILES);
      }
      
      logger.info(`[Batch ${batchNumber} - ${profileNumber}/${profiles.length}] Starting ${profile.username}...`);
      
      try {
        // Scrape the profile
        const result = await this.scrapeProfile(profile);
        
        if (result.isPrivate) {
          // Profile is private
          profile.status = 'skipped';
          profile.error = 'Profile is private';
          profile.metadata = { ...profile.metadata, isPrivate: true };
          logger.info(`  🔒 ${profile.username} - PRIVATE - Skipped`);
          return { type: 'skipped', profile };
        } else if (result.data) {
          // Successfully scraped
          profile.status = 'scraped';
          profile.profileData = result.data;
          profile.scrapedAt = new Date();
          profile.error = null;
          profile.metadata = {
            ...profile.metadata,
            apifyRunId: result.runId,
            scrapedInBatch: batchNumber,
            processingTime: result.processingTime
          };
          logger.info(`  ✅ ${profile.username} - SUCCESS - Followers: ${result.data.followersCount || 'N/A'}, Posts: ${result.data.postsCount || 'N/A'}`);
          return { type: 'success', profile };
        } else {
          throw new Error(result.error || 'No data returned');
        }
      } catch (error) {
        // Failed to scrape
        profile.status = 'failed';
        profile.error = error.message;
        profile.metadata = {
          ...profile.metadata,
          failedInBatch: batchNumber,
          failureTime: new Date()
        };
        logger.error(`  ❌ ${profile.username} - FAILED - ${error.message}`);
        return { type: 'failed', profile };
      }
    });
    
    // Wait for all profiles to complete
    const results = await Promise.all(scrapingPromises);
    
    // Count results
    let processed = results.length;
    let success = results.filter(r => r.type === 'success').length;
    let failed = results.filter(r => r.type === 'failed').length;
    let skipped = results.filter(r => r.type === 'skipped').length;
    
    // Save all profiles to database at once
    const profilesToSave = results.map(r => r.profile);
    await this.saveBatchToDatabase(profilesToSave);
    logger.info(`  💾 Saved all ${profilesToSave.length} profiles from batch ${batchNumber} to database`);
    
    // Emit progress events for all profiles
    results.forEach((result, index) => {
      this.emitProfileStatus(sessionId, {
        username: result.profile.username,
        status: result.profile.status,
        batchNumber,
        profileNumber: index + 1,
        totalInBatch: profiles.length
      });
    });
    
    logger.info(`[Batch ${batchNumber}] Completed: ✅ ${success} success, ❌ ${failed} failed, 🔒 ${skipped} skipped`);
    
    return { processed, success, failed, skipped };
  }

  /**
   * Scrape a single profile using Apify
   */
  async scrapeProfile(profile) {
    const startTime = Date.now();
    
    try {
      const input = {
        directUrls: [profile.profileUrl],
        resultsLimit: 10,
        resultsType: 'details',
        searchLimit: 50,
        searchType: 'user',
        addParentData: false,
        enhanceUserSearchWithFacebookPage: false,
        isUserReelFeedURL: false,
        isUserTaggedFeedURL: false,
        extendOutputFunction: '', // This ensures all available data is collected
        extendScraperFunction: '', // This ensures deeper scraping
        includeContactInfo: true,  // Explicitly request contact information
        maxRequestRetries: 5,
        requestTimeoutSecs: batchConfig.APIFY_TIMEOUT_PER_PROFILE,
        handleRequestTimeoutSecs: batchConfig.APIFY_TIMEOUT_PER_PROFILE + 60,
        maxConcurrency: batchConfig.MAX_CONCURRENT_PROFILES,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']  // Use residential proxies for better success
        }
      };

      const run = await this.client.actor(this.actorId).call(input, {
        timeout: batchConfig.APIFY_TIMEOUT_PER_PROFILE + 60,
        memory: batchConfig.APIFY_MEMORY
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      if (items && items.length > 0) {
        const data = items[0];
        const processingTime = (Date.now() - startTime) / 1000;
        
        // Check if profile is private
        if (data.isPrivate || data.private === true) {
          return { isPrivate: true };
        }
        
        return { 
          data, 
          runId: run.id,
          processingTime 
        };
      } else {
        throw new Error('No data returned from Apify');
      }

    } catch (error) {
      throw new Error(`Apify error: ${error.message}`);
    }
  }

  /**
   * Save batch of profiles to database
   */
  async saveBatchToDatabase(profiles) {
    try {
      const bulkOps = profiles.map(profile => ({
        updateOne: {
          filter: { _id: profile._id },
          update: {
            $set: {
              status: profile.status,
              profileData: profile.profileData,
              scrapedAt: profile.scrapedAt,
              error: profile.error,
              metadata: profile.metadata
            }
          }
        }
      }));

      await RootProfileScraped.bulkWrite(bulkOps);
    } catch (error) {
      logger.error('Error saving batch to database:', error);
      throw error;
    }
  }

  /**
   * Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Update session stats
   */
  async updateSessionStats(sessionId, stats) {
    try {
      await Session.findByIdAndUpdate(sessionId, {
        $set: {
          'stats.scrapedProfiles': stats.scrapedProfiles,
          'stats.failedProfiles': stats.failedProfiles,
          'stats.skippedProfiles': stats.skippedProfiles
        }
      });
    } catch (error) {
      logger.error('Error updating session stats:', error);
    }
  }

  /**
   * Emit batch status via WebSocket
   */
  emitBatchStatus(sessionId, data) {
    try {
      if (socketService.io) {
        socketService.io.to(`session:${sessionId}`).emit('batch:status', data);
      }
    } catch (error) {
      logger.error('Error emitting batch status:', error);
    }
  }

  /**
   * Emit profile status via WebSocket
   */
  emitProfileStatus(sessionId, data) {
    try {
      if (socketService.io) {
        socketService.io.to(`session:${sessionId}`).emit('profile:status', data);
      }
    } catch (error) {
      logger.error('Error emitting profile status:', error);
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BatchScrapingService();