const { ApifyClient } = require('apify-client');
const RootProfileScraped = require('../models/RootProfileScraped');
const Session = require('../models/Session');
const socketService = require('./socketService');
const logger = require('../utils/logger');
const batchConfig = require('../config/batchConfig');
const cloudflareR2Service = require('./cloudflareR2Service');
const axios = require('axios');

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

      // BULK MODE DETECTION: If more than 50 profiles, enable bulk mode
      const isBulkOperation = pendingProfiles.length > 50;
      if (isBulkOperation) {
        logger.warn(`🚨 BULK MODE ENABLED: ${pendingProfiles.length} profiles detected`);
        logger.warn(`⚠️  Webhooks will be triggered gradually to prevent API overload`);
        this.bulkMode = true;
        this.bulkSessionId = sessionId;
        this.totalBulkProfiles = pendingProfiles.length;
      } else {
        this.bulkMode = false;
      }

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

      // BULK MODE: Start background analysis after scraping is complete
      if (this.bulkMode && totalSuccess > 0) {
        logger.info(`\n🚀 BULK MODE: Starting background analysis for ${totalSuccess} profiles...`);
        logger.info(`⏱️  Analysis will process at safe rate (30 profiles/minute)`);
        logger.info(`📊 Estimated time: ${Math.ceil(totalSuccess / 30)} minutes`);

        // Start background analysis process
        this.startBulkAnalysis(sessionId, totalSuccess);
      }

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
          
          // Convert profile pictures to Cloudflare CDN immediately
          try {
            if (result.data.profilePicUrl) {
              logger.info(`  📸 Converting profile pic for ${profile.username} to Cloudflare CDN...`);
              result.data.profilePicUrl = await cloudflareR2Service.processProfileImage(
                result.data.profilePicUrl, 
                profile.username
              );
            }
            
            if (result.data.profilePicUrlHD) {
              logger.info(`  📸 Converting HD profile pic for ${profile.username} to Cloudflare CDN...`);
              result.data.profilePicUrlHD = await cloudflareR2Service.processProfileImage(
                result.data.profilePicUrlHD, 
                profile.username
              );
            }
            
            logger.info(`  ✅ Profile pics converted to Cloudflare CDN for ${profile.username}`);
          } catch (cdnError) {
            logger.warn(`  ⚠️ Failed to convert profile pics to CDN for ${profile.username}: ${cdnError.message}`);
            // Continue with original URLs if CDN conversion fails
          }
          
          profile.profileData = result.data;
          profile.scrapedAt = new Date();
          profile.error = null;
          profile.metadata = {
            ...profile.metadata,
            apifyRunId: result.runId,
            scrapedInBatch: batchNumber,
            processingTime: result.processingTime
          };
          
          // CRITICAL: Save the profile FIRST before triggering webhook
          await profile.save();

          // ALWAYS trigger webhook for ALL profiles (even in bulk mode)
          // Stagger webhooks to avoid overwhelming the analyzer
          const baseDelay = this.bulkMode ? 2000 : 1000; // Base delay
          const staggeredDelay = baseDelay + (index * 500); // Add 500ms per profile to stagger

          setTimeout(() => {
            logger.info(`⏰ Triggering webhook for ${profile.username} (${this.bulkMode ? 'BULK' : 'NORMAL'} mode) - Delay: ${staggeredDelay}ms`);
            this.triggerAnalysisWebhook(profile.username).catch(err => {
              logger.error(`❌ WEBHOOK FAILED for ${profile.username}: ${err.message}`);
              // Retry once more after 10 seconds
              setTimeout(() => {
                logger.info(`🔄 Retrying webhook for ${profile.username}...`);
                this.triggerAnalysisWebhook(profile.username).catch(err2 => {
                  logger.error(`❌❌ WEBHOOK PERMANENTLY FAILED for ${profile.username}: ${err2.message}`);
                });
              }, 10000);
            });
          }, staggeredDelay);
          
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

  /**
   * Start bulk analysis process that respects rate limits
   */
  async startBulkAnalysis(sessionId, totalProfiles) {
    try {
      // Get all scraped profiles that need analysis
      const profilesToAnalyze = await RootProfileScraped.find({
        sessionId,
        status: 'scraped',
        'metadata.pendingAnalysis': true
      }).sort({ scrapedAt: 1 }); // Process in order they were scraped

      if (profilesToAnalyze.length === 0) {
        logger.info('No profiles pending analysis');
        return;
      }

      logger.info(`\n📋 BULK ANALYSIS STARTED`);
      logger.info(`Total profiles to analyze: ${profilesToAnalyze.length}`);
      logger.info(`Rate limit: 30 profiles/minute (2 seconds between requests)`);
      logger.info(`Estimated completion: ${Math.ceil(profilesToAnalyze.length / 30)} minutes\n`);

      let successCount = 0;
      let failCount = 0;

      // Process profiles with rate limiting
      for (let i = 0; i < profilesToAnalyze.length; i++) {
        const profile = profilesToAnalyze[i];
        const progress = Math.round((i / profilesToAnalyze.length) * 100);

        try {
          logger.info(`[${i + 1}/${profilesToAnalyze.length}] (${progress}%) Triggering analysis for ${profile.username}`);

          // Trigger webhook for analysis
          await this.triggerAnalysisWebhook(profile.username);

          // Update profile metadata to remove pending flag
          profile.metadata.pendingAnalysis = false;
          await profile.save();

          successCount++;

          // CRITICAL: Wait 2 seconds between requests to respect rate limit
          if (i < profilesToAnalyze.length - 1) {
            await this.delay(2000); // 2 second delay = 30 requests per minute
          }

          // Log progress every 10 profiles
          if ((i + 1) % 10 === 0) {
            logger.info(`\n📊 Progress Update: ${i + 1}/${profilesToAnalyze.length} profiles analyzed`);
            logger.info(`   Success: ${successCount}, Failed: ${failCount}`);
            logger.info(`   Time remaining: ~${Math.ceil((profilesToAnalyze.length - i - 1) / 30)} minutes\n`);
          }

        } catch (error) {
          logger.error(`Failed to trigger analysis for ${profile.username}: ${error.message}`);
          failCount++;

          // Still apply rate limiting even on failure
          if (i < profilesToAnalyze.length - 1) {
            await this.delay(2000);
          }
        }
      }

      logger.info(`\n✅ BULK ANALYSIS COMPLETE`);
      logger.info(`Successfully analyzed: ${successCount}/${profilesToAnalyze.length}`);
      logger.info(`Failed: ${failCount}`);

      // Emit completion event
      if (socketService.io) {
        socketService.io.to(`session:${sessionId}`).emit('bulk:analysis:complete', {
          totalAnalyzed: successCount,
          totalFailed: failCount,
          totalProfiles: profilesToAnalyze.length
        });
      }

    } catch (error) {
      logger.error(`Bulk analysis error for session ${sessionId}:`, error);
    }
  }

  /**
   * Trigger analysis webhook to analyze the scraped profile
   */
  async triggerAnalysisWebhook(username) {
    const maxRetries = 3;
    let retryCount = 0;

    // PRODUCTION FIX: Use correct Railway production URL
    let analysisBackendUrl;

    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      // Always use correct Railway production URL in production
      analysisBackendUrl = 'https://web-production-69b69.up.railway.app';
      logger.info(`🚀 PRODUCTION MODE: Using Railway backend URL for webhooks`);
    } else {
      // Development/local mode
      analysisBackendUrl = process.env.ANALYSIS_BACKEND_URL || 'http://localhost:5001';
    }

    // CRITICAL: Remove trailing slash to prevent double slashes in URL
    analysisBackendUrl = analysisBackendUrl.replace(/\/$/, '');

    logger.info(`📍 Using analysis backend URL: ${analysisBackendUrl}`);

    while (retryCount < maxRetries) {
      try {
        const webhookUrl = `${analysisBackendUrl}/api/analyze/webhook`;

        if (retryCount === 0) {
          logger.info(`🔔 Triggering analysis webhook for ${username} at ${webhookUrl}`);
        } else {
          logger.info(`🔔 Retry ${retryCount}/${maxRetries} for analysis webhook: ${username}`);
        }

        const response = await axios.post(webhookUrl, {
          username: username,
          action: 'new_profile_scraped'
        }, {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Instagram-Scraper-Backend/1.0'
          }
        });
        
        logger.info(`✅ Analysis webhook triggered successfully for ${username}: ${response.data.status}`);
        return; // Success, exit
        
      } catch (error) {
        retryCount++;
        
        // More detailed error logging
        const errorDetails = error.response ? 
          `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` :
          error.request ? 
          `No response received. URL: ${error.config?.url}` :
          `Error: ${error.message}`;
        
        if (retryCount >= maxRetries) {
          // Don't throw error - analysis will happen in background
          logger.error(`❌ Failed to trigger analysis webhook for ${username} after ${maxRetries} attempts`);
          logger.error(`   Error details: ${errorDetails}`);
          logger.warn('Profile will be analyzed later by the analysis backend');
        } else {
          logger.warn(`   Webhook attempt ${retryCount} failed: ${errorDetails}`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
      }
    }
  }
}

module.exports = new BatchScrapingService();