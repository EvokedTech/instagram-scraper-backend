require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../utils/logger');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

async function testRelatedProfilesExtraction() {
  try {
    logger.info('Starting related profiles extraction test');
    
    // Get the most recent session with scraped profiles
    const sessionsResponse = await axios.get(`${API_BASE_URL}/api/sessions?status=completed&limit=1`);
    
    if (!sessionsResponse.data.data || sessionsResponse.data.data.length === 0) {
      logger.error('No completed sessions found. Please run batch processing test first.');
      return;
    }
    
    const session = sessionsResponse.data.data[0];
    logger.info(`Using session: ${session.name} (${session._id})`);
    
    // 1. Check initial state
    logger.info('Checking initial related profiles state...');
    const initialStats = await RelatedProfileScraped.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(session._id) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    logger.info('Initial related profiles:', initialStats);
    
    // 2. Extract related profiles
    logger.info('Extracting related profiles...');
    const extractResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/extract-related`,
      { maxDepth: 2 }
    );
    
    const extractionResults = extractResponse.data.data;
    logger.info('Extraction results:', {
      totalExtracted: extractionResults.totalExtracted,
      uniqueProfiles: extractionResults.uniqueProfiles,
      duplicatesRemoved: extractionResults.duplicatesRemoved,
      alreadyInDatabase: extractionResults.alreadyInDatabase,
      queuedForScraping: extractionResults.queuedForScraping,
      processingTime: `${extractionResults.processingTime}ms`
    });
    
    // 3. Verify deduplication
    logger.info('Verifying deduplication...');
    
    // Check for duplicates in the database
    const duplicateCheck = await RelatedProfileScraped.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(session._id) } },
      { $group: { 
        _id: '$username', 
        count: { $sum: 1 },
        depths: { $push: '$depth' }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);
    
    if (duplicateCheck.length > 0) {
      logger.warn('Found duplicate usernames:', duplicateCheck);
    } else {
      logger.info('No duplicate usernames found - deduplication working correctly');
    }
    
    // 4. Verify URL conversion
    logger.info('Verifying URL conversion...');
    const sampleProfiles = await RelatedProfileScraped.find({
      sessionId: session._id
    }).limit(5);
    
    sampleProfiles.forEach(profile => {
      const expectedUrl = `https://www.instagram.com/${profile.username}/`;
      if (profile.profileUrl === expectedUrl) {
        logger.info(`✓ URL correctly converted for ${profile.username}`);
      } else {
        logger.error(`✗ URL conversion failed for ${profile.username}: ${profile.profileUrl}`);
      }
    });
    
    // 5. Get related profiles statistics
    logger.info('Fetching related profiles statistics...');
    const statsResponse = await axios.get(
      `${API_BASE_URL}/api/sessions/${session._id}/related-stats`
    );
    
    const stats = statsResponse.data.data;
    logger.info('Related profiles by depth:', stats);
    
    // 6. Test re-extraction (should find existing profiles)
    logger.info('Testing re-extraction...');
    const reExtractResponse = await axios.post(
      `${API_BASE_URL}/api/sessions/${session._id}/extract-related`,
      { maxDepth: 2 }
    );
    
    const reExtractionResults = reExtractResponse.data.data;
    logger.info('Re-extraction results:', {
      alreadyInDatabase: reExtractionResults.alreadyInDatabase,
      queuedForScraping: reExtractionResults.queuedForScraping
    });
    
    if (reExtractionResults.alreadyInDatabase > 0 && reExtractionResults.queuedForScraping === 0) {
      logger.info('✓ Database check working correctly - no duplicates queued');
    }
    
    // 7. Summary
    logger.info('Test Summary:');
    logger.info(`- Total unique profiles extracted: ${extractionResults.uniqueProfiles}`);
    logger.info(`- Duplicates removed within batch: ${extractionResults.duplicatesRemoved}`);
    logger.info(`- Profiles already in database: ${reExtractionResults.alreadyInDatabase}`);
    logger.info(`- New profiles queued: ${extractionResults.queuedForScraping}`);
    
    logger.info('Related profiles extraction test completed successfully');
    
  } catch (error) {
    if (error.response) {
      logger.error('Test failed with HTTP error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else {
      logger.error('Test failed:', error.message);
    }
    throw error;
  }
}

// Run test if executed directly
if (require.main === module) {
  logger.info('Connecting to database...');
  
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/instagram-scraper')
    .then(() => {
      logger.info('Database connected');
      return testRelatedProfilesExtraction();
    })
    .then(() => {
      logger.info('Test completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testRelatedProfilesExtraction;