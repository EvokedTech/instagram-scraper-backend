const logger = require('../../utils/logger');
const apifyService = require('../../services/apifyService');
const RootProfileScraped = require('../../models/RootProfileScraped');
const RelatedProfileScraped = require('../../models/RelatedProfileScraped');
const Session = require('../../models/Session');
const { queueManager } = require('../queueManager');
const ProfileDuplicateChecker = require('../../utils/profileDuplicateChecker');
const { getBatchSizeForDepth } = require('../../utils/batchSizeCalculator');
const socketService = require('../../services/socketService');
const sessionCompletionService = require('../../services/sessionCompletionService');
const profileAnalysisService = require('../../services/profileAnalysisService');

/**
 * Process root profile scraping job
 */
async function processRootProfile(job) {
  const { sessionId, profileUrl, username } = job.data;
  const startTime = Date.now();

  try {
    logger.info(`Processing root profile job ${job.id}`, {
      sessionId,
      username,
      profileUrl,
      attempt: job.attemptsMade + 1
    });

    // Update job progress
    await job.progress(10);
    
    // Emit profile processing start event
    socketService.emitProfileStatus(sessionId, {
      username,
      profileUrl,
      depth: 0,
      status: 'processing',
      type: 'root'
    });

    // Check if session is stopped
    const session = await Session.findById(sessionId);
    if (!session || session.status === 'stopped') {
      logger.info(`Session ${sessionId} is stopped, skipping job`);
      return {
        status: 'skipped',
        reason: 'session_stopped'
      };
    }

    // Check if profile already exists and is scraped (from any session)
    const existingProfile = await RootProfileScraped.findOne({
      profileUrl,
      status: 'scraped'
    });

    if (existingProfile) {
      logger.info(`Profile ${username} already scraped, extracting related profiles from database`);
      
      // Ensure metadata.relatedProfilesCount is set for existing profiles
      if (existingProfile.profileData?.relatedProfiles && 
          (!existingProfile.metadata || existingProfile.metadata.relatedProfilesCount === undefined)) {
        existingProfile.metadata = existingProfile.metadata || {};
        existingProfile.metadata.relatedProfilesCount = existingProfile.profileData.relatedProfiles.length;
        await existingProfile.save();
        logger.info(`Updated metadata.relatedProfilesCount for ${username}: ${existingProfile.profileData.relatedProfiles.length}`);
      }
      
      // Check if root profile analysis is enabled for this session
      if (session?.config?.analyzeRootProfiles) {
        try {
          logger.info(`Analyzing existing root profile ${username} as per session config`);
          await profileAnalysisService.analyzeRootProfile(existingProfile, sessionId);
          logger.info(`Successfully analyzed existing root profile ${username}`);
        } catch (analysisError) {
          logger.error(`Failed to analyze existing root profile ${username}:`, analysisError);
          // Continue with the process even if analysis fails
        }
      }
      
      // Extract related profiles from existing data
      let queuedProfilesCount = 0;
      
      if (existingProfile.profileData?.relatedProfiles?.length > 0) {
        // Get session config for maxProfilesPerDepth
        const maxProfilesPerDepth = session?.config?.maxProfilesPerDepth;
        
        // Check how many profiles already exist at depth 1 for this session
        const existingCountAtDepth1 = await RelatedProfileScraped.countDocuments({
          sessionId,
          depth: 1
        });
        
        // Calculate how many more profiles we can add
        let profilesToProcessCount;
        if (maxProfilesPerDepth === null || maxProfilesPerDepth === undefined) {
          // Unlimited mode
          profilesToProcessCount = existingProfile.profileData.relatedProfiles.length;
        } else {
          // Limited mode - calculate remaining slots
          const remainingSlots = Math.max(0, maxProfilesPerDepth - existingCountAtDepth1);
          profilesToProcessCount = Math.min(existingProfile.profileData.relatedProfiles.length, remainingSlots);
        }
        
        logger.info(`Root profile ${username} depth limit check:`, {
          maxProfilesPerDepth: maxProfilesPerDepth || 'unlimited',
          existingAtDepth1: existingCountAtDepth1,
          remainingSlots: maxProfilesPerDepth ? maxProfilesPerDepth - existingCountAtDepth1 : 'unlimited',
          willProcess: profilesToProcessCount
        });
        
        if (profilesToProcessCount > 0) {
          // Get only the profiles we can process
          const relatedProfiles = existingProfile.profileData.relatedProfiles.slice(0, profilesToProcessCount);
          
          // Filter out profiles that already exist in the database (across all sessions)
          const filterResult = await ProfileDuplicateChecker.filterNewProfiles(null, relatedProfiles);
          
          logger.info(`Root profile ${username} duplicate check:`, {
            totalRelated: relatedProfiles.length,
            existing: filterResult.stats.existing,
            new: filterResult.stats.new
          });
          
          // Create jobs only for new profiles
          const profilesData = [];
          for (const relatedProfile of filterResult.profiles) {
            const profileUsername = (relatedProfile.username || relatedProfile.userName || '').toLowerCase();
            if (profileUsername) {
              profilesData.push({
                username: profileUsername,
                profileUrl: `https://www.instagram.com/${profileUsername}`,
                depth: 1,
                parentUsername: username,
                parentProfileUrl: profileUrl
              });
            }
          }
          
          if (profilesData.length > 0) {
            // Get dynamic batch size based on depth
            const BATCH_SIZE = getBatchSizeForDepth(1);
            
            for (let i = 0; i < profilesData.length; i += BATCH_SIZE) {
              const batch = profilesData.slice(i, i + BATCH_SIZE);
              
              await queueManager.addJob('relatedProfileBatchQueue', {
                sessionId,
                profiles: batch,
                depth: 1
              }, {
                priority: 5,
                attempts: 3,
                backoff: {
                  type: 'fixed',
                  delay: 5000
                }
              });
              
              queuedProfilesCount += batch.length;
            }
            
            logger.info(`Queued ${queuedProfilesCount} new related profiles from existing ${username} data`);
            
            // Emit batch update
            socketService.emitBatchUpdate(sessionId, {
              type: 'related_profiles_queued',
              depth: 1,
              count: queuedProfilesCount,
              source: username
            });
          }
        } else {
          logger.info(`Skipping related profiles from ${username} - depth limit reached (${existingCountAtDepth1}/${maxProfilesPerDepth})`);
        }
      }
      
      // Emit profile completion
      socketService.emitProfileStatus(sessionId, {
        username,
        profileUrl,
        depth: 0,
        status: 'completed',
        type: 'root',
        relatedProfilesQueued: queuedProfilesCount
      });
      
      await job.progress(100);
      return {
        status: 'extracted_from_db',
        profileId: existingProfile._id,
        relatedProfilesQueued: queuedProfilesCount,
        processingTime: Date.now() - startTime
      };
    }

    await job.progress(20);

    // Create or update profile record
    let profile = await RootProfileScraped.findOne({
      sessionId,
      profileUrl
    });

    if (!profile) {
      profile = new RootProfileScraped({
        sessionId,
        username: username.toLowerCase(),
        profileUrl,
        depth: 0,
        status: 'pending'
      });
      await profile.save();
    }

    await job.progress(30);

    // Scrape profile using Apify
    const scrapedData = await apifyService.scrapeProfile(
      profileUrl,
      true, // isRootProfile
      sessionId
    );

    await job.progress(80);

    // Update session statistics (reuse the session variable we already have)
    if (session) {
      await session.incrementScrapedProfiles(1);
    }

    await job.progress(90);

    // Check if root profile analysis is enabled for this session
    if (session?.config?.analyzeRootProfiles && profile) {
      try {
        logger.info(`Analyzing root profile ${username} as per session config`);
        await profileAnalysisService.analyzeRootProfile(profile, sessionId);
        logger.info(`Successfully analyzed root profile ${username}`);
      } catch (analysisError) {
        logger.error(`Failed to analyze root profile ${username}:`, analysisError);
        // Continue with the process even if analysis fails
      }
    }

    // Track queued profiles count
    let queuedProfilesCount = 0;

    // Queue related profiles extraction if enabled
    if (scrapedData.profileData?.relatedProfiles?.length > 0) {
      // Get session config for maxProfilesPerDepth
      const maxProfilesPerDepth = session?.config?.maxProfilesPerDepth;
      
      // Check how many profiles already exist at depth 1 for this session
      const existingCountAtDepth1 = await RelatedProfileScraped.countDocuments({
        sessionId,
        depth: 1
      });
      
      // Calculate how many more profiles we can add
      let profilesToProcessCount;
      if (maxProfilesPerDepth === null || maxProfilesPerDepth === undefined) {
        // Unlimited mode
        profilesToProcessCount = scrapedData.profileData.relatedProfiles.length;
      } else {
        // Limited mode - calculate remaining slots
        const remainingSlots = Math.max(0, maxProfilesPerDepth - existingCountAtDepth1);
        profilesToProcessCount = Math.min(scrapedData.profileData.relatedProfiles.length, remainingSlots);
      }
      
      logger.info(`Root profile ${username} depth limit check:`, {
        maxProfilesPerDepth: maxProfilesPerDepth || 'unlimited',
        existingAtDepth1: existingCountAtDepth1,
        remainingSlots: maxProfilesPerDepth ? maxProfilesPerDepth - existingCountAtDepth1 : 'unlimited',
        willProcess: profilesToProcessCount
      });
      
      if (profilesToProcessCount > 0) {
        // Get only the profiles we can process
        const relatedProfiles = scrapedData.profileData.relatedProfiles.slice(0, profilesToProcessCount);
        
        // Filter out profiles that already exist in the database
        const filterResult = await ProfileDuplicateChecker.filterNewProfiles(sessionId, relatedProfiles);
        
        logger.info(`Root profile ${username} duplicate check:`, {
          totalRelated: relatedProfiles.length,
          existing: filterResult.stats.existing,
          new: filterResult.stats.new
        });
        
        // Create jobs only for new profiles
        const profilesData = [];
        for (const relatedProfile of filterResult.profiles) {
          const profileUsername = (relatedProfile.username || relatedProfile.userName || '').toLowerCase();
          if (profileUsername) {
            profilesData.push({
              username: profileUsername,
              profileUrl: `https://www.instagram.com/${profileUsername}/`,
              depth: 1,
              parentUsername: username,
              parentProfileUrl: profileUrl
            });
          }
        }
        
        if (profilesData.length > 0) {
          // Get dynamic batch size based on depth
          const BATCH_SIZE = getBatchSizeForDepth(1);
          let jobsQueued = 0;
          
          for (let i = 0; i < profilesData.length; i += BATCH_SIZE) {
            const batch = profilesData.slice(i, i + BATCH_SIZE);
            
            await queueManager.addJob('relatedProfileBatchQueue', {
              sessionId,
              profiles: batch,
              depth: 1
            }, {
              priority: 5,
              attempts: 3,
              backoff: {
                type: 'fixed',
                delay: 5000
              }
            });
            
            jobsQueued += batch.length;
          }
          
          queuedProfilesCount = jobsQueued;
          logger.info(`Queued ${jobsQueued} new related profiles in ${Math.ceil(profilesData.length / BATCH_SIZE)} batches from ${username} (skipped ${filterResult.stats.existing} existing)`);
          
          // Emit batch update
          socketService.emitBatchUpdate(sessionId, {
            type: 'related_profiles_queued',
            depth: 1,
            count: jobsQueued,
            source: username
          });
        } else {
          logger.info(`No new related profiles to queue from ${username} (all ${filterResult.stats.existing} already exist)`);
        }
      } else {
        logger.info(`Skipping related profiles from ${username} - depth limit reached (${existingCountAtDepth1}/${maxProfilesPerDepth})`);
      }
    }
    
    // Emit profile completion
    socketService.emitProfileStatus(sessionId, {
      username,
      profileUrl,
      depth: 0,
      status: 'completed',
      type: 'root',
      relatedProfilesQueued: queuedProfilesCount,
      relatedProfilesCount: scrapedData.profileData?.relatedProfiles?.length || 0
    });

    await job.progress(100);

    logger.info(`Successfully processed root profile ${username}`, {
      profileId: profile._id,
      processingTime: Date.now() - startTime,
      relatedProfilesCount: scrapedData.profileData?.relatedProfiles?.length || 0,
      relatedProfilesQueued: queuedProfilesCount
    });

    // Check if all root profiles are processed and no related profiles were queued
    if (queuedProfilesCount === 0) {
      // Check if this might be the last root profile
      const pendingRootCount = await RootProfileScraped.countDocuments({
        sessionId,
        status: 'pending'
      });
      
      if (pendingRootCount === 0) {
        logger.info(`All root profiles processed for session ${sessionId}, checking for completion`);
        setTimeout(async () => {
          await sessionCompletionService.checkAndUpdateSessionCompletion(sessionId);
        }, 5000); // Delay to ensure all jobs are properly settled
      }
    }

    return {
      status: 'success',
      profileId: profile._id,
      username,
      processingTime: Date.now() - startTime,
      relatedProfilesQueued: queuedProfilesCount
    };

  } catch (error) {
    logger.error(`Failed to process root profile ${username}:`, error);

    // Update profile status if exists
    try {
      const profile = await RootProfileScraped.findOne({
        sessionId,
        username: username.toLowerCase()
      });
      
      if (profile) {
        await profile.markAsFailed(error);
      }
    } catch (dbError) {
      logger.error(`Failed to update profile status:`, dbError);
    }

    // Check if this is the last attempt
    if (job.attemptsMade >= job.opts.attempts - 1) {
      // Update session statistics for failed profile
      try {
        const session = await Session.findById(sessionId);
        if (session) {
          await session.updateStats({
            failedProfiles: (session.stats.failedProfiles || 0) + 1
          });
        }
      } catch (statsError) {
        logger.error(`Failed to update session stats:`, statsError);
      }
    }

    throw error;
  }
}

/**
 * Handle job completion
 */
async function onCompleted(job, result) {
  logger.info(`Root profile job ${job.id} completed`, result);
}

/**
 * Handle job failure
 */
async function onFailed(job, error) {
  logger.error(`Root profile job ${job.id} failed:`, {
    jobId: job.id,
    username: job.data.username,
    error: error.message,
    attempts: job.attemptsMade,
    willRetry: job.attemptsMade < job.opts.attempts
  });
}

module.exports = {
  processRootProfile,
  onCompleted,
  onFailed
};