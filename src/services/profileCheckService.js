const axios = require('axios');
const logger = require('../utils/logger');

class ProfileCheckService {
  /**
   * Quick check if Instagram profile is public without using Apify
   * This uses a lightweight approach to check profile status
   */
  async isProfilePublic(username) {
    try {
      // Clean username from URL if needed
      const cleanUsername = username.replace(/.*instagram\.com\//, '').replace(/[\/\?].*/, '').toLowerCase();
      
      // Try to fetch basic profile info using Instagram's public web interface
      // This is a lightweight check that doesn't cost Apify credits
      const url = `https://www.instagram.com/${cleanUsername}/?__a=1&__d=dis`;
      
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 5000,
          validateStatus: function (status) {
            return status < 500; // Accept any status code less than 500
          }
        });

        // If we get a 404, profile doesn't exist
        if (response.status === 404) {
          logger.info(`Profile ${cleanUsername} does not exist`);
          return { exists: false, isPublic: false, username: cleanUsername };
        }

        // Try to parse response
        if (response.data) {
          // Check if profile is private in the response
          const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          
          // Look for indicators that profile is private
          const isPrivate = responseText.includes('"is_private":true') || 
                           responseText.includes('This account is private') ||
                           responseText.includes('This Account is Private');
          
          if (isPrivate) {
            logger.info(`Profile ${cleanUsername} is private`);
            return { exists: true, isPublic: false, username: cleanUsername };
          }
        }

        // If we get here and status is 200, assume it's public
        if (response.status === 200) {
          logger.info(`Profile ${cleanUsername} is public`);
          return { exists: true, isPublic: true, username: cleanUsername };
        }

      } catch (error) {
        // If Instagram blocks the request, fall back to assuming public
        // to avoid blocking legitimate profiles
        logger.warn(`Could not verify profile ${cleanUsername} status, assuming public: ${error.message}`);
        return { exists: true, isPublic: true, username: cleanUsername };
      }

      // Default to public if we can't determine
      return { exists: true, isPublic: true, username: cleanUsername };

    } catch (error) {
      logger.error(`Error checking profile status for ${username}:`, error);
      // In case of error, assume public to not block processing
      return { exists: true, isPublic: true, username };
    }
  }

  /**
   * Check multiple profiles at once
   */
  async checkMultipleProfiles(profiles) {
    const results = {
      public: [],
      private: [],
      notFound: []
    };

    for (const profile of profiles) {
      const check = await this.isProfilePublic(profile);
      
      if (!check.exists) {
        results.notFound.push(check.username);
      } else if (check.isPublic) {
        results.public.push(check.username);
      } else {
        results.private.push(check.username);
      }

      // Add small delay between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

module.exports = new ProfileCheckService();