const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const cloudflareConfig = require('../config/cloudflare');

class CloudflareR2Service {
  constructor() {
    this.client = null;
    this.uploadCache = new Map();
    this.initializeClient();
  }

  initializeClient() {
    try {
      // Check if Cloudflare is configured
      if (!cloudflareConfig.isConfigured()) {
        logger.warn('Cloudflare R2 is not configured. Service will be disabled.');
        this.client = null;
        return;
      }
      
      // Validate and trim credentials
      const accessKeyId = cloudflareConfig.accessKeyId?.trim();
      const secretAccessKey = cloudflareConfig.secretAccessKey?.trim();
      
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('Missing or invalid Cloudflare R2 credentials');
      }
      
      this.client = new S3Client({
        region: 'auto',
        endpoint: cloudflareConfig.endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey
        },
        forcePathStyle: true,
        signatureVersion: 'v4'
      });
      logger.info('Cloudflare R2 client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Cloudflare R2 client:', error);
      this.client = null;
      // Don't throw error here, let it fail when actually trying to use the service
    }
  }

  /**
   * Generate a unique key for the image based on URL
   * @param {string} imageUrl - Original image URL
   * @param {string} username - Instagram username
   * @returns {string} - Unique key for R2 storage
   */
  generateImageKey(imageUrl, username) {
    const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const timestamp = Date.now();
    const extension = this.getFileExtension(imageUrl) || 'jpg';
    return `instagram-profiles/${username}/${urlHash}_${timestamp}.${extension}`;
  }

  /**
   * Extract file extension from URL
   * @param {string} url - Image URL
   * @returns {string|null} - File extension
   */
  getFileExtension(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      return match ? match[1].toLowerCase() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Download image from URL
   * @param {string} imageUrl - URL to download from
   * @returns {Promise<Buffer>} - Image buffer
   */
  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: cloudflareConfig.performance.requestTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxContentLength: cloudflareConfig.image.maxFileSize,
        maxBodyLength: cloudflareConfig.image.maxFileSize
      });

      const buffer = Buffer.from(response.data);
      
      if (buffer.length > cloudflareConfig.image.maxFileSize) {
        throw new Error(`Image size ${buffer.length} exceeds maximum allowed size`);
      }

      return buffer;
    } catch (error) {
      logger.error(`Failed to download image from ${imageUrl}:`, {
        error: error.message || error,
        code: error.code,
        response: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Check if object already exists in R2
   * @param {string} key - Object key
   * @returns {Promise<boolean>} - True if exists
   */
  async objectExists(key) {
    if (!this.client) {
      logger.warn('Cloudflare R2 client not initialized, skipping object existence check');
      return false;
    }
    
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: cloudflareConfig.bucketName,
        Key: key
      }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Upload image to Cloudflare R2
   * @param {Buffer} imageBuffer - Image data
   * @param {string} key - Storage key
   * @param {string} contentType - MIME type
   * @returns {Promise<string>} - Public CDN URL
   */
  async uploadToR2(imageBuffer, key, contentType = 'image/jpeg') {
    if (!this.client) {
      throw new Error('Cloudflare R2 is not configured. Please set the required environment variables.');
    }
    
    try {
      const command = new PutObjectCommand({
        Bucket: cloudflareConfig.bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000', // 1 year cache
        Metadata: {
          source: 'instagram-scraper',
          uploadedAt: new Date().toISOString()
        }
      });

      await this.client.send(command);
      
      // Generate public URL
      const publicUrl = `${cloudflareConfig.publicUrl}/${key}`;
      logger.info(`Successfully uploaded image to R2: ${publicUrl}`);
      
      return publicUrl;
    } catch (error) {
      logger.error(`Failed to upload to R2:`, {
        error: error.message || error,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        bucket: cloudflareConfig.bucketName,
        key: key
      });
      throw error;
    }
  }

  /**
   * Process and upload Instagram profile image to CDN
   * @param {string} imageUrl - Instagram image URL
   * @param {string} username - Instagram username
   * @returns {Promise<string>} - CDN URL or original URL on failure
   */
  async processProfileImage(imageUrl, username) {
    if (!imageUrl || !username) {
      logger.warn('Missing imageUrl or username for CDN processing');
      return imageUrl;
    }

    // Check if Cloudflare R2 is configured
    if (!this.client) {
      logger.debug('Cloudflare R2 not configured, returning original URL');
      return imageUrl;
    }

    // Check cache first
    const cacheKey = `${username}:${imageUrl}`;
    if (this.uploadCache.has(cacheKey)) {
      logger.info(`Using cached CDN URL for ${username}`);
      return this.uploadCache.get(cacheKey);
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < cloudflareConfig.retry.maxAttempts) {
      try {
        attempt++;
        logger.info(`Processing image for ${username} (attempt ${attempt}/${cloudflareConfig.retry.maxAttempts})`);

        // Generate unique key
        const key = this.generateImageKey(imageUrl, username);

        // Check if already exists in R2
        const exists = await this.objectExists(key);
        if (exists) {
          const cdnUrl = `${cloudflareConfig.publicUrl}/${key}`;
          this.uploadCache.set(cacheKey, cdnUrl);
          logger.info(`Image already exists in R2: ${cdnUrl}`);
          return cdnUrl;
        }

        // Download image
        const imageBuffer = await this.downloadImage(imageUrl);

        // Detect content type
        const contentType = this.detectContentType(imageBuffer);

        // Upload to R2
        const cdnUrl = await this.uploadToR2(imageBuffer, key, contentType);

        // Cache the result
        this.uploadCache.set(cacheKey, cdnUrl);

        return cdnUrl;

      } catch (error) {
        lastError = error;
        logger.error(`Attempt ${attempt} failed for ${username}:`, {
          error: error.message || error,
          stack: error.stack,
          code: error.code,
          statusCode: error.$metadata?.httpStatusCode,
          requestId: error.$metadata?.requestId
        });

        if (attempt < cloudflareConfig.retry.maxAttempts) {
          const delay = Math.min(
            cloudflareConfig.retry.initialDelay * Math.pow(cloudflareConfig.retry.backoffMultiplier, attempt - 1),
            cloudflareConfig.retry.maxDelay
          );
          logger.info(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    // All attempts failed, return original URL
    logger.error(`All CDN upload attempts failed for ${username}, using original URL`);
    return imageUrl;
  }

  /**
   * Detect content type from buffer
   * @param {Buffer} buffer - Image buffer
   * @returns {string} - MIME type
   */
  detectContentType(buffer) {
    const signatures = {
      'ffd8ff': 'image/jpeg',
      '89504e47': 'image/png',
      '52494646': 'image/webp'
    };

    const hex = buffer.toString('hex', 0, 4);
    
    for (const [signature, mimeType] of Object.entries(signatures)) {
      if (hex.startsWith(signature)) {
        return mimeType;
      }
    }

    return 'image/jpeg'; // Default
  }

  /**
   * Batch process multiple images
   * @param {Array<{url: string, username: string}>} images - Array of images to process
   * @returns {Promise<Map<string, string>>} - Map of original URL to CDN URL
   */
  async batchProcessImages(images) {
    const results = new Map();
    const chunks = this.chunkArray(images, cloudflareConfig.performance.maxConcurrentUploads);

    for (const chunk of chunks) {
      const promises = chunk.map(async ({ url, username }) => {
        try {
          const cdnUrl = await this.processProfileImage(url, username);
          results.set(url, cdnUrl);
        } catch (error) {
          logger.error(`Failed to process image for ${username}:`, error);
          results.set(url, url); // Fallback to original
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} - Array of chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear upload cache
   */
  clearCache() {
    this.uploadCache.clear();
    logger.info('Cloudflare R2 upload cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      size: this.uploadCache.size,
      entries: Array.from(this.uploadCache.entries()).map(([key, value]) => ({
        key,
        value,
        username: key.split(':')[0]
      }))
    };
  }
}

// Export singleton instance
module.exports = new CloudflareR2Service();