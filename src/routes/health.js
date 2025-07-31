const express = require('express');
const router = express.Router();
const { getConnectionStatus } = require('../config/database');
const os = require('os');

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const mongoStatus = getConnectionStatus();
    
    const healthInfo = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      server: {
        port: process.env.PORT || 5000,
        hostname: os.hostname(),
        platform: os.platform(),
        memory: {
          total: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
          free: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
        }
      },
      database: {
        mongodb: mongoStatus
      }
    };

    const httpStatus = mongoStatus.isConnected ? 200 : 503;
    res.status(httpStatus).json(healthInfo);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Simple ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;