require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
// const rateLimit = require('express-rate-limit'); // Rate limiting removed
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initializeQueues, shutdownQueues } = require('./queues/queueInitializer');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const socketService = require('./services/socketService');
const sessionCompletionService = require('./services/sessionCompletionService');
const healthRoutes = require('./routes/health');
const scraperRoutes = require('./routes/scraper');
const sessionRoutes = require('./routes/sessions');
const apifyRoutes = require('./routes/apify');
const queueRoutes = require('./routes/queues');
const dashboardRoutes = require('./routes/dashboard');
const analysisRoutes = require('./routes/analysis');
const testRoutes = require('./routes/test');
const aiAnalysisRoutes = require('./routes/aiAnalysis');
const bullBoard = require('./routes/bullBoard');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Rate limiting removed

// Middleware
app.use(helmet());
// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    
    // Allow any localhost origin in development
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]');
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Allow any Vercel deployment
    const isVercelDeployment = origin.includes('.vercel.app');
    const isAllowedOrigin = allowedOrigins.includes(origin);
    
    if (isAllowedOrigin || isVercelDeployment || (isDevelopment && isLocalhost)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use('/api/', limiter); // Rate limiting removed

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Instagram Scraper API',
    version: '1.0.0',
    status: 'running',
    message: 'Welcome to the Instagram Scraper Backend API',
    endpoints: {
      health: '/api/health',
      sessions: '/api/sessions',
      dashboard: '/api/dashboard',
      scraper: '/api/scraper',
      queues: '/api/queues',
      analysis: '/api/analysis',
      aiAnalysis: '/api/ai-analysis'
    },
    documentation: 'See /api/health for detailed health status'
  });
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/apify', apifyRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/ai-analysis', aiAnalysisRoutes);
app.use('/api/test', testRoutes);

// Webhook routes removed - using external analysis backend

// Bull Board UI (only in development and if Redis is available)
// Note: Bull Board is loaded but will show connection errors without Redis

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Try to connect to Redis (optional)
    try {
      await connectRedis();
      await initializeQueues();
    } catch (redisError) {
      logger.warn('Redis connection failed, queue features will be disabled');
      logger.info('Server will continue without queue functionality');
    }
    
    // Initialize Socket.IO
    socketService.initialize(server);
    
    // Start session completion checker
    sessionCompletionService.scheduleCompletionChecks();
    logger.info('Session completion checker started');
    
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('Socket.IO server initialized');
      
      // Log critical configuration for production debugging
      logger.info('====================================');
      logger.info('CONFIGURATION CHECK:');
      logger.info(`ANALYSIS_BACKEND_URL: ${process.env.ANALYSIS_BACKEND_URL || 'NOT SET (defaulting to localhost:5001)'}`);
      logger.info(`MONGODB_URI: ${process.env.MONGODB_URI ? '✅ configured' : '❌ NOT SET'}`);
      logger.info(`APIFY_API_TOKEN: ${process.env.APIFY_API_TOKEN ? '✅ configured' : '❌ NOT SET'}`);
      logger.info(`CLOUDFLARE_R2: ${process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ? '✅ configured' : '❌ NOT SET'}`);
      
      if (!process.env.ANALYSIS_BACKEND_URL) {
        logger.error('');
        logger.error('⚠️  CRITICAL WARNING: ANALYSIS_BACKEND_URL not set!');
        logger.error('⚠️  Analysis webhooks will fail in production!');
        logger.error('⚠️  Set ANALYSIS_BACKEND_URL to your deployed analyzer backend');
        logger.error('⚠️  Example: https://analyzer-backend.railway.app');
        logger.error('');
      }
      logger.info('====================================');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received. Shutting down gracefully...');
  
  try {
    await shutdownQueues();
    logger.info('Queues shut down successfully');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  
  process.exit(0);
});