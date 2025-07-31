# Instagram Scraper Backend

Node.js Express API for Instagram profile scraping with batch processing and queue management.

## Features

- **Batch Scraping**: Process up to 10 profiles simultaneously using Apify
- **Recursive Depth**: Automatically discover and scrape related profiles up to depth 6
- **Queue System**: Bull queues for distributed processing
- **Session Management**: Complete session lifecycle management
- **MongoDB Storage**: Efficient data storage with proper indexing
- **Redis Caching**: Optional Redis for queue management

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file:
   ```env
   # Server
   PORT=3000
   
   # Database
   MONGODB_URI=mongodb://localhost:27017/instagram-scraper
   
   # Redis (optional)
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # Apify
   APIFY_API_TOKEN=your_token_here
   
   # Batch Processing
   BATCH_SIZE=10
   DEPTH_BATCH_SIZE=10
   MAX_CONCURRENT_REQUESTS=3
   ```

3. **Start Services**:
   ```bash
   # Start MongoDB
   mongod
   
   # Start Redis (optional)
   redis-server
   
   # Start the server
   npm start
   ```

## API Endpoints

### Sessions
- `POST /api/sessions/create` - Create new session
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/pause` - Pause session
- `POST /api/sessions/:id/resume` - Resume session
- `DELETE /api/sessions/:id` - Delete session

### Scraping
- `POST /api/scraper/batch/:sessionId` - Start batch scraping
- `GET /api/scraper/status/:sessionId` - Get scraping status

### Queues
- `GET /api/queues/status` - Get queue status
- `POST /api/queues/:name/clean` - Clean queue

### Health
- `GET /api/health` - Health check

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   ├── models/          # Mongoose models
│   ├── queues/          # Queue management
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── scripts/         # Utility scripts
│   └── utils/           # Helper utilities
├── tests/               # Test files
├── logs/                # Application logs
└── package.json
```

## Key Services

### apifyService.js
- Batch scraping with Apify
- Processes 10 profiles per API call
- Automatic retry logic

### batchProcessingService.js
- Manages batch processing
- Handles session statistics
- Coordinates profile extraction

### depthProcessingService.js
- Recursive depth scraping
- Batch size of 10 profiles
- Maximum depth of 6 levels

### relatedProfilesService.js
- Extracts related profiles
- Deduplication logic
- Efficient database queries

## Database Models

- **Session**: Scraping session configuration
- **RootProfileScraped**: Root profile data
- **RelatedProfileScraped**: Related profile data
- **Profile**: Generic profile model

## Running Without Redis

The system can run without Redis, but queue features will be disabled:

```bash
npm start
# Server will show: "Redis connection failed, queue features will be disabled"
```

## Testing

```bash
# Run integration tests
node tests/integration/test-soy-loruga.js
```

## Monitoring

- Application logs in `logs/` directory
- Bull Board UI at `/admin/queues` (requires Redis)