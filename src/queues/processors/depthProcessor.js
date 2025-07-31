const logger = require('../../utils/logger');
const RelatedProfileScraped = require('../../models/RelatedProfileScraped');
const { queueManager } = require('../queueManager');
const ProfileUrlHelper = require('../../utils/profileUrlHelper');

/**
 * Process depth level - queue related profiles for scraping
 */
async function processDepthLevel(job) {
  const {
    sessionId,
    parentProfileId,
    parentUsername,
    parentProfileUrl,
    depth,
    relatedProfiles
  } = job.data;

  try {
    logger.info(`Processing depth level job ${job.id}`, {
      sessionId,
      depth,
      parentUsername,
      profilesCount: relatedProfiles.length
    });

    await job.progress(10);

    // Check if session is stopped
    const Session = require('../../models/Session');
    const session = await Session.findById(sessionId);
    if (!session || session.status === 'stopped') {
      logger.info(`Session ${sessionId} is stopped, skipping depth processing job`);
      return {
        status: 'skipped',
        reason: 'session_stopped',
        depth,
        parentUsername
      };
    }

    // Extract usernames
    const usernames = relatedProfiles.map(p => 
      (p.username || p.userName || '').toLowerCase()
    ).filter(u => u);

    // Use ProfileDuplicateChecker to check for existing profiles across both collections
    const ProfileDuplicateChecker = require('../../utils/profileDuplicateChecker');
    const checkResult = await ProfileDuplicateChecker.checkProfilesByUsername(null, usernames);
    
    logger.info(`Depth processor duplicate check:`, {
      total: usernames.length,
      existing: checkResult.stats.existing,
      new: checkResult.stats.new
    });

    // Create a set of existing usernames for quick lookup
    const existingUsernamesSet = new Set(checkResult.exists);

    await job.progress(30);

    // Create profile records and queue scraping jobs
    const jobsToQueue = [];
    const createdProfiles = [];

    for (const relatedProfile of relatedProfiles) {
      const username = (relatedProfile.username || relatedProfile.userName || '').toLowerCase();
      
      if (!username) {
        continue;
      }

      const profileUrl = ProfileUrlHelper.usernameToUrl(username);
      
      // Skip if profile already exists
      if (existingUsernamesSet.has(username)) {
        continue;
      }
      
      // Create profile record
      const profile = new RelatedProfileScraped({
        sessionId,
        username,
        profileUrl,
        depth,
        parentUsername,
        parentProfileUrl,
        status: 'pending',
        profileData: {
          fullName: relatedProfile.full_name || relatedProfile.fullName || '',
          isPrivate: relatedProfile.is_private || relatedProfile.isPrivate || false,
          isVerified: relatedProfile.is_verified || relatedProfile.isVerified || false,
          profilePicUrl: relatedProfile.profile_pic_url || relatedProfile.profilePicUrl || '',
          instagramId: relatedProfile.id || ''
        }
      });

      await profile.save();
      createdProfiles.push(profile);

      // Prepare job for queue
      jobsToQueue.push({
        sessionId,
        profileUrl,
        username,
        depth,
        parentUsername,
        parentProfileUrl
      });
    }

    await job.progress(70);

    // Queue scraping jobs in batches
    if (jobsToQueue.length > 0) {
      // Queue in batches of 20
      const BATCH_SIZE = 20;
      
      for (let i = 0; i < jobsToQueue.length; i += BATCH_SIZE) {
        const batch = jobsToQueue.slice(i, i + BATCH_SIZE);
        
        // Prepare batch profiles
        const batchProfiles = batch.map(job => ({
          username: job.username,
          profileUrl: job.profileUrl,
          depth: job.depth,
          parentUsername: job.parentUsername,
          parentProfileUrl: job.parentProfileUrl
        }));
        
        await queueManager.addJob('relatedProfileBatchQueue', {
          sessionId,
          profiles: batchProfiles,
          depth
        }, {
          priority: 10 - depth, // Higher depth = lower priority
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 0 // Removed rate limiting delay
          }
        });
      }
    }

    await job.progress(100);

    logger.info(`Depth processing completed`, {
      depth,
      parentUsername,
      profilesCreated: createdProfiles.length,
      jobsQueued: jobsToQueue.length
    });

    return {
      status: 'success',
      depth,
      parentUsername,
      profilesCreated: createdProfiles.length,
      jobsQueued: jobsToQueue.length,
      skipped: relatedProfiles.length - jobsToQueue.length
    };

  } catch (error) {
    logger.error(`Failed to process depth level:`, error);
    throw error;
  }
}

/**
 * Handle job completion
 */
async function onCompleted(job, result) {
  logger.info(`Depth processing job ${job.id} completed`, result);
}

/**
 * Handle job failure
 */
async function onFailed(job, error) {
  logger.error(`Depth processing job ${job.id} failed:`, {
    jobId: job.id,
    depth: job.data.depth,
    parentUsername: job.data.parentUsername,
    error: error.message,
    attempts: job.attemptsMade
  });
}

module.exports = {
  processDepthLevel,
  onCompleted,
  onFailed
};