# Recursive Depth Processing

## Overview

The recursive depth processing system automatically processes Instagram profiles at multiple depth levels, extracting and scraping related profiles at each level until the configured maximum depth is reached.

## Features

- **Automatic Depth Progression**: Processes profiles level by level (depth 1, 2, 3, etc.)
- **Configurable Limits**: Control max depth and profiles per depth
- **Real-time Progress Tracking**: Monitor current depth and progress
- **Database Deduplication**: Prevents re-scraping across all depths
- **Graceful Error Handling**: Failed profiles don't stop the process
- **Session Statistics**: Track profiles at each depth level

## Architecture

### Processing Flow

1. **Root Profiles (Depth 0)**: Initial profiles scraped
2. **Extract Related (Depth 1)**: Related profiles from root profiles
3. **Process Depth 1**: Scrape all depth 1 profiles
4. **Extract Related (Depth 2)**: Related profiles from depth 1
5. **Continue**: Process continues until maxDepth is reached

### Services

- **DepthProcessingService**: Coordinates recursive depth processing
- **RelatedProfilesService**: Extracts and queues related profiles
- **BatchProcessingService**: Handles initial root profile processing

## Configuration

### Session Configuration

```javascript
{
  "maxDepth": 3,              // Maximum depth levels to process
  "maxProfilesPerDepth": 100  // Max profiles to process per depth
}
```

### Environment Variables

```env
DEPTH_BATCH_SIZE=5              # Profiles per batch at each depth
DEPTH_BATCH_DELAY=2000         # Delay between batches (ms)
DEPTH_MAX_CONCURRENT=3         # Concurrent scraping requests
MAX_RELATED_PER_PROFILE=50     # Max related profiles per parent
```

## API Endpoints

### Start Automatic Depth Processing

```http
POST /api/sessions/:id/batch-process
{
  "batchSize": 5,
  "extractRelated": true,      // Enable related extraction
  "processDepths": true        // Enable automatic depth processing
}
```

### Manual Depth Processing

```http
POST /api/sessions/:id/depth-process
{
  "maxDepth": 3,
  "maxProfilesPerDepth": 50
}
```

### Monitor Depth Processing Status

```http
GET /api/sessions/:id/depth-status
```

**Response:**
```json
{
  "sessionId": "...",
  "currentDepth": 2,
  "maxDepth": 3,
  "depthStatistics": [
    {
      "_id": 1,
      "total": 100,
      "statuses": [
        { "status": "scraped", "count": 80 },
        { "status": "pending", "count": 20 }
      ]
    },
    {
      "_id": 2,
      "total": 50,
      "statuses": [
        { "status": "pending", "count": 50 }
      ]
    }
  ]
}
```

## Usage Examples

### 1. Full Pipeline with Automatic Depth Processing

```javascript
// Create session
const session = await axios.post('/api/sessions', {
  name: 'Multi-Depth Scraping',
  rootProfiles: ['https://www.instagram.com/user1/'],
  config: {
    maxDepth: 3,
    maxProfilesPerDepth: 100
  }
});

// Start processing with automatic depth progression
await axios.post(`/api/sessions/${session.id}/batch-process`, {
  processDepths: true
});
```

### 2. Manual Depth Processing

```javascript
// Process specific depths manually
await axios.post(`/api/sessions/${session.id}/depth-process`, {
  maxDepth: 2,
  maxProfilesPerDepth: 50
});
```

## Depth Limits and Performance

### Recommended Limits

- **Depth 1**: 100-500 profiles (direct relations)
- **Depth 2**: 50-200 profiles (second-degree connections)
- **Depth 3**: 20-50 profiles (third-degree connections)

### Performance Considerations

1. **Exponential Growth**: Each depth can exponentially increase profiles
2. **API Rate Limits**: More depths = more API calls
3. **Processing Time**: Depth 3 can take hours with large limits
4. **Database Size**: Deep processing generates significant data

## Monitoring Progress

### Session Statistics

Track overall progress:
```javascript
const stats = await axios.get(`/api/sessions/${sessionId}/stats`);
console.log(`Total profiles: ${stats.profiles.total}`);
console.log(`Current depth: ${stats.session.currentDepth}`);
```

### Depth-Specific Statistics

Get detailed depth information:
```javascript
const depthStatus = await axios.get(`/api/sessions/${sessionId}/depth-status`);
depthStatus.depthStatistics.forEach(depth => {
  console.log(`Depth ${depth._id}: ${depth.total} profiles`);
});
```

## Error Handling

The system handles various error scenarios:

1. **Profile Failures**: Individual failures don't stop processing
2. **Rate Limiting**: Automatic retry with exponential backoff
3. **Network Errors**: Retries with configurable attempts
4. **Invalid Profiles**: Marked as failed and skipped

## Best Practices

1. **Start Small**: Test with depth 1-2 before going deeper
2. **Monitor Progress**: Check depth status regularly
3. **Set Reasonable Limits**: Use maxProfilesPerDepth to control growth
4. **Database Maintenance**: Clean up old sessions periodically
5. **Error Analysis**: Review failed profiles for patterns

## Database Schema

Related profiles are stored with depth information:

```javascript
{
  sessionId: ObjectId,
  username: String,
  depth: Number,        // 1, 2, 3, etc.
  parentUsername: String,
  status: String,       // pending, scraped, failed
  profileData: Object
}
```

## Testing

Run the depth processing test:
```bash
npm run test:depth
```

This will:
- Create a session with depth configuration
- Process root profiles
- Automatically progress through depths
- Monitor and report progress
- Validate depth limits