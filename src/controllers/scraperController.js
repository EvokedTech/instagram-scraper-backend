const scraperService = require('../services/scraperService');
const apifyService = require('../services/apifyService');
const Profile = require('../models/Profile');
const logger = require('../utils/logger');

const scraperController = {
  // Scrape a single Instagram profile
  async scrapeProfile(req, res, next) {
    try {
      const { username } = req.params;
      const { sessionId, useApify = true } = req.body; // Default to using Apify
      
      if (!username) {
        return res.status(400).json({
          success: false,
          error: 'Username is required'
        });
      }

      logger.info(`Received request to scrape profile: ${username} (using ${useApify ? 'Apify' : 'Puppeteer'})`);
      
      let profile;
      
      if (useApify && sessionId) {
        // Use Apify service if sessionId is provided
        const profileUrl = `https://www.instagram.com/${username}`;
        profile = await apifyService.scrapeProfile(profileUrl, true, sessionId);
      } else {
        // Fall back to Puppeteer scraper
        profile = await scraperService.scrapeProfile(username);
      }
      
      res.status(200).json({
        success: true,
        data: profile,
        message: `Successfully scraped profile: ${username}`
      });
    } catch (error) {
      next(error);
    }
  },

  // Get profile from database
  async getProfile(req, res, next) {
    try {
      const { username } = req.params;
      
      const profile = await Profile.findByUsername(username);
      
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all profiles
  async getAllProfiles(req, res, next) {
    try {
      const { limit = 20, offset = 0 } = req.query;
      
      const profiles = await Profile.find()
        .sort({ lastScraped: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .select('-posts -scrapingHistory');
      
      const total = await Profile.countDocuments();
      
      res.status(200).json({
        success: true,
        data: profiles,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recently scraped profiles
  async getRecentlyScraped(req, res, next) {
    try {
      const { limit = 10 } = req.query;
      
      const profiles = await Profile.getRecentlyScraped(parseInt(limit));
      
      res.status(200).json({
        success: true,
        data: profiles
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = scraperController;