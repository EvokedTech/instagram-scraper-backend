const logger = require('../utils/logger');
const cloudflareR2Service = require('./cloudflareR2Service');

class ImageCdnService {
  constructor() {
    this.isEnabled = this.checkIfEnabled();
    this.processedCount = 0;
    this.failedCount = 0;
  }

  /**
   * Check if CDN conversion is enabled
   * @returns {boolean}
   */
  checkIfEnabled() {
    const required = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      'CLOUDFLARE_R2_BUCKET_NAME',
      'CLOUDFLARE_R2_PUBLIC_URL'
    ];

    const hasAllConfig = required.every(key => process.env[key]);
    
    if (!hasAllConfig) {
      logger.warn('Cloudflare CDN conversion disabled - missing configuration');
      return false;
    }

    logger.info('Cloudflare CDN conversion enabled');
    return true;
  }

  /**
   * Process profile data to convert images to CDN URLs
   * @param {Object} profileData - Instagram profile data from Apify
   * @param {string} username - Instagram username
   * @returns {Promise<Object>} - Profile data with CDN URLs
   */
  async processProfileImages(profileData, username) {
    if (!this.isEnabled) {
      return profileData;
    }

    if (!profileData || !username) {
      logger.warn('Missing profileData or username for CDN processing');
      return profileData;
    }

    try {
      // Create a copy to avoid mutating original data
      const processedData = JSON.parse(JSON.stringify(profileData));
      
      // Track which URLs need processing
      const imagesToProcess = [];

      // Collect profile picture URLs
      if (processedData.profilePicUrl) {
        imagesToProcess.push({
          field: 'profilePicUrl',
          url: processedData.profilePicUrl,
          username
        });
      }

      if (processedData.profilePicUrlHD) {
        imagesToProcess.push({
          field: 'profilePicUrlHD',
          url: processedData.profilePicUrlHD,
          username
        });
      }

      if (imagesToProcess.length === 0) {
        logger.info(`No profile images to process for ${username}`);
        return processedData;
      }

      logger.info(`Processing ${imagesToProcess.length} images for ${username}`);

      // Process images in parallel
      const processingPromises = imagesToProcess.map(async ({ field, url, username }) => {
        try {
          const cdnUrl = await cloudflareR2Service.processProfileImage(url, username);
          return { field, cdnUrl, success: true };
        } catch (error) {
          logger.error(`Failed to process ${field} for ${username}:`, error);
          return { field, cdnUrl: url, success: false }; // Fallback to original
        }
      });

      const results = await Promise.all(processingPromises);

      // Update profile data with CDN URLs
      results.forEach(({ field, cdnUrl, success }) => {
        processedData[field] = cdnUrl;
        if (success) {
          this.processedCount++;
          logger.info(`Successfully converted ${field} to CDN for ${username}`);
        } else {
          this.failedCount++;
        }
      });

      // Add CDN metadata
      processedData._cdnProcessed = {
        processed: true,
        timestamp: new Date().toISOString(),
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length
      };

      return processedData;

    } catch (error) {
      logger.error(`Error processing profile images for ${username}:`, error);
      this.failedCount++;
      return profileData; // Return original data on error
    }
  }

  /**
   * Process images in posts
   * @param {Array} posts - Array of posts
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} - Posts with CDN URLs
   */
  async processPostImages(posts, username) {
    if (!this.isEnabled || !posts || !Array.isArray(posts)) {
      return posts;
    }

    try {
      const processedPosts = await Promise.all(posts.map(async (post) => {
        const processedPost = { ...post };

        // Process display URL
        if (post.displayUrl) {
          try {
            processedPost.displayUrl = await cloudflareR2Service.processProfileImage(
              post.displayUrl,
              `${username}_posts`
            );
          } catch (error) {
            logger.error(`Failed to process post displayUrl:`, error);
          }
        }

        // Process images array
        if (post.images && Array.isArray(post.images)) {
          processedPost.images = await Promise.all(
            post.images.map(async (imageUrl) => {
              try {
                return await cloudflareR2Service.processProfileImage(
                  imageUrl,
                  `${username}_posts`
                );
              } catch (error) {
                return imageUrl; // Fallback to original
              }
            })
          );
        }

        // Process child posts for carousels
        if (post.childPosts && Array.isArray(post.childPosts)) {
          processedPost.childPosts = await this.processPostImages(
            post.childPosts,
            username
          );
        }

        return processedPost;
      }));

      return processedPosts;
    } catch (error) {
      logger.error(`Error processing post images for ${username}:`, error);
      return posts; // Return original posts on error
    }
  }

  /**
   * Process complete profile data including posts
   * @param {Object} completeProfileData - Complete profile data
   * @param {string} username - Instagram username
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processed profile data
   */
  async processCompleteProfile(completeProfileData, username, options = {}) {
    if (!this.isEnabled) {
      return completeProfileData;
    }

    const { 
      includePostImages = false, // Set to true to also process post images
      includeIgtvImages = false  // Set to true to also process IGTV images
    } = options;

    try {
      logger.info(`Starting CDN processing for ${username}`);
      const startTime = Date.now();

      // Process profile images
      let processedData = await this.processProfileImages(completeProfileData, username);

      // Optionally process post images
      if (includePostImages && processedData.latestPosts) {
        logger.info(`Processing ${processedData.latestPosts.length} posts for ${username}`);
        processedData.latestPosts = await this.processPostImages(
          processedData.latestPosts,
          username
        );
      }

      // Optionally process IGTV images
      if (includeIgtvImages && processedData.latestIgtvVideos) {
        logger.info(`Processing ${processedData.latestIgtvVideos.length} IGTV videos for ${username}`);
        processedData.latestIgtvVideos = await this.processPostImages(
          processedData.latestIgtvVideos,
          username
        );
      }

      const processingTime = Date.now() - startTime;
      logger.info(`CDN processing completed for ${username} in ${processingTime}ms`);

      // Add processing metadata
      if (processedData._cdnProcessed) {
        processedData._cdnProcessed.processingTime = processingTime;
        processedData._cdnProcessed.options = options;
      }

      return processedData;

    } catch (error) {
      logger.error(`Failed to process complete profile for ${username}:`, error);
      return completeProfileData; // Return original data on error
    }
  }

  /**
   * Get service statistics
   * @returns {Object} - Service stats
   */
  getStats() {
    return {
      enabled: this.isEnabled,
      processed: this.processedCount,
      failed: this.failedCount,
      successRate: this.processedCount > 0 
        ? ((this.processedCount / (this.processedCount + this.failedCount)) * 100).toFixed(2) + '%'
        : '0%',
      cacheStats: cloudflareR2Service.getCacheStats()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.processedCount = 0;
    this.failedCount = 0;
    logger.info('Image CDN service statistics reset');
  }

  /**
   * Clear all caches
   */
  clearCache() {
    cloudflareR2Service.clearCache();
    logger.info('Image CDN service cache cleared');
  }
}

// Export singleton instance
module.exports = new ImageCdnService();