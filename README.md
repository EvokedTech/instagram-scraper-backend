# Instagram Scraper System

A Node.js-based Instagram scraper with Express server, MongoDB storage, and Docker support.

## Features

- ✅ Express server with RESTful API
- ✅ MongoDB integration with Mongoose
- ✅ Winston logging system
- ✅ Docker & Docker Compose setup
- ✅ Health check endpoints
- ✅ Error handling middleware
- ✅ Rate limiting
- ✅ Environment configuration

## Prerequisites

- Node.js 16+ 
- MongoDB 4.4+ (or use Docker)
- Docker & Docker Compose (optional)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration

## Running the Application

### Local Development

1. Start MongoDB locally or use Docker:
```bash
docker-compose up -d mongodb
```

2. Run the application:
```bash
npm run dev
```

### Using Docker Compose

```bash
docker-compose up -d
```

This will start both MongoDB and the application.

## API Endpoints

### Health Check
- `GET /api/health` - Detailed health check with MongoDB status
- `GET /api/health/ping` - Simple ping endpoint

### Scraper Endpoints
- `POST /api/scraper/scrape/:username` - Scrape an Instagram profile
- `GET /api/scraper/profile/:username` - Get profile from database
- `GET /api/scraper/profiles` - Get all profiles (paginated)
- `GET /api/scraper/profiles/recent` - Get recently scraped profiles

## Project Structure

```
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Route controllers
│   ├── middleware/     # Express middleware
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   └── index.js        # Application entry point
├── logs/               # Application logs
├── .env                # Environment variables
├── .env.example        # Example environment file
├── docker-compose.yml  # Docker Compose configuration
├── Dockerfile          # Docker image configuration
└── package.json        # NPM dependencies

```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/instagram-scraper |
| LOG_LEVEL | Winston log level | info |

## Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

## Rate Limiting

API endpoints are rate-limited to 100 requests per 15 minutes per IP.

## Error Handling

The application includes comprehensive error handling:
- Validation errors
- Database errors
- Unhandled rejections
- Uncaught exceptions

## Security

- Helmet.js for security headers
- CORS enabled
- Rate limiting
- Input validation

## Development

```bash
# Run in development mode with nodemon
npm run dev

# Run in production mode
npm start
```

## Docker Commands

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Note

This scraper is for educational purposes only. Please respect Instagram's Terms of Service and robots.txt when scraping.