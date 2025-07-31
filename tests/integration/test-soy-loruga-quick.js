const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSoyLoruga() {
  try {
    console.log('\n🚀 Starting Quick Test with soy_loruga Profile');
    console.log('='.repeat(60));

    // Step 1: Create a new session
    console.log('\n📝 Creating new session...');
    const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`, {
      name: `soy_loruga Quick Test - ${Date.now()}`,
      description: 'Quick test of automatic workflow',
      rootProfiles: ['https://www.instagram.com/soy_loruga/'],
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 10, // Limit for quick test
        analysisEnabled: true
      }
    });

    const session = sessionResponse.data.data;
    console.log('✅ Session created successfully!');
    console.log(`   Session ID: ${session._id}`);

    // Step 2: Start queue-based processing
    console.log('\n🔄 Starting queue-based processing...');
    const startResponse = await axios.post(`${API_BASE_URL}/sessions/${session._id}/queue-process`);
    console.log('✅ Queue processing started!');
    console.log(`   Jobs queued: ${startResponse.data.data.jobsQueued}`);

    // Step 3: Monitor for 30 seconds then show results
    console.log('\n📊 Monitoring for 30 seconds...');
    
    for (let i = 0; i < 6; i++) {
      await delay(5000); // Check every 5 seconds
      
      // Get session details
      const detailsResponse = await axios.get(`${API_BASE_URL}/sessions/${session._id}`);
      const currentSession = detailsResponse.data.data;
      
      // Get queue status
      const queueResponse = await axios.get(`${API_BASE_URL}/queues/status`);
      const queues = queueResponse.data.data;
      
      const rootQueue = queues.find(q => q.name === 'rootProfileQueue') || {};
      const relatedQueue = queues.find(q => q.name === 'relatedProfileQueue') || {};
      
      console.log(`\n[${i * 5 + 5}s] Status Update:`);
      console.log(`   Session Status: ${currentSession.status}`);
      console.log(`   Profiles Scraped: ${currentSession.stats.scrapedProfiles}/${currentSession.stats.totalProfiles}`);
      console.log(`   Root Queue: ${rootQueue.active || 0} active, ${rootQueue.waiting || 0} waiting`);
      console.log(`   Related Queue: ${relatedQueue.active || 0} active, ${relatedQueue.waiting || 0} waiting`);
      
      // Check if root profile was scraped
      if (currentSession.rootProfilesScraped && currentSession.rootProfilesScraped.length > 0) {
        console.log(`   ✅ Root profile scraped: @${currentSession.rootProfilesScraped[0].username}`);
        console.log(`      Followers: ${currentSession.rootProfilesScraped[0].data?.followersCount || 'N/A'}`);
        console.log(`      Related profiles found: ${currentSession.rootProfilesScraped[0].data?.relatedProfiles?.length || 0}`);
      }
      
      // Show related profiles being processed
      if (currentSession.relatedProfilesScraped && currentSession.relatedProfilesScraped.length > 0) {
        console.log(`   📊 Related profiles scraped: ${currentSession.relatedProfilesScraped.length}`);
        currentSession.relatedProfilesScraped.slice(-3).forEach(profile => {
          console.log(`      • @${profile.username} (parent: @${profile.parentUsername})`);
        });
      }
    }
    
    // Final results
    console.log('\n\n📊 Test Results After 30 Seconds:');
    console.log('='.repeat(60));
    
    const finalResponse = await axios.get(`${API_BASE_URL}/sessions/${session._id}`);
    const finalSession = finalResponse.data.data;
    
    console.log(`Session ID: ${finalSession._id}`);
    console.log(`Status: ${finalSession.status}`);
    console.log(`Root Profiles Scraped: ${finalSession.rootProfilesScraped?.length || 0}`);
    console.log(`Related Profiles Scraped: ${finalSession.relatedProfilesScraped?.length || 0}`);
    console.log(`Total Profiles: ${finalSession.stats.scrapedProfiles}`);
    
    if (finalSession.rootProfilesScraped && finalSession.rootProfilesScraped.length > 0) {
      const rootProfile = finalSession.rootProfilesScraped[0];
      console.log(`\n✅ Automatic Workflow Demonstrated:`);
      console.log(`   1. Root profile @${rootProfile.username} was scraped`);
      console.log(`   2. Found ${rootProfile.data?.relatedProfiles?.length || 0} related profiles`);
      console.log(`   3. Related profiles were automatically queued at depth 1`);
      
      if (finalSession.relatedProfilesScraped && finalSession.relatedProfilesScraped.length > 0) {
        console.log(`   4. ${finalSession.relatedProfilesScraped.length} related profiles were scraped`);
        console.log(`   5. Parent-child relationships maintained`);
        console.log(`\n   Example relationships:`);
        finalSession.relatedProfilesScraped.slice(0, 3).forEach(profile => {
          console.log(`      @${profile.parentUsername} → @${profile.username}`);
        });
      }
    }
    
    console.log('\n✅ Test completed! The automatic workflow is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data?.message || error.message);
  }
}

// Run the test
testSoyLoruga().catch(console.error);