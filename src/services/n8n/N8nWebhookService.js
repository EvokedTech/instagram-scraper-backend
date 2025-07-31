const axios = require('axios');
const logger = require('../../utils/logger');

class N8nWebhookService {
  constructor() {
    this.webhookUrl = process.env.N8N_WEBHOOK_URL || 'https://evoked.app.n8n.cloud/webhook/analysed-data';
    this.retryAttempts = parseInt(process.env.N8N_WEBHOOK_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.N8N_WEBHOOK_RETRY_DELAY) || 5000; //5sseconds
    
    logger.info('N8nWebhookService initialized', {
      webhookUrl: this.webhookUrl,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay
    });
  }

  /**
   * Format profile data for n8n webhook
   * @param {Object} scrapedProfile - The scraped profile data
   * @returns {Object} Formatted profile data
   */

  
  formatProfileData(scrapedProfile) {
    const profileData = scrapedProfile.profileData || {};
    
    // Format the profile data according to n8n requirements
    const formattedData = {
      // Basic profile information
      relatedProfileObjectId :scrapedProfile._id,
      parentUsername: scrapedProfile.parentUsername || '',
      parentProfileUrl: scrapedProfile.parentProfileUrl || '',
      profileUrl: scrapedProfile.profileUrl || '',
      profileId : profileData.id || '',
      username: profileData.username || scrapedProfile.username || '',
      fullName: profileData.fullName || '',
      biography: profileData.biography || '',
      profileUrl: profileData.url || '',
      profilePicUrlHD: profileData.profilePicUrlHD || profileData.profilePicUrlHd || '',
      
      // Account metrics
      followersCount: profileData.followersCount || 0,
      followsCount: profileData.followsCount || 0,
      postsCount: profileData.postsCount || 0,
      
      // Account status
      verified: profileData.verified || false,
      isBusinessAccount: profileData.isBusinessAccount || false,
      isPrivate: profileData.isPrivate || false,
      isProfessionalAccount: profileData.isProfessionalAccount || false,
      
      // Business information
      businessCategoryName: profileData.businessCategoryName || '',
      categoryName: profileData.categoryName || '',
      
      // External URLs
      externalUrls: profileData.externalUrls || [],

            
      // Posts data (formatted without IGTV)
      posts: profileData.latestPosts || [],
      
      // Metadata
      scrapedAt: scrapedProfile.scrapedAt || new Date().toISOString(),
      sessionId: String(scrapedProfile.sessionId || ''),
      depth: scrapedProfile.depth || 1
    };

    // Remove relatedProfiles and igtvVideos as requested
    delete formattedData.relatedProfiles;
    delete formattedData.igtvVideos;
    delete formattedData.IgtvVideos;

    return formattedData;
  }

  /**
   * Send profile data to n8n webhook
   * @param {Object} scrapedProfile - The scraped profile document
   * @returns {Promise<Object>} Response from n8n webhook
   */
  async sendProfileData(scrapedProfile) {
    try {
      const formattedData = this.formatProfileData(scrapedProfile);
      
      // Log the data size for debugging
      const dataSize = JSON.stringify(formattedData).length;
      
      logger.info(`Sending profile data to n8n webhook: ${scrapedProfile.username}`, {
        webhookUrl: this.webhookUrl,
        profileId: scrapedProfile._id,
        username: scrapedProfile.username,
        postsCount: formattedData.posts.length,
        dataSize: dataSize,
        dataSizeKB: (dataSize / 1024).toFixed(2)
      });
      
      // Log sample of the data being sent (first 500 chars)
      logger.debug(`Sample data being sent to n8n:`, {
        sample: JSON.stringify(formattedData).substring(0, 500)
      });

      let lastError;
      for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
        try {
          const response = await axios.post(this.webhookUrl, formattedData, {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Instagram-Analyzer/1.0'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });

          logger.info(`Successfully sent profile data to n8n webhook`, {
            profileId: scrapedProfile._id,
            username: scrapedProfile.username,
            statusCode: response.status,
            attempt: attempt
          });

          // Extract analysis result from response
          const responseData = response.data;
          let analysisResult = {
            status: 'unknown',
            adultContentScore: 0,
            markAsStored: false,
            markAsSkipped: false
          };

          // Handle array response (n8n returns array)
          if (Array.isArray(responseData) && responseData.length > 0) {
            const result = responseData[0];
            analysisResult = {
              status: result.status || 'unknown',
              adultContentScore: parseFloat(result.adultContentScore) || 0,
              markAsStored: result.markAsStored || false,
              markAsSkipped: result.markAsSkipped || false,
              username: result.username || scrapedProfile.username,
              profileUrl: result.profileUrl || scrapedProfile.profileUrl
            };
          } else if (responseData && typeof responseData === 'object') {
            // Handle object response
            analysisResult = {
              status: responseData.status || 'unknown',
              adultContentScore: parseFloat(responseData.adultContentScore) || 0,
              markAsStored: responseData.markAsStored || false,
              markAsSkipped: responseData.markAsSkipped || false,
              username: responseData.username || scrapedProfile.username,
              profileUrl: responseData.profileUrl || scrapedProfile.profileUrl
            };
          }

          logger.info(`Profile analysis result from n8n`, {
            profileId: scrapedProfile._id,
            username: scrapedProfile.username,
            status: analysisResult.status,
            adultContentScore: analysisResult.adultContentScore,
            stored: analysisResult.markAsStored,
            skipped: analysisResult.markAsSkipped
          });

          return {
            success: true,
            statusCode: response.status,
            data: response.data,
            analysisResult: analysisResult,
            attempt: attempt
          };
        } catch (error) {
          lastError = error;
          logger.warn(`Failed to send profile data to n8n webhook (attempt ${attempt}/${this.retryAttempts})`, {
            profileId: scrapedProfile._id,
            username: scrapedProfile.username,
            error: error.message,
            statusCode: error.response?.status,
            responseData: error.response?.data
          });

          if (attempt < this.retryAttempts) {
            await this.delay(this.retryDelay * attempt); // Exponential backoff
          }
        }
      }

      // All retries failed
      throw lastError;
    } catch (error) {
      logger.error(`Failed to send profile data to n8n webhook after all retries`, {
        profileId: scrapedProfile._id,
        username: scrapedProfile.username,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 0
      };
    }
  }

  /**
   * Test webhook connectivity
   * @returns {Promise<Object>} Test result
   */
  async testWebhook() {
    try {
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Testing n8n webhook connectivity'
      };

      const response = await axios.post(this.webhookUrl, testData, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        statusCode: response.status,
        message: 'Webhook is reachable'
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.response?.status || 0,
        message: error.message
      };
    }
  }

  /**
   * Delay helper for retries
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const n8nWebhookService = new N8nWebhookService();

module.exports = n8nWebhookService;