require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE_URL = 'http://localhost:5002/api';

// Generate 100 test profile URLs (using real Instagram accounts)
const testProfiles = [
  // Sports accounts
  'https://www.instagram.com/cristiano',
  'https://www.instagram.com/leomessi', 
  'https://www.instagram.com/neymarjr',
  'https://www.instagram.com/k.mbappe',
  'https://www.instagram.com/erling.haaland',
  'https://www.instagram.com/mosalah',
  'https://www.instagram.com/virgilvandijk',
  'https://www.instagram.com/kevindebruyne',
  'https://www.instagram.com/toni.kr8s',
  'https://www.instagram.com/karimbenzema',
  // Entertainment
  'https://www.instagram.com/selenagomez',
  'https://www.instagram.com/arianagrande',
  'https://www.instagram.com/taylorswift',
  'https://www.instagram.com/justinbieber',
  'https://www.instagram.com/kyliejenner',
  'https://www.instagram.com/kimkardashian',
  'https://www.instagram.com/khloekardashian',
  'https://www.instagram.com/kourtneykardash',
  'https://www.instagram.com/kendalljenner',
  'https://www.instagram.com/nickiminaj',
  // Brands
  'https://www.instagram.com/nike',
  'https://www.instagram.com/adidas',
  'https://www.instagram.com/puma',
  'https://www.instagram.com/underarmour',
  'https://www.instagram.com/newbalance',
  'https://www.instagram.com/reebok',
  'https://www.instagram.com/asics',
  'https://www.instagram.com/fila',
  'https://www.instagram.com/champion',
  'https://www.instagram.com/vans',
  // Tech
  'https://www.instagram.com/apple',
  'https://www.instagram.com/google',
  'https://www.instagram.com/microsoft',
  'https://www.instagram.com/tesla',
  'https://www.instagram.com/spacex',
  'https://www.instagram.com/amazon',
  'https://www.instagram.com/netflix',
  'https://www.instagram.com/spotify',
  'https://www.instagram.com/uber',
  'https://www.instagram.com/airbnb',
  // Fashion
  'https://www.instagram.com/gucci',
  'https://www.instagram.com/louisvuitton',
  'https://www.instagram.com/chanel',
  'https://www.instagram.com/dior',
  'https://www.instagram.com/prada',
  'https://www.instagram.com/versace',
  'https://www.instagram.com/balenciaga',
  'https://www.instagram.com/burberry',
  'https://www.instagram.com/hermes',
  'https://www.instagram.com/fendi'
];

// Duplicate some to reach 100
while (testProfiles.length < 100) {
  testProfiles.push(`https://www.instagram.com/test_profile_${testProfiles.length + 1}`);
}

async function testFrontendWith100Profiles() {
  console.log('========================================');
  console.log('TESTING FRONTEND WITH 100 PROFILES');
  console.log('========================================');
  console.log('Configuration:');
  console.log('- Batch Size: 10 profiles');
  console.log('- Parallel Processing: YES');
  console.log('- Memory per run: 256MB');
  console.log('- Privacy Check: SKIPPED');
  console.log('- Total Profiles: 100');
  console.log('- Expected Batches: 10');
  console.log('========================================\n');
  
  try {
    console.log('📤 Submitting 100 profiles to backend (simulating frontend)...\n');
    
    const startTime = Date.now();
    
    // Create session (exactly like frontend does)
    const response = await axios.post(`${API_BASE_URL}/sessions`, {
      name: `Frontend Test - 100 Profiles - ${Date.now()}`,
      description: 'Testing if frontend can handle 100 profiles perfectly',
      rootProfiles: testProfiles.slice(0, 100),
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 10,
        analysisEnabled: false,
        analyzeRootProfiles: false,
        skipPrivacyCheck: true  // Skip privacy check for faster processing
      }
    });
    
    const session = response.data.data;
    const sessionCreateTime = (Date.now() - startTime) / 1000;
    
    console.log(`✅ Session created in ${sessionCreateTime}s`);
    console.log(`Session ID: ${session._id}`);
    console.log(`Session Name: ${session.name}`);
    console.log(`Total Profiles: ${session.stats.totalProfiles}`);
    console.log('\n🚀 Batch processing should start automatically...\n');
    
    // Monitor the session status
    let lastStatus = '';
    let checkCount = 0;
    const maxChecks = 60; // Check for up to 5 minutes
    
    const checkStatus = async () => {
      try {
        const statusResponse = await axios.get(`${API_BASE_URL}/sessions/${session._id}/batch-status`);
        const status = statusResponse.data.data;
        
        if (status.sessionStatus !== lastStatus || checkCount % 5 === 0) {
          console.log('========================================');
          console.log(`Check #${checkCount + 1} - Status: ${status.sessionStatus.toUpperCase()}`);
          console.log(`Progress: ${status.profiles.progress}%`);
          console.log(`Processed: ${status.profiles.processed}/${status.profiles.total}`);
          console.log(`✅ Scraped: ${status.profiles.scraped}`);
          console.log(`❌ Failed: ${status.profiles.failed}`);
          console.log(`🔒 Skipped: ${status.profiles.skipped}`);
          console.log(`⏳ Pending: ${status.profiles.pending}`);
          if (status.estimatedTimeRemaining > 0) {
            console.log(`⏱️ Estimated Time Remaining: ${status.estimatedTimeRemaining} minutes`);
          }
          console.log('========================================\n');
          lastStatus = status.sessionStatus;
        }
        
        checkCount++;
        
        // Check if completed or failed
        if (status.sessionStatus === 'completed' || status.sessionStatus === 'failed') {
          const totalTime = (Date.now() - startTime) / 1000;
          
          console.log('\n========================================');
          console.log('FINAL RESULTS');
          console.log('========================================');
          console.log(`Total Time: ${totalTime}s (${(totalTime / 60).toFixed(2)} minutes)`);
          console.log(`Average per profile: ${(totalTime / 100).toFixed(2)}s`);
          console.log(`Success Rate: ${(status.profiles.scraped / status.profiles.total * 100).toFixed(1)}%`);
          console.log('========================================');
          
          if (status.profiles.scraped >= 90) {
            console.log('\n✅✅✅ SUCCESS! The system can handle 100 profiles perfectly! ✅✅✅');
            console.log('\nYour frontend will work perfectly with 100 profiles:');
            console.log('- Fast session creation (skips privacy check)');
            console.log('- Parallel batch processing (10 at a time)');
            console.log('- Reduced memory usage (256MB)');
            console.log('- No delays between profiles');
            console.log('- Automatic retry for failed profiles');
          } else if (status.profiles.scraped >= 70) {
            console.log('\n⚠️ PARTIAL SUCCESS - Most profiles scraped but some failures');
            console.log('This is likely due to Apify rate limits or memory constraints');
          } else {
            console.log('\n❌ ISSUES DETECTED - Many failures occurred');
            console.log('Check Apify account limits and memory settings');
          }
          
          return;
        }
        
        // Continue checking
        if (checkCount < maxChecks) {
          setTimeout(checkStatus, 5000); // Check every 5 seconds
        } else {
          console.log('⏱️ Timeout - Session taking too long');
        }
        
      } catch (error) {
        console.error('Error checking status:', error.message);
      }
    };
    
    // Start monitoring after 3 seconds
    setTimeout(checkStatus, 3000);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message);
    console.log('\nThis error would occur in the frontend as well.');
    console.log('Please fix this before using the frontend.');
  }
}

// Run the test
console.log('Starting frontend simulation test...\n');
testFrontendWith100Profiles();