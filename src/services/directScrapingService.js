const { ApifyClient } = require('apify-client');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const AnalyzedRelatedProfile = require('../models/AnalyzedRelatedProfile');
const Session = require('../models/Session');
const profileAnalysisService = require('./profileAnalysisService');
const profileCheckService = require('./profileCheckService');
const socketService = require('./socketService');
const logger = require('../utils/logger');

class DirectScrapingService {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    this.actorId = 'shu8hvrXbJbY3Eb9W';
    this.activeJobs = new Map();
  }

  async processSession(sessionId) {
    try {
      logger.info(`Starting direct processing for session: ${sessionId}`);
      
      // Get session details
      const session = await Session.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update session status to running
      session.status = 'running';
      await session.save();
      
      // Emit start event
      if (socketService.io) {
        socketService.io.to(`session:${sessionId}`).emit('session:started', {
          sessionId,
          status: 'running'
        });
      }

      // Get all pending profiles for this session
      const pendingProfiles = await RootProfileScraped.find({
        sessionId,
        status: 'pending'
      });

      logger.info(`Found ${pendingProfiles.length} pending profiles to scrape`);

      // Process each profile ONE BY ONE with delay to prevent Apify failures
      for (let i = 0; i < pendingProfiles.length; i++) {
        const profile = pendingProfiles[i];
        try {
          logger.info(`Processing profile ${i + 1}/${pendingProfiles.length}: ${profile.username}`);
          
          // Check if already scraped (double-check)
          const currentStatus = await RootProfileScraped.findById(profile._id).select('status');
          if (currentStatus && (currentStatus.status === 'scraped' || currentStatus.status === 'analyzed')) {
            logger.info(`Profile ${profile.username} already scraped, skipping`);
            continue;
          }
          
          await this.scrapeAndUpdateProfile(profile, session);
          
          // Add delay between profiles to prevent overwhelming Apify
          if (i < pendingProfiles.length - 1) {
            const delayMs = 10000; // 10 seconds between profiles (PROVEN to work)
            logger.info(`Waiting ${delayMs}ms before next profile to prevent Instagram blocking...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
        } catch (error) {
          logger.error(`Failed to scrape profile ${profile.username}:`, error);
          // Continue with next profile even if one fails
        }
      }

      // Update session stats
      const scrapedCount = await RootProfileScraped.countDocuments({
        sessionId,
        status: 'scraped'
      });

      const analyzedCount = await AnalyzedRelatedProfile.countDocuments({
        sessionId,
        analysisStatus: 'completed'
      });

      session.stats.scrapedProfiles = scrapedCount;
      session.stats.analyzedProfiles = analyzedCount;
      session.status = 'completed';
      await session.save();

      // Emit completion event
      if (socketService.io) {
        socketService.io.to(`session:${sessionId}`).emit('session:completed', {
          sessionId,
          status: 'completed',
          stats: session.stats
        });
      }

      logger.info(`Session ${sessionId} completed. Scraped: ${scrapedCount}, Analyzed: ${analyzedCount}`);
      
      return session;

    } catch (error) {
      logger.error(`Failed to process session ${sessionId}:`, error);
      
      // Update session status to failed
      await Session.findByIdAndUpdate(sessionId, {
        status: 'failed'
      });
      
      throw error;
    }
  }

  async scrapeAndUpdateProfile(profile, session) {
    try {
      logger.info(`Checking if profile ${profile.username} is public...`);
      
      // Check if profile is public before scraping
      const profileCheck = await profileCheckService.isProfilePublic(profile.username);
      
      if (!profileCheck.exists) {
        logger.warn(`Profile ${profile.username} does not exist, skipping`);
        profile.status = 'failed';
        profile.error = 'Profile does not exist';
        await profile.save();
        return profile;
      }
      
      if (!profileCheck.isPublic) {
        logger.warn(`Profile ${profile.username} is PRIVATE, skipping to save Apify credits`);
        profile.status = 'skipped';
        profile.error = 'Profile is private';
        profile.metadata = { ...profile.metadata, isPrivate: true, skippedReason: 'private_profile' };
        await profile.save();
        
        // Emit skip event
        if (socketService.io) {
          socketService.io.to(`session:${session._id.toString()}`).emit('profile:skipped', {
            username: profile.username,
            reason: 'private',
            status: 'skipped'
          });
        }
        
        return profile;
      }
      
      logger.info(`Profile ${profile.username} is PUBLIC, proceeding with scraping`);
      
      // Emit scraping start event
      if (socketService.io) {
        socketService.io.to(`session:${session._id.toString()}`).emit('profile:scraping', {
          username: profile.username,
          status: 'scraping'
        });
      }

      // Call Apify to scrape the profile - SINGLE profile at a time with PROVEN configuration
      const input = {
        directUrls: [profile.profileUrl],
        resultsLimit: 10,  // CRITICAL: Keep low to prevent failures
        resultsType: 'details',
        searchLimit: 50,   // CRITICAL: Keep low to prevent failures
        searchType: 'user',
        addParentData: false,
        enhanceUserSearchWithFacebookPage: false,
        isUserReelFeedURL: false,
        isUserTaggedFeedURL: false,
        extendOutputFunction: '', // This ensures all available data is collected
        extendScraperFunction: '', // This ensures deeper scraping  
        includeContactInfo: true,  // Explicitly request contact information including email
        maxRequestRetries: 5,      // More retries
        requestTimeoutSecs: 120,    // CRITICAL: 120 second timeout
        handleRequestTimeoutSecs: 180,
        maxConcurrency: 1,          // Process one at a time
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']  // CRITICAL: Use residential proxies
        }
      };

      logger.info(`Calling Apify for ${profile.username} with 120s timeout and RESIDENTIAL proxies...`);
      
      let run;
      let items;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          run = await this.client.actor(this.actorId).call(input);
          const dataset = await this.client.dataset(run.defaultDatasetId).listItems();
          items = dataset.items;
          
          if (items && items.length > 0) {
            break; // Success, exit retry loop
          }
          
          retryCount++;
          if (retryCount <= maxRetries) {
            logger.warn(`No data received from Apify for ${profile.username}, retry ${retryCount}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        } catch (apifyError) {
          retryCount++;
          if (retryCount <= maxRetries) {
            logger.warn(`Apify error for ${profile.username}, retry ${retryCount}/${maxRetries}: ${apifyError.message}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw apifyError;
          }
        }
      }

      if (!items || items.length === 0) {
        throw new Error(`No data received from Apify after ${maxRetries + 1} attempts`);
      }

      const scrapedData = items[0];

      // Update profile with scraped data
      await profile.markAsScraped(scrapedData, {
        apifyRunId: run.id,
        processingTime: 0
      });

      logger.info(`Successfully scraped profile: ${profile.username}`);
      
      // Emit scraping success event
      if (socketService.io) {
        socketService.io.to(`session:${session._id.toString()}`).emit('profile:scraped', {
          username: profile.username,
          followersCount: scrapedData.followersCount || 0,
          postsCount: scrapedData.postsCount || 0,
          status: 'scraped'
        });
      }

      // Analyze profile if enabled
      if (session.config?.analyzeRootProfiles) {
        await this.analyzeProfile(profile, scrapedData, session);
      }

      // Process related profiles if any
      if (scrapedData.relatedProfiles && scrapedData.relatedProfiles.length > 0) {
        logger.info(`Found ${scrapedData.relatedProfiles.length} related profiles for ${profile.username}`);
        
        // Store related profiles for future processing (if needed)
        for (const relatedProfile of scrapedData.relatedProfiles) {
          const relatedUsername = this.extractUsername(relatedProfile.url || relatedProfile);
          if (relatedUsername) {
            const existingRelated = await RelatedProfileScraped.findOne({
              sessionId: session._id,
              username: relatedUsername
            });

            if (!existingRelated) {
              await RelatedProfileScraped.create({
                sessionId: session._id,
                username: relatedUsername,
                profileUrl: `https://www.instagram.com/${relatedUsername}/`,
                depth: 1,
                parentUsername: profile.username,
                parentProfileUrl: profile.profileUrl,
                status: 'pending'
              });
            }
          }
        }
      }

      return profile;

    } catch (error) {
      logger.error(`Failed to scrape profile ${profile.username}:`, error);
      
      // Update profile status to failed
      profile.status = 'failed';
      profile.error = error.message;
      await profile.save();
      
      // Emit error event
      if (socketService.io) {
        socketService.io.to(`session:${session._id.toString()}`).emit('profile:error', {
          username: profile.username,
          error: error.message,
          status: 'failed'
        });
      }
      
      throw error;
    }
  }

  async analyzeProfile(profile, scrapedData, session) {
    try {
      logger.info(`Analyzing profile: ${profile.username}`);
      
      // Emit analysis start event
      if (socketService.io) {
        socketService.io.to(`session:${session._id.toString()}`).emit('profile:analyzing', {
          username: profile.username,
          status: 'analyzing'
        });
      }

      const analysis = profileAnalysisService.performAnalysis(scrapedData);
      
      const analyzedProfile = new AnalyzedRelatedProfile({
        sourceProfileId: profile._id,
        sourceCollection: 'rootprofiles_scraped_datas',
        sessionId: session._id,
        username: profile.username,
        profileUrl: profile.profileUrl,
        depth: 0,
        analysisData: analysis,
        analysisStatus: 'completed'
      });
      
      await analyzedProfile.save();
      await profile.markAsAnalyzed();
      
      logger.info(`Profile analyzed: ${profile.username}`);
      
      // Emit analysis complete event
      if (socketService.io) {
        socketService.io.to(`session:${session._id.toString()}`).emit('profile:analyzed', {
          username: profile.username,
          engagementRate: analysis.metrics?.engagementRate || 0,
          status: 'analyzed'
        });
      }

    } catch (error) {
      logger.error(`Failed to analyze profile ${profile.username}:`, error);
      // Don't throw - analysis failure shouldn't stop the process
    }
  }

  extractUsername(url) {
    if (!url) return null;
    if (typeof url !== 'string') return null;
    
    const match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  // Check if a session is being processed
  isProcessing(sessionId) {
    return this.activeJobs.has(sessionId);
  }

  // Get processing status
  getStatus(sessionId) {
    return this.activeJobs.get(sessionId);
  }
}

module.exports = new DirectScrapingService();