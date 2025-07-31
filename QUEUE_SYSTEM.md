# Redis and Bull Queue System

## Overview

The queue system provides robust, scalable job processing for Instagram profile scraping with Redis-backed Bull queues. It offers retry logic, job monitoring, pause/resume functionality, and visual dashboard.

## Prerequisites

- Redis server running (localhost:6379 by default)
- Node.js environment with Bull and Redis packages

## Features

- **Multiple Queue Types**: Separate queues for different job types
- **Automatic Retry Logic**: Exponential backoff with configurable attempts
- **Job Monitoring**: Real-time status and progress tracking
- **Pause/Resume**: Control job processing at session level
- **Visual Dashboard**: Bull Board UI for queue monitoring
- **Graceful Shutdown**: Proper cleanup on server termination
- **Priority Processing**: Jobs can be prioritized
- **Rate Limiting**: Prevent API overload with controlled concurrency

## Architecture

### Queue Types

1. **rootProfileQueue**: Processes root Instagram profiles
2. **relatedProfileQueue**: Processes related/suggested profiles
3. **depthProcessingQueue**: Manages depth-level profile extraction
4. **analysisQueue**: Future use for profile analysis

### Job Flow

```
Session Created
    ↓
Root Profiles → rootProfileQueue
    ↓
Job Processor (with retries)
    ↓
Related Profiles Extracted
    ↓
relatedProfileQueue
    ↓
Depth Processing
```

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Queue Configuration
QUEUE_CONCURRENCY=5
MAX_RETRIES=3
RETRY_DELAY=5000
JOB_TIMEOUT=120000
```

### Queue Options

```javascript
{
  attempts: 3,              // Number of retry attempts
  backoff: {
    type: 'exponential',    // Backoff strategy
    delay: 5000            // Initial delay in ms
  },
  removeOnComplete: {
    age: 86400,            // Keep completed jobs for 24 hours
    count: 100             // Keep max 100 completed jobs
  },
  removeOnFail: {
    age: 604800            // Keep failed jobs for 7 days
  }
}
```

## API Endpoints

### Queue Management

#### Get All Queues Status
```http
GET /api/queues/status
```

#### Get Specific Queue Status
```http
GET /api/queues/:queueName/status
```

#### Get Queue Metrics
```http
GET /api/queues/:queueName/metrics
```

Response:
```json
{
  "counts": {
    "completed": 150,
    "failed": 10,
    "active": 5,
    "waiting": 20,
    "delayed": 0
  },
  "rates": {
    "completionRate": "93.75",
    "failureRate": "6.25"
  }
}
```

### Job Management

#### Get Jobs by State
```http
GET /api/queues/:queueName/jobs?state=waiting&start=0&end=20
```

States: `waiting`, `active`, `completed`, `failed`, `delayed`

#### Get Job Details
```http
GET /api/queues/:queueName/jobs/:jobId
```

#### Retry Failed Job
```http
POST /api/queues/:queueName/jobs/:jobId/retry
```

#### Remove Job
```http
DELETE /api/queues/:queueName/jobs/:jobId
```

### Queue Control

#### Pause Queue
```http
POST /api/queues/:queueName/pause
```

#### Resume Queue
```http
POST /api/queues/:queueName/resume
```

#### Clean Queue
```http
POST /api/queues/:queueName/clean
{
  "grace": 0,
  "status": "completed"
}
```

#### Empty Queue
```http
POST /api/queues/:queueName/empty
```

## Session Queue Processing

### Start Queued Processing
```http
POST /api/sessions/:id/queue-process
{
  "priority": 1,
  "retryAttempts": 3,
  "retryDelay": 5000,
  "monitor": true
}
```

### Get Session Queue Stats
```http
GET /api/sessions/:id/queue-stats
```

### Pause Session Processing
```http
POST /api/sessions/:id/queue-pause
```

### Resume Session Processing
```http
POST /api/sessions/:id/queue-resume
```

## Job Processors

### Root Profile Processor
- Checks for existing profiles
- Scrapes using Apify service
- Updates session statistics
- Queues related profiles extraction

### Related Profile Processor
- Processes profiles at specific depths
- Enforces depth limits
- Queues next level if within limits

### Depth Processor
- Extracts and queues related profiles
- Manages depth progression
- Enforces maxProfilesPerDepth

## Error Handling

### Retry Logic
- Exponential backoff: 5s, 10s, 20s
- Max 3 attempts by default
- Failed jobs preserved for analysis

### Failure Scenarios
1. **Network Errors**: Automatic retry
2. **API Rate Limits**: Exponential backoff
3. **Invalid Profiles**: Marked as failed
4. **Timeout**: Job requeued

## Monitoring

### Bull Board Dashboard
Access at: `http://localhost:5000/admin/queues`

Features:
- Real-time queue statistics
- Job inspection
- Manual retry/remove
- Queue pause/resume

### Programmatic Monitoring
```javascript
// Get queue metrics
const metrics = await queueManager.getQueueStatus('rootProfileQueue');

// Monitor specific session
const stats = await queuedBatchProcessingService.getSessionQueueStats(sessionId);
```

## Best Practices

1. **Batch Size**: Keep batches small (5-10) for better error isolation
2. **Priority**: Use priority for time-sensitive profiles
3. **Monitoring**: Check Bull Board regularly during processing
4. **Cleanup**: Clean completed jobs periodically
5. **Redis Memory**: Monitor Redis memory usage

## Testing

Run the queue system test:
```bash
npm run test:queue
```

This tests:
- Queue creation and job addition
- Job processing and retry
- Pause/resume functionality
- Queue monitoring
- Error handling

## Troubleshooting

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping

# Check Redis info
redis-cli info
```

### Queue Stuck
```javascript
// Clear stuck jobs
await queue.clean(0, 'failed');
await queue.clean(0, 'stuck');
```

### Memory Issues
```javascript
// Clean old jobs
await queue.clean(86400, 'completed'); // Remove jobs older than 24h
```

## Performance Tuning

### Concurrency
Adjust based on API limits:
```javascript
queue.process(10, processJob); // Process 10 jobs concurrently
```

### Rate Limiting
Add delays between jobs:
```javascript
jobOptions.delay = 1000; // 1 second delay
```

### Memory Management
Configure job retention:
```javascript
removeOnComplete: {
  age: 3600,  // 1 hour
  count: 50   // Keep only 50 jobs
}
```