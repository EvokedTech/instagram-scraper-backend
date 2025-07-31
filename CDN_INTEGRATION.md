# Cloudflare CDN Integration for Instagram Profile Images

## Overview

This integration automatically converts Instagram profile images to Cloudflare R2 CDN URLs before storing them in MongoDB. This provides better performance, reliability, and reduces dependency on Instagram's CDN.

## Features

- ✅ Automatic image download from Instagram URLs
- ✅ Upload to Cloudflare R2 storage
- ✅ CDN URL generation and storage
- ✅ Fallback to original URLs on failure
- ✅ Retry logic with exponential backoff
- ✅ In-memory caching for performance
- ✅ Comprehensive error handling
- ✅ Integration with existing MongoDB models

## Configuration

Add the following environment variables to your `.env` file:

```env
# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_access_key
CLOUDFLARE_R2_BUCKET_NAME=your_bucket_name
CLOUDFLARE_R2_PUBLIC_URL=https://your-public-url.r2.dev
```

## Architecture

### Components

1. **cloudflareR2Service.js** - Handles R2 storage operations
   - S3-compatible API client
   - Image download functionality
   - R2 upload with retry logic
   - URL generation

2. **imageCdnService.js** - Orchestrates CDN conversion
   - Profile image processing
   - Post image processing (optional)
   - Batch operations
   - Service statistics

3. **Model Integration** - Automatic CDN conversion
   - RootProfileScraped model
   - RelatedProfileScraped model
   - Transparent integration via `markAsScraped()` method

## How It Works

1. When profile data is saved via `markAsScraped()`:
   - The model automatically calls the CDN service
   - Profile images are downloaded from Instagram
   - Images are uploaded to Cloudflare R2
   - CDN URLs replace the original Instagram URLs
   - Data is saved to MongoDB with CDN URLs

2. If CDN conversion fails:
   - Original Instagram URLs are preserved
   - Error is logged but doesn't block saving
   - Service continues normally

## Usage

### Basic Usage (Automatic)

The CDN conversion happens automatically when using the existing workflow:

```javascript
// This automatically triggers CDN conversion
await profile.markAsScraped(apifyResponse, {
  apifyRunId: 'abc123',
  processingTime: 5.2
});
```

### Manual Usage

```javascript
const imageCdnService = require('./services/imageCdnService');

// Process profile images only
const processedData = await imageCdnService.processProfileImages(
  profileData,
  'username'
);

// Process complete profile including posts
const completeData = await imageCdnService.processCompleteProfile(
  profileData,
  'username',
  {
    includePostImages: true,  // Process post images
    includeIgtvImages: true   // Process IGTV thumbnails
  }
);
```

### Direct R2 Operations

```javascript
const cloudflareR2Service = require('./services/cloudflareR2Service');

// Process single image
const cdnUrl = await cloudflareR2Service.processProfileImage(
  'https://instagram.com/image.jpg',
  'username'
);

// Batch process images
const results = await cloudflareR2Service.batchProcessImages([
  { url: 'https://instagram.com/img1.jpg', username: 'user1' },
  { url: 'https://instagram.com/img2.jpg', username: 'user2' }
]);
```

## Testing

Run the integration test:

```bash
cd backend
node src/scripts/testCdnIntegration.js
```

## Performance Considerations

1. **Caching** - Processed URLs are cached in memory to avoid redundant uploads
2. **Batch Processing** - Multiple images processed concurrently (max 5)
3. **Retry Logic** - Failed uploads retry with exponential backoff
4. **Fallback** - Original URLs preserved if CDN upload fails

## Storage Structure

Images are stored in R2 with the following structure:

```
instagram-profiles/
├── username1/
│   ├── {hash}_timestamp.jpg  (profile pictures)
│   └── ...
├── username2/
│   └── ...
└── username_posts/
    ├── {hash}_timestamp.jpg  (post images)
    └── ...
```

## Monitoring

### Service Statistics

```javascript
const stats = imageCdnService.getStats();
console.log(stats);
// {
//   enabled: true,
//   processed: 150,
//   failed: 5,
//   successRate: '96.77%',
//   cacheStats: { size: 50, entries: [...] }
// }
```

### Logs

The service logs all operations:
- Successful uploads
- Failed uploads with reasons
- Retry attempts
- Cache hits

## Troubleshooting

### CDN Service Disabled

If you see "CDN service is disabled":
1. Check all Cloudflare environment variables are set
2. Verify credentials are correct
3. Ensure bucket exists and is accessible

### Upload Failures

Common causes:
1. Invalid Instagram URLs
2. Network connectivity issues
3. R2 bucket permissions
4. Rate limiting

### Debugging

Enable debug logging:
```javascript
// In cloudflareR2Service.js
logger.level = 'debug';
```

## Best Practices

1. **Enable CDN for Production** - Better performance and reliability
2. **Monitor Statistics** - Track success rates and failures
3. **Clear Cache Periodically** - Prevent memory bloat
4. **Handle Failures Gracefully** - System continues with original URLs

## Future Enhancements

- [ ] Image optimization/compression
- [ ] WebP format conversion
- [ ] Thumbnail generation
- [ ] Batch processing optimization
- [ ] CDN cache purging
- [ ] Webhook notifications for failures