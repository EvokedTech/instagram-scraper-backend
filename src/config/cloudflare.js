const logger = require('../utils/logger');

// Cloudflare R2 Configuration
const cloudflareConfig = {
  // R2 Credentials
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
  publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
  
  // R2 Endpoint (using S3 compatible API)
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  
  // Image processing settings
  image: {
    maxFileSize: 10 * 1024 * 1024, // 10MB max file size
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    quality: 85, // JPEG quality for compression
    enableCompression: true
  },
  
  // Retry settings
  retry: {
    maxAttempts: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2
  },
  
  // Cache settings
  cache: {
    ttl: 86400, // 24 hours in seconds
    checkInterval: 3600 // Check every hour
  },
  
  // Performance settings
  performance: {
    maxConcurrentUploads: 5,
    requestTimeout: 30000 // 30 seconds
  }
};

// Validate configuration
const validateConfig = () => {
  const required = [
    'accountId',
    'accessKeyId',
    'secretAccessKey',
    'bucketName',
    'publicUrl'
  ];
  
  const missing = required.filter(key => !cloudflareConfig[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required Cloudflare configuration:', missing);
    throw new Error(`Missing Cloudflare configuration: ${missing.join(', ')}`);
  }
  
  logger.info('Cloudflare configuration validated successfully');
};

// Check if Cloudflare is configured
cloudflareConfig.isConfigured = () => {
  const required = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName', 'publicUrl'];
  return required.every(key => cloudflareConfig[key]);
};

// Export validation function for use when needed
cloudflareConfig.validate = validateConfig;

// Log configuration status on module load
if (!cloudflareConfig.isConfigured()) {
  logger.warn('Cloudflare R2 configuration is incomplete. CDN features will be disabled until properly configured.');
} else {
  logger.info('Cloudflare R2 configuration detected');
}

module.exports = cloudflareConfig;