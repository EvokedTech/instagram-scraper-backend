# Instagram Scraper System - Project Structure

## Overview
Full-stack Instagram profile scraping system with batch processing, recursive depth scraping, and a web interface.

## Directory Structure

```
scraper-system/
│
├── frontend/                  # Frontend application
│   ├── index.html            # Main HTML file
│   ├── css/
│   │   └── style.css         # Styling
│   ├── js/
│   │   └── app.js           # Frontend JavaScript
│   └── README.md            # Frontend documentation
│
├── src/                      # Backend source code
│   ├── index.js             # Application entry point
│   │
│   ├── config/              # Configuration files
│   │   ├── database.js      # MongoDB configuration
│   │   └── redis.js         # Redis configuration
│   │
│   ├── controllers/         # Route controllers
│   │   ├── apifyController.js
│   │   ├── queueController.js
│   │   ├── scraperController.js
│   │   └── sessionController.js
│   │
│   ├── middleware/          # Express middleware
│   │   ├── errorHandler.js
│   │   └── sessionValidation.js
│   │
│   ├── models/              # Database models
│   │   ├── Profile.js
│   │   ├── RelatedProfileScraped.js
│   │   ├── RootProfileScraped.js
│   │   └── Session.js
│   │
│   ├── queues/              # Queue system
│   │   ├── queueInitializer.js
│   │   ├── queueManager.js
│   │   └── processors/
│   │       ├── depthProcessor.js
│   │       ├── relatedProfileProcessor.js
│   │       └── rootProfileProcessor.js
│   │
│   ├── routes/              # API routes
│   │   ├── apify.js
│   │   ├── bullBoard.js
│   │   ├── health.js
│   │   ├── queues.js
│   │   ├── scraper.js
│   │   └── sessions.js
│   │
│   ├── services/            # Business logic
│   │   ├── apifyService.js           # Apify integration (batch scraping)
│   │   ├── batchProcessingService.js  # Batch processing logic
│   │   ├── depthProcessingService.js  # Recursive depth processing
│   │   ├── queuedBatchProcessingService.js
│   │   ├── relatedProfilesService.js  # Related profiles extraction
│   │   └── scraperService.js         # Core scraping service
│   │
│   ├── scripts/             # Utility scripts
│   │   └── checkCollections.js
│   │
│   └── utils/               # Utilities
│       ├── logger.js        # Winston logger
│       └── profileUrlHelper.js
│
├── tests/                   # Test files
│   └── integration/         # Integration tests
│       ├── test-*.js        # Various test scripts
│       └── check-*.js       # Verification scripts
│
├── logs/                    # Application logs
│   └── *.log files
│
├── docs/                    # Documentation
│   ├── README.md
│   ├── BATCH_PROCESSING.md
│   ├── DEPTH_PROCESSING.md
│   ├── QUEUE_SYSTEM.md
│   ├── REDIS_SETUP.md
│   ├── SESSION_API_DOCS.md
│   └── ...
│
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore file
├── docker-compose.yml      # Docker setup
├── Dockerfile              # Docker image config
├── package.json            # Node.js dependencies
└── start-*.bat             # Windows batch scripts
```

## Key Features

### Backend
- **Batch Processing**: Scrapes up to 10 profiles simultaneously using Apify
- **Recursive Depth Scraping**: Automatically discovers and scrapes related profiles up to depth 6
- **Queue System**: Bull queues for distributed processing
- **Session Management**: Track and control scraping sessions
- **Database**: MongoDB for data storage
- **Caching**: Redis for queue management
- **API**: RESTful API with comprehensive endpoints

### Frontend
- **Session Dashboard**: Create and manage scraping sessions
- **Real-time Updates**: Auto-refresh every 5 seconds
- **Queue Monitoring**: View queue status and job counts
- **Progress Tracking**: Visual progress bars and statistics
- **Responsive Design**: Works on desktop and mobile

## Technology Stack

### Backend
- Node.js & Express.js
- MongoDB with Mongoose
- Redis & Bull Queues
- Apify Client for Instagram scraping
- Winston for logging
- Helmet, CORS for security

### Frontend
- Vanilla JavaScript (ES6+)
- HTML5 & CSS3
- No frontend framework (lightweight)
- Fetch API for backend communication

## API Endpoints

### Sessions
- `POST /api/sessions/create` - Create new session
- `GET /api/sessions` - List sessions
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/pause` - Pause session
- `POST /api/sessions/:id/resume` - Resume session
- `DELETE /api/sessions/:id` - Delete session

### Scraping
- `POST /api/scraper/batch/:sessionId` - Start batch scraping
- `GET /api/scraper/status/:sessionId` - Get scraping status

### Queues
- `GET /api/queues/status` - Get all queue statuses
- `POST /api/queues/:name/clean` - Clean queue

### Health
- `GET /api/health` - Health check

## Running the Application

1. **Start Backend**:
   ```bash
   npm start
   # or
   node src/index.js
   ```

2. **Access Frontend**:
   Open browser to `http://localhost:3000`

3. **Monitor Queues**:
   Bull Board available at `http://localhost:3000/admin/queues`

## Environment Variables

```env
# Server
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/instagram-scraper

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Apify
APIFY_API_TOKEN=your_token_here

# Batch Processing
BATCH_SIZE=10
DEPTH_BATCH_SIZE=10
MAX_CONCURRENT_REQUESTS=3
```