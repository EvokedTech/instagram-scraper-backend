require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const logger = require('../utils/logger');

async function checkCollections() {
  try {
    await connectDB();
    logger.info('Connected to MongoDB');
    
    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    logger.info('\n=== Collections in Database ===');
    collections.forEach(collection => {
      logger.info(`Collection: ${collection.name}`);
    });
    
    // Count documents in each collection
    logger.info('\n=== Document Counts ===');
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      logger.info(`${collection.name}: ${count} documents`);
    }
    
    // Show sample documents from our collections
    const rootProfilesCount = await mongoose.connection.db.collection('rootprofiles_scraped_data').countDocuments();
    const relatedProfilesCount = await mongoose.connection.db.collection('relatedprofiles_scraped_data').countDocuments();
    const sessionsCount = await mongoose.connection.db.collection('sessions').countDocuments();
    
    logger.info('\n=== Our Collections Summary ===');
    logger.info(`Sessions: ${sessionsCount} documents`);
    logger.info(`Root Profiles (depth 0): ${rootProfilesCount} documents`);
    logger.info(`Related Profiles (depth 1+): ${relatedProfilesCount} documents`);
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('\nDisconnected from MongoDB');
  }
}

checkCollections();