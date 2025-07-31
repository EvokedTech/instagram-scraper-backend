const logger = require('../../utils/logger');
const apifyService = require('../../services/apifyService');
const RelatedProfileScraped = require('../../models/RelatedProfileScraped');
const Session = require('../../models/Session');
const { queueManager } = require('../queueManager');
const ProfileDuplicateChecker = require('../../utils/profileDuplicateChecker');

/**
 * Process related profile scraping job
 */
async function processRelatedProfile(job) {
  const { 
    sessionId, 
    profileUrl, 
    username, 
    depth, 
    parentUsername, 
    parentProfileUrl 
  } = job.data;
  const startTime = Date.now();

  try {
    logger.info(`Processing related profile job ${job.id}`, {
      sessionId,
      username,
      depth,
      parentUsername,
      attempt: job.attemptsMade + 1
    });

    // Update job progress
    await job.progress(10);

    // Check if profile already exists and is scraped
    const existingProfile = await RelatedProfileScraped.findOne({
      sessionId,
      username: username.toLowerCase(),
      status: 'scraped'
    });

    if (existingProfile) {
      logger.info(`Related profile ${username} already scraped, skipping`);
      await job.progress(100);
      return {
        status: 'skipped',
        reason: 'already_scraped',
        profileId: existingProfile._id,
        processingTime: Date.now() - startTime
      };
    }

    await job.progress(20);

    // Get or create profile record
    let profile = await RelatedProfileScraped.findOne({
      sessionId,
      username: username.toLowerCase()
    });

    if (!profile) {
      profile = new RelatedProfileScraped({
        sessionId,
        username: username.toLowerCase(),
        profileUrl,
        depth,
        parentUsername,
        parentProfileUrl,
        status: 'pending'
      });
      await profile.save();
    }

    // Profile is already in 'pending' status, no need to update

    await job.progress(30);

    // Scrape profile using Apify
    const scrapedData = await apifyService.scrapeProfile(
      profileUrl,
      false, // Not a root profile
      sessionId,
      {
        depth,
        parentUsername,
        parentProfileUrl
      }
    );

    await job.progress(80);

    // Update session statistics
    const session = await Session.findById(sessionId);
    if (session) {
      await session.incrementScrapedProfiles(1);
    }

    await job.progress(90);

    // Queue next level of related profiles if within depth limit
    const maxDepth = session?.config?.maxDepth || 2;
    if (depth < maxDepth && scrapedData.profileData?.relatedProfiles?.length > 0) {
      const nextDepth = depth + 1;
      
      // Get related profiles (limit to 80 per parent)
      const relatedProfiles = scrapedData.profileData.relatedProfiles.slice(0, 80);
      
      // Filter out profiles that already exist in the database
      const filterResult = await ProfileDuplicateChecker.filterNewProfiles(sessionId, relatedProfiles);
      
      logger.info(`Depth ${depth} profile ${username} duplicate check:`, {
        totalRelated: relatedProfiles.length,
        existing: filterResult.stats.existing,
        new: filterResult.stats.new
      });
      
      if (filterResult.profiles.length > 0) {
        // Get max profiles per depth
        const maxProfilesPerDepth = session?.config?.maxProfilesPerDepth || 100;
        
        // Count existing profiles at next depth
        const existingCount = await RelatedProfileScraped.countDocuments({
          sessionId,
          depth: nextDepth
        });

        if (existingCount < maxProfilesPerDepth) {
          const remainingSlots = maxProfilesPerDepth - existingCount;
          const profilesToQueue = filterResult.profiles.slice(0, Math.min(80, remainingSlots));

          await queueManager.addJob('depthProcessingQueue', {
            sessionId,
            parentProfileId: profile._id,
            parentUsername: username,
            parentProfileUrl: profileUrl,
            depth: nextDepth,
            relatedProfiles: profilesToQueue
          }, {
            priority: 10 - nextDepth, // Higher depth = lower priority
            delay: 0 // Removed rate limiting delay
          });
          
          logger.info(`Queued ${profilesToQueue.length} new profiles for depth ${nextDepth} processing from ${username}`);
        } else {
          logger.info(`Max profiles per depth (${maxProfilesPerDepth}) reached for depth ${nextDepth}`);
        }
      } else {
        logger.info(`No new related profiles to queue from ${username} at depth ${depth}`);
      }
    }

    await job.progress(100);

    logger.info(`Successfully processed related profile ${username}`, {
      profileId: profile._id,
      depth,
      processingTime: Date.now() - startTime,
      relatedProfilesCount: scrapedData.profileData?.relatedProfiles?.length || 0
    });

    return {
      status: 'success',
      profileId: profile._id,
      username,
      depth,
      processingTime: Date.now() - startTime,
      relatedProfilesQueued: scrapedData.profileData?.relatedProfiles?.length || 0
    };

  } catch (error) {
    logger.error(`Failed to process related profile ${username}:`, error);

    // Update profile status
    try {
      const profile = await RelatedProfileScraped.findOne({
        sessionId,
        username: username.toLowerCase()
      });
      
      if (profile) {
        profile.status = 'failed';
        profile.error = {
          message: error.message,
          timestamp: new Date()
        };
        await profile.save();
      }
    } catch (dbError) {
      logger.error(`Failed to update profile status:`, dbError);
    }

    throw error;
  }
}

/**
 * Handle job completion
 */
async function onCompleted(job, result) {
  logger.info(`Related profile job ${job.id} completed`, {
    username: job.data.username,
    depth: job.data.depth,
    result
  });
}

/**
 * Handle job failure
 */
async function onFailed(job, error) {
  logger.error(`Related profile job ${job.id} failed:`, {
    jobId: job.id,
    username: job.data.username,
    depth: job.data.depth,
    error: error.message,
    attempts: job.attemptsMade,
    willRetry: job.attemptsMade < job.opts.attempts
  });
}

module.exports = {
  processRelatedProfile,
  onCompleted,
  onFailed
};