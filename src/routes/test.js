const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const profileAnalysisService = require('../services/profileAnalysisService');
const RootProfileScraped = require('../models/RootProfileScraped');
const AnalyzedRelatedProfile = require('../models/AnalyzedRelatedProfile');
const logger = require('../utils/logger');

// Test endpoint for direct scraping without queue
router.post('/scrape-direct', async (req, res) => {
  try {
    const { profileUrl, analyzeProfile = false } = req.body;
    
    // Normalize the URL
    let normalizedUrl = profileUrl.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    if (!normalizedUrl.endsWith('/')) {
      normalizedUrl += '/';
    }
    
    // Extract username from URL
    const usernameMatch = normalizedUrl.match(/instagram\.com\/([^\/]+)/);
    if (!usernameMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram profile URL'
      });
    }
    
    const username = usernameMatch[1].toLowerCase();
    
    logger.info(`Direct scraping test for profile: ${username}`);
    
    // Direct Apify call without using the service wrapper
    const startTime = Date.now();
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    const input = {
      directUrls: [normalizedUrl],
      resultsLimit: 50,
      resultsType: 'details',
      searchLimit: 200,
      searchType: 'user',
      addParentData: false,
      enhanceUserSearchWithFacebookPage: false,
      isUserReelFeedURL: false,
      isUserTaggedFeedURL: false
    };
    
    logger.info('Calling Apify actor...');
    const run = await client.actor(actorId).call(input);
    
    logger.info('Fetching results...');
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      throw new Error('No data received from Apify');
    }
    
    const scrapedData = items[0];
    const scrapingTime = Date.now() - startTime;
    
    logger.info(`Successfully scraped ${username} in ${scrapingTime}ms`);
    
    // Create a temporary profile object for analysis
    const profileData = {
      username: scrapedData.username || username,
      profileUrl: normalizedUrl,
      profileData: scrapedData,
      metadata: {
        scrapedAt: new Date(),
        apifyRunId: run.id
      }
    };
    
    let analysisResult = null;
    
    // Analyze if requested
    if (analyzeProfile) {
      logger.info(`Analyzing profile ${username}`);
      const analysisStartTime = Date.now();
      
      // Perform analysis using the service
      const analysis = profileAnalysisService.performAnalysis(scrapedData);
      const analysisTime = Date.now() - analysisStartTime;
      
      analysisResult = {
        ...analysis,
        analysisTime: `${analysisTime}ms`
      };
      
      logger.info(`Analysis completed for ${username} in ${analysisTime}ms`);
    }
    
    // Return the results
    res.json({
      success: true,
      data: {
        profile: {
          username: scrapedData.username || username,
          url: normalizedUrl,
          fullName: scrapedData.fullName || scrapedData.full_name || '',
          biography: scrapedData.biography || scrapedData.bio || '',
          profilePicUrl: scrapedData.profilePicUrl || scrapedData.profile_pic_url || '',
          isVerified: scrapedData.isVerified || scrapedData.is_verified || false,
          isPrivate: scrapedData.isPrivate || scrapedData.is_private || false,
          postsCount: scrapedData.postsCount || scrapedData.media_count || 0,
          followersCount: scrapedData.followersCount || scrapedData.follower_count || 0,
          followingCount: scrapedData.followingCount || scrapedData.following_count || 0,
          externalUrl: scrapedData.externalUrl || scrapedData.external_url || '',
          businessCategoryName: scrapedData.businessCategoryName || scrapedData.business_category_name || '',
          relatedProfiles: scrapedData.relatedProfiles || [],
          latestPosts: scrapedData.latestPosts || []
        },
        analysis: analysisResult,
        metadata: {
          scrapingTime: `${scrapingTime}ms`,
          totalTime: `${Date.now() - startTime}ms`,
          relatedProfilesCount: scrapedData.relatedProfiles?.length || 0,
          postsCount: scrapedData.latestPosts?.length || 0
        }
      }
    });
    
  } catch (error) {
    logger.error('Direct scraping test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to scrape profile'
    });
  }
});

// Test endpoint to scrape and update existing profile in database
router.post('/scrape-and-update/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { profileUrl } = req.body;
    
    // Find the profile in database
    const profile = await RootProfileScraped.findOne({ 
      sessionId,
      profileUrl 
    });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found in session'
      });
    }
    
    logger.info(`Scraping and updating profile: ${profile.username}`);
    
    // Direct Apify call
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    
    const actorId = 'shu8hvrXbJbY3Eb9W';
    const input = {
      directUrls: [profileUrl],
      resultsLimit: 50,
      resultsType: 'details',
      searchLimit: 200,
      searchType: 'user'
    };
    
    const run = await client.actor(actorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      throw new Error('No data received from Apify');
    }
    
    const scrapedData = items[0];
    
    // Update the profile with scraped data
    await profile.markAsScraped(scrapedData, {
      apifyRunId: run.id,
      processingTime: 0
    });
    
    logger.info(`Successfully updated profile: ${profile.username}`);
    
    // If analyzeRootProfiles is enabled, analyze it
    const session = await require('../models/Session').findById(sessionId);
    if (session?.config?.analyzeRootProfiles) {
      const analysis = profileAnalysisService.performAnalysis(scrapedData);
      
      const analyzedProfile = new AnalyzedRelatedProfile({
        sourceProfileId: profile._id,
        sourceCollection: 'rootprofiles_scraped_datas',
        sessionId: sessionId,
        username: profile.username,
        profileUrl: profile.profileUrl,
        depth: 0,
        analysisData: analysis,
        analysisStatus: 'completed'
      });
      
      await analyzedProfile.save();
      logger.info(`Profile analyzed and saved: ${profile.username}`);
    }
    
    // Reload the profile to get updated data
    const updatedProfile = await RootProfileScraped.findById(profile._id);
    
    res.json({
      success: true,
      data: updatedProfile,
      message: `Profile ${profile.username} scraped and updated successfully`
    });
    
  } catch (error) {
    logger.error('Scrape and update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint to check if a profile exists in database
router.get('/check-profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const rootProfile = await RootProfileScraped.findOne({ 
      username: username.toLowerCase() 
    }).select('username status scrapedAt analyzedAt');
    
    const analyzedProfile = await AnalyzedRelatedProfile.findOne({
      username: username.toLowerCase()
    }).select('username analysisStatus analyzedAt');
    
    res.json({
      success: true,
      data: {
        exists: !!(rootProfile || analyzedProfile),
        rootProfile: rootProfile ? {
          username: rootProfile.username,
          status: rootProfile.status,
          scrapedAt: rootProfile.scrapedAt,
          analyzedAt: rootProfile.analyzedAt
        } : null,
        analyzedProfile: analyzedProfile ? {
          username: analyzedProfile.username,
          status: analyzedProfile.analysisStatus,
          analyzedAt: analyzedProfile.analyzedAt
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;