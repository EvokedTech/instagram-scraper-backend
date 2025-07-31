const logger = require('../../utils/logger');
const apifyService = require('../../services/apifyService');
const RelatedProfileScraped = require('../../models/RelatedProfileScraped');
const Session = require('../../models/Session');
const { queueManager } = require('../queueManager');
const ProfileDuplicateChecker = require('../../utils/profileDuplicateChecker');
const { getBatchSizeForDepth } = require('../../utils/batchSizeCalculator');
const sessionCompletionService = require('../../services/sessionCompletionService');

/**
 * Process batch of related profiles
 */
async function processRelatedProfileBatch(job) {
  const { 
    sessionId, 
    profiles, // Array of profile objects with username, profileUrl, depth, parentUsername, parentProfileUrl
    depth 
  } = job.data;
  const startTime = Date.now();
  const batchSize = profiles.length;

  try {
    logger.info(`Processing related profile batch job ${job.id}`, {
      sessionId,
      batchSize,
      depth,
      attempt: job.attemptsMade + 1
    });

    await job.progress(10);

    // Get session for configuration
    const session = await Session.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if session is stopped
    if (session.status === 'stopped') {
      logger.info(`Session ${sessionId} is stopped, skipping batch job`);
      return {
        status: 'skipped',
        reason: 'session_stopped',
        batchSize
      };
    }

    // Extract profile URLs for batch scraping
    const profileUrls = profiles.map(p => p.profileUrl);
    
    // Check which profiles already exist in the database (from any session)
    const existingProfiles = await RelatedProfileScraped.find({
      profileUrl: { $in: profileUrls },
      status: 'scraped'
    }).select('profileUrl username profileData');
    
    const existingUrlsSet = new Set(existingProfiles.map(p => p.profileUrl));
    const profilesToScrape = profiles.filter(p => !existingUrlsSet.has(p.profileUrl));
    const profilesToScrapeUrls = profilesToScrape.map(p => p.profileUrl);
    
    logger.info(`Batch profile check:`, {
      total: batchSize,
      existing: existingProfiles.length,
      toScrape: profilesToScrape.length
    });
    
    await job.progress(20);

    // Initialize results
    const processedResults = {
      successful: 0,
      failed: 0,
      relatedProfilesQueued: 0
    };

    // Process existing profiles first
    for (const existingProfile of existingProfiles) {
      processedResults.successful++;
      
      // Extract related profiles from existing data if within depth limit
      const maxDepth = session?.config?.maxDepth || 2;
      if (depth < maxDepth && existingProfile.profileData?.relatedProfiles?.length > 0) {
        const nextDepth = depth + 1;
        const relatedProfiles = existingProfile.profileData.relatedProfiles.slice(0, 80);
        
        // Filter out existing profiles (across all sessions)
        const filterResult = await ProfileDuplicateChecker.filterNewProfiles(null, relatedProfiles);
        
        if (filterResult.profiles.length > 0) {
          const maxProfilesPerDepth = session?.config?.maxProfilesPerDepth || 100;
          const existingCount = await RelatedProfileScraped.countDocuments({
            sessionId,
            depth: nextDepth
          });

          // Check if unlimited mode or under limit
          if (!maxProfilesPerDepth || existingCount < maxProfilesPerDepth) {
            const remainingSlots = maxProfilesPerDepth ? maxProfilesPerDepth - existingCount : Infinity;
            const profilesToQueue = filterResult.profiles.slice(0, Math.min(80, remainingSlots));

            const nextBatchProfiles = profilesToQueue.map(p => ({
              username: (p.username || p.userName || '').toLowerCase(),
              profileUrl: `https://www.instagram.com/${(p.username || p.userName || '').toLowerCase()}`,
              depth: nextDepth,
              parentUsername: existingProfile.username,
              parentProfileUrl: existingProfile.profileUrl
            }));

            // Get dynamic batch size based on next depth
            const BATCH_SIZE = getBatchSizeForDepth(nextDepth);
            for (let i = 0; i < nextBatchProfiles.length; i += BATCH_SIZE) {
              const batch = nextBatchProfiles.slice(i, i + BATCH_SIZE);
              
              await queueManager.addJob('relatedProfileBatchQueue', {
                sessionId,
                profiles: batch,
                depth: nextDepth
              }, {
                priority: 10 - nextDepth,
                delay: 0
              });
            }

            processedResults.relatedProfilesQueued += nextBatchProfiles.length;
          }
        }
      }
    }

    // Only scrape new profiles
    let batchResults = { successful: [], failed: [] };
    
    if (profilesToScrape.length > 0) {
      logger.info(`Scraping batch of ${profilesToScrape.length} new profiles at depth ${depth}`);
      batchResults = await apifyService.scrapeBatch(
        profilesToScrapeUrls,
        false, // Not root profiles
        sessionId,
        {
          depth,
          batchProcessing: true
        }
      );
    }

    await job.progress(70);

    // Update session statistics
    if (session && batchResults.successful.length > 0) {
      await session.incrementScrapedProfiles(batchResults.successful.length);
    }

    // Process successful scrapes
    for (const result of batchResults.successful) {
      const profileData = profilesToScrape.find(p => p.profileUrl === result.url);
      if (!profileData) continue;

      try {
        // Find or create the profile record
        let profile = await RelatedProfileScraped.findOne({
          sessionId,
          username: profileData.username.toLowerCase()
        });

        if (!profile) {
          profile = new RelatedProfileScraped({
            sessionId,
            username: profileData.username.toLowerCase(),
            profileUrl: profileData.profileUrl,
            depth: profileData.depth,
            parentUsername: profileData.parentUsername,
            parentProfileUrl: profileData.parentProfileUrl,
            status: 'pending'
          });
        }

        // Mark as scraped with the profile data
        await profile.markAsScraped(result.profile.profileData, {
          apifyRunId: result.profile.profileData?.id || 'batch',
          processingTime: (Date.now() - startTime) / 1000,
          discoveredFrom: 'relatedProfiles'
        });

        processedResults.successful++;

        // Queue next level if within depth limit
        const maxDepth = session?.config?.maxDepth || 2;
        if (depth < maxDepth && result.profile.profileData?.relatedProfiles?.length > 0) {
          const nextDepth = depth + 1;
          
          // Get related profiles (limit to 80 per parent)
          const relatedProfiles = result.profile.profileData.relatedProfiles.slice(0, 80);
          
          // Filter out existing profiles
          const filterResult = await ProfileDuplicateChecker.filterNewProfiles(sessionId, relatedProfiles);
          
          if (filterResult.profiles.length > 0) {
            // Check max profiles per depth limit
            const maxProfilesPerDepth = session?.config?.maxProfilesPerDepth || 100;
            const existingCount = await RelatedProfileScraped.countDocuments({
              sessionId,
              depth: nextDepth
            });

            // Check if unlimited mode or under limit
            if (!maxProfilesPerDepth || existingCount < maxProfilesPerDepth) {
              const remainingSlots = maxProfilesPerDepth ? maxProfilesPerDepth - existingCount : Infinity;
              const profilesToQueue = filterResult.profiles.slice(0, Math.min(80, remainingSlots));

              // Prepare profiles for next batch
              const nextBatchProfiles = profilesToQueue.map(p => ({
                username: (p.username || p.userName || '').toLowerCase(),
                profileUrl: `https://www.instagram.com/${(p.username || p.userName || '').toLowerCase()}`,
                depth: nextDepth,
                parentUsername: profileData.username,
                parentProfileUrl: profileData.profileUrl
              }));

              // Get dynamic batch size based on next depth
              const BATCH_SIZE = getBatchSizeForDepth(nextDepth);
              for (let i = 0; i < nextBatchProfiles.length; i += BATCH_SIZE) {
                const batch = nextBatchProfiles.slice(i, i + BATCH_SIZE);
                
                await queueManager.addJob('relatedProfileBatchQueue', {
                  sessionId,
                  profiles: batch,
                  depth: nextDepth
                }, {
                  priority: 10 - nextDepth,
                  delay: 0
                });
              }

              processedResults.relatedProfilesQueued += nextBatchProfiles.length;
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to process profile ${profileData.username} in batch:`, error);
        processedResults.failed++;
      }
    }

    // Process failed scrapes
    for (const failed of batchResults.failed) {
      const profileData = profilesToScrape.find(p => p.profileUrl === failed.url);
      if (!profileData) continue;

      try {
        let profile = await RelatedProfileScraped.findOne({
          sessionId,
          username: profileData.username.toLowerCase()
        });

        if (profile) {
          await profile.markAsFailed(new Error(failed.error));
        }
      } catch (error) {
        logger.error(`Failed to update failed status for ${profileData.username}:`, error);
      }

      processedResults.failed++;
    }

    await job.progress(100);

    logger.info(`Successfully processed related profile batch`, {
      batchSize,
      depth,
      successful: processedResults.successful,
      failed: processedResults.failed,
      relatedProfilesQueued: processedResults.relatedProfilesQueued,
      processingTime: Date.now() - startTime
    });

    // Check if session is complete after processing this batch
    // Only check if we're at max depth or no new profiles were queued
    const maxDepth = session?.config?.maxDepth || 2;
    if (depth >= maxDepth || processedResults.relatedProfilesQueued === 0) {
      logger.info(`Checking session completion for ${sessionId} after batch at depth ${depth}`);
      setTimeout(async () => {
        await sessionCompletionService.checkAndUpdateSessionCompletion(sessionId);
      }, 5000); // Delay to ensure all jobs are properly settled
    }

    return {
      status: 'success',
      batchSize,
      depth,
      ...processedResults,
      processingTime: Date.now() - startTime
    };

  } catch (error) {
    logger.error(`Failed to process related profile batch:`, error);

    // Try to mark all profiles in batch as failed
    for (const profileData of profiles) {
      try {
        const profile = await RelatedProfileScraped.findOne({
          sessionId,
          username: profileData.username.toLowerCase()
        });
        
        if (profile) {
          await profile.markAsFailed(error);
        }
      } catch (dbError) {
        logger.error(`Failed to update profile status for ${profileData.username}:`, dbError);
      }
    }

    throw error;
  }
}

/**
 * Handle job completion
 */
async function onCompleted(job, result) {
  logger.info(`Related profile batch job ${job.id} completed`, {
    batchSize: job.data.profiles.length,
    depth: job.data.depth,
    result
  });
}

/**
 * Handle job failure
 */
async function onFailed(job, error) {
  logger.error(`Related profile batch job ${job.id} failed:`, {
    jobId: job.id,
    batchSize: job.data.profiles.length,
    depth: job.data.depth,
    error: error.message,
    attempts: job.attemptsMade,
    willRetry: job.attemptsMade < job.opts.attempts
  });
}

module.exports = {
  processRelatedProfileBatch,
  onCompleted,
  onFailed
};