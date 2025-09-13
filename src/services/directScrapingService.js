const { ApifyClient } = require('apify-client');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const AnalyzedRelatedProfile = require('../models/AnalyzedRelatedProfile');
const Session = require('../models/Session');
const profileAnalysisService = require('./profileAnalysisService');
const profileCheckService = require('./profileCheckService');
const socketService = require('./socketService');
const logger = require('../utils/logger');
const cloudflareR2Service = require('./cloudflareR2Service');
const axios = require('axios');

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
      
      // Convert profile pictures to Cloudflare CDN immediately
      try {
        if (scrapedData.profilePicUrl) {
          logger.info(`  📸 Converting profile pic for ${profile.username} to Cloudflare CDN...`);
          scrapedData.profilePicUrl = await cloudflareR2Service.processProfileImage(
            scrapedData.profilePicUrl, 
            profile.username
          );
        }
        
        if (scrapedData.profilePicUrlHD) {
          logger.info(`  📸 Converting HD profile pic for ${profile.username} to Cloudflare CDN...`);
          scrapedData.profilePicUrlHD = await cloudflareR2Service.processProfileImage(
            scrapedData.profilePicUrlHD, 
            profile.username
          );
        }
        
        logger.info(`  ✅ Profile pics converted to Cloudflare CDN for ${profile.username}`);
      } catch (cdnError) {
        logger.warn(`  ⚠️ Failed to convert profile pics to CDN for ${profile.username}: ${cdnError.message}`);
        // Continue with original URLs if CDN conversion fails
      }

      // Update profile with scraped data
      await profile.markAsScraped(scrapedData, {
        apifyRunId: run.id,
        processingTime: 0
      });

      logger.info(`Successfully scraped profile: ${profile.username}`);
      
      // CRITICAL: Add delay to ensure data is fully saved before triggering webhook
      // This prevents race condition where webhook sees incomplete data
      setTimeout(() => {
        logger.info(`⏰ Triggering delayed webhook for ${profile.username} (ensuring data is saved)`);
        this.triggerAnalysisWebhook(profile.username).catch(err => {
          logger.warn(`Failed to trigger analysis for ${profile.username}: ${err.message}`);
        });
      }, 3000); // 3 second delay to ensure database write is complete
      
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

  /**
   * Trigger analysis webhook to analyze the scraped profile
   */
  async triggerAnalysisWebhook(username) {
    const maxRetries = 3;
    let retryCount = 0;
    
    // Get analysis backend URL from environment or use default
    let analysisBackendUrl = process.env.ANALYSIS_BACKEND_URL || 'http://localhost:5001';
    
    // CRITICAL: Remove trailing slash to prevent double slashes in URL
    analysisBackendUrl = analysisBackendUrl.replace(/\/$/, '');
    
    // Log the URL being used (important for debugging production issues)
    if (!process.env.ANALYSIS_BACKEND_URL) {
      logger.warn(`⚠️ ANALYSIS_BACKEND_URL not set, using default: ${analysisBackendUrl}`);
      logger.warn('This will fail in production! Set ANALYSIS_BACKEND_URL environment variable.');
    } else {
      logger.info(`📍 Using analysis backend URL: ${analysisBackendUrl}`);
    }
    
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

module.exports = new DirectScrapingService();