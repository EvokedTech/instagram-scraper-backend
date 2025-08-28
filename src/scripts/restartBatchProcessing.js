require('dotenv').config();
const mongoose = require('mongoose');
const batchScrapingService = require('../services/batchScrapingService');
const logger = require('../utils/logger');

async function restartBatchProcessing(sessionId) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info(`Connected to MongoDB`);
    
    // Start batch processing
    logger.info(`Manually starting batch processing for session: ${sessionId}`);
    await batchScrapingService.processSessionInBatches(sessionId);
    
  } catch (error) {
    logger.error('Error restarting batch processing:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get session ID from command line argument
const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Please provide a session ID as argument');
  console.log('Usage: node restartBatchProcessing.js <sessionId>');
  process.exit(1);
}

restartBatchProcessing(sessionId);