const apifyService = require('../services/apifyService');
const logger = require('../utils/logger');

const apifyController = {
  // Scrape a single Instagram profile using Apify
  async scrapeProfile(req, res, next) {
    try {
      const { username } = req.params;
      const { sessionId } = req.body;
      
      if (!username) {
        return res.status(400).json({
          success: false,
          error: 'Username is required'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      logger.info(`Received request to scrape profile via Apify: ${username}`);
      
      // Construct the profile URL
      const profileUrl = `https://www.instagram.com/${username}`;
      
      // Use Apify service to scrape (as root profile with sessionId)
      const profile = await apifyService.scrapeProfile(profileUrl, true, sessionId);
      
      res.status(200).json({
        success: true,
        data: profile,
        message: `Successfully scraped profile: ${username}`
      });
    } catch (error) {
      logger.error(`Error in apifyController.scrapeProfile: ${error.message}`, { error });
      next(error);
    }
  },

  // Scrape multiple profiles
  async scrapeMultipleProfiles(req, res, next) {
    try {
      const { profiles, sessionId } = req.body;
      
      if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Profiles array is required'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      logger.info(`Received request to scrape ${profiles.length} profiles via Apify`);
      
      // Convert usernames to URLs
      const profileUrls = profiles.map(p => {
        if (p.startsWith('http')) return p;
        return `https://www.instagram.com/${p}/`;
      });
      
      // Use Apify service to scrape multiple profiles
      const results = await apifyService.scrapeMultipleProfiles(profileUrls, true, sessionId);
      
      res.status(200).json({
        success: true,
        data: results,
        message: `Processed ${profiles.length} profiles`
      });
    } catch (error) {
      logger.error(`Error in apifyController.scrapeMultipleProfiles: ${error.message}`, { error });
      next(error);
    }
  }
};

module.exports = apifyController;