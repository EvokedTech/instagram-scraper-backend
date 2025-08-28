require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = 'http://localhost:5002/api';

async function testBatchProcessing() {
  try {
    console.log('========================================');
    console.log('BATCH PROCESSING TEST');
    console.log('========================================');
    console.log('This test will create a session with multiple profiles');
    console.log('and process them in batches of 10\n');
    
    // Test profiles (you can add more)
    const testProfiles = [
      'https://www.instagram.com/cristiano',
      'https://www.instagram.com/leomessi',
      'https://www.instagram.com/selenagomez',
      'https://www.instagram.com/kyliejenner',
      'https://www.instagram.com/therock',
      'https://www.instagram.com/arianagrande',
      'https://www.instagram.com/kimkardashian',
      'https://www.instagram.com/beyonce',
      'https://www.instagram.com/justinbieber',
      'https://www.instagram.com/taylorswift',
      'https://www.instagram.com/kendalljenner',
      'https://www.instagram.com/jenniferaniston',
      'https://www.instagram.com/nickiminaj',
      'https://www.instagram.com/mileycyrus',
      'https://www.instagram.com/khloekardashian',
      'https://www.instagram.com/jlo',
      'https://www.instagram.com/kourtneykardash',
      'https://www.instagram.com/kevinhart4real',
      'https://www.instagram.com/dualipa',
      'https://www.instagram.com/camilacabello'
    ];
    
    console.log(`Creating session with ${testProfiles.length} profiles...`);
    
    // Create session
    const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`, {
      name: `Batch Test Session ${Date.now()}`,
      description: 'Testing batch processing with 20 celebrity profiles',
      rootProfiles: testProfiles,
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 10,
        analysisEnabled: false
      }
    });
    
    if (sessionResponse.data.success) {
      const session = sessionResponse.data.data;
      console.log(`\n✅ Session created: ${session.name}`);
      console.log(`Session ID: ${session._id}`);
      console.log(`\nProfiles will be processed in batches of 10`);
      console.log('Each batch will have:');
      console.log('- 30 second delay between batches');
      console.log('- 10 second delay between individual profiles');
      console.log('- Profiles saved to database every 5 profiles\n');
      
      // Monitor status
      console.log('Batch processing has started automatically!');
      console.log('Monitor the progress in the backend logs...\n');
      
      // Check status periodically
      const checkStatus = async () => {
        try {
          const statusResponse = await axios.get(`${API_BASE_URL}/sessions/${session._id}/batch-status`);
          if (statusResponse.data.success) {
            const status = statusResponse.data.data;
            console.log('========================================');
            console.log('CURRENT STATUS:');
            console.log('========================================');
            console.log(`Session Status: ${status.sessionStatus}`);
            console.log(`Progress: ${status.profiles.progress}%`);
            console.log(`Total Profiles: ${status.profiles.total}`);
            console.log(`Processed: ${status.profiles.processed}`);
            console.log(`✅ Scraped: ${status.profiles.scraped}`);
            console.log(`❌ Failed: ${status.profiles.failed}`);
            console.log(`🔒 Skipped: ${status.profiles.skipped}`);
            console.log(`⏳ Pending: ${status.profiles.pending}`);
            if (status.estimatedTimeRemaining > 0) {
              console.log(`⏱️ Estimated Time Remaining: ${status.estimatedTimeRemaining} minutes`);
            }
            console.log('========================================\n');
            
            // Continue checking if not complete
            if (status.profiles.pending > 0 && status.sessionStatus !== 'failed') {
              setTimeout(checkStatus, 30000); // Check every 30 seconds
            } else {
              console.log('🎉 Batch processing complete!');
            }
          }
        } catch (error) {
          console.error('Error checking status:', error.message);
        }
      };
      
      // Start checking status after 5 seconds
      setTimeout(checkStatus, 5000);
      
    } else {
      console.error('Failed to create session:', sessionResponse.data.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
console.log('Starting batch processing test...\n');
testBatchProcessing();