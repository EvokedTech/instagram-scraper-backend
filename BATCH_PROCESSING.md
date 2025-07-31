# Batch Processing for Root Profiles

## Overview

The batch processing system allows efficient scraping of multiple Instagram profiles in parallel with configurable batch sizes, database deduplication, progress tracking, and graceful error handling.

## Features

- **Configurable Batch Size**: Process multiple profiles in customizable batch sizes
- **Database Deduplication**: Automatically skip profiles that have already been scraped
- **Real-time Progress Tracking**: Monitor session progress and statistics in real-time
- **Graceful Error Handling**: Individual profile failures don't stop the entire batch
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Concurrency Control**: Limit concurrent API requests to avoid rate limiting

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Batch Processing Configuration
BATCH_SIZE=5                    # Default number of profiles per batch
BATCH_DELAY=2000               # Delay between batches in milliseconds
MAX_CONCURRENT_REQUESTS=3       # Maximum concurrent API requests
```

## API Endpoints

### Start Batch Processing

```http
POST /api/sessions/:id/batch-process
```

**Request Body:**
```json
{
  "batchSize": 5,               // Optional, defaults to BATCH_SIZE env var
  "maxConcurrentRequests": 3    // Optional, defaults to MAX_CONCURRENT_REQUESTS env var
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "status": "running",
    "stats": {
      "totalProfiles": 10,
      "scrapedProfiles": 0
    }
  },
  "message": "Batch processing started successfully"
}
```

### Get Batch Processing Status

```http
GET /api/sessions/:id/batch-status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "sessionStatus": "running",
    "profiles": {
      "total": 10,
      "scraped": 5,
      "analyzed": 0,
      "failed": 1,
      "pending": 4
    },
    "progress": 50,
    "duration": 120000,
    "startedAt": "2024-01-20T10:00:00Z",
    "completedAt": null
  }
}
```

## Usage Example

### 1. Create a Session

```bash
curl -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Celebrity Profiles Batch",
    "description": "Scraping celebrity Instagram profiles",
    "rootProfiles": [
      "https://www.instagram.com/cristiano/",
      "https://www.instagram.com/leomessi/",
      "https://www.instagram.com/selenagomez/"
    ],
    "config": {
      "maxDepth": 2,
      "maxProfilesPerDepth": 50
    }
  }'
```

### 2. Start Batch Processing

```bash
curl -X POST http://localhost:5000/api/sessions/{session_id}/batch-process \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 2,
    "maxConcurrentRequests": 2
  }'
```

### 3. Monitor Progress

```bash
# Check status every 5 seconds
while true; do
  curl http://localhost:5000/api/sessions/{session_id}/batch-status
  sleep 5
done
```

## Testing

Run the batch processing test script:

```bash
npm run test:batch
```

Or manually:

```bash
node src/scripts/testBatchProcessing.js
```

## Processing Flow

1. **Session Creation**: Create a session with root profile URLs
2. **Batch Initialization**: Start batch processing with optional configuration
3. **Database Check**: Each profile is checked against the database to avoid re-scraping
4. **Batch Processing**: Profiles are processed in batches with concurrent request limits
5. **Progress Updates**: Session statistics are updated in real-time
6. **Error Handling**: Failed profiles are logged but don't stop the batch
7. **Completion**: Session is marked as completed (or completed_with_errors)

## Error Handling

The batch processor handles various error scenarios:

- **Profile Already Scraped**: Skipped and counted as successful
- **API Rate Limiting**: Automatic retry with exponential backoff
- **Network Errors**: Retry up to 3 times per profile
- **Invalid Profile URLs**: Marked as failed and logged
- **Session Not Found**: Returns 404 error

## Performance Considerations

- **Batch Size**: Larger batches process faster but use more memory
- **Concurrent Requests**: Higher concurrency speeds up processing but may trigger rate limits
- **Batch Delay**: Prevents overwhelming the API with rapid requests
- **Database Queries**: Optimized with proper indexes on sessionId and username

## Monitoring

Check the logs for detailed processing information:

```bash
# Application logs
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log
```

Log entries include:
- Batch start/completion times
- Individual profile processing status
- Error details with stack traces
- Performance metrics (processing time per batch)

## Best Practices

1. **Start Small**: Test with small batch sizes before scaling up
2. **Monitor Rate Limits**: Watch for 429 errors and adjust concurrency
3. **Database Indexes**: Ensure proper indexes are created for optimal performance
4. **Error Recovery**: Failed profiles can be reprocessed in a new session
5. **Resource Management**: Monitor memory usage for large batches