const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createSessionAndProcess() {
  try {
    console.log('\n🚀 Starting Instagram Scraper Test with soy_loruga Profile');
    console.log('='.repeat(60));

    // Step 1: Create a new session
    console.log('\n📝 Creating new session...');
    const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`, {
      name: `soy_loruga Test Session - ${new Date().toISOString()}`,
      description: 'Testing automatic workflow with soy_loruga profile',
      rootProfiles: ['https://www.instagram.com/soy_loruga/'],
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 50,
        analysisEnabled: true
      }
    });

    const session = sessionResponse.data.data;
    console.log('✅ Session created successfully!');
    console.log(`   Session ID: ${session._id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Max Depth: ${session.config?.maxDepth || 2}`);

    // Step 2: Start queue-based processing
    console.log('\n🔄 Starting queue-based processing...');
    const startResponse = await axios.post(`${API_BASE_URL}/sessions/${session._id}/queue-process`);
    console.log('✅ Queue processing started!');
    console.log(`   Jobs queued: ${startResponse.data.data.jobsQueued}`);

    // Step 3: Monitor progress
    console.log('\n📊 Monitoring progress...');
    console.log('   (Press Ctrl+C to stop monitoring)');
    
    let previousStatus = null;
    let completedProfiles = new Set();
    let lastUpdate = Date.now();
    
    while (true) {
      try {
        // Get session details
        const detailsResponse = await axios.get(`${API_BASE_URL}/sessions/${session._id}`);
        const currentSession = detailsResponse.data.data;
        
        // Get queue status
        const queueResponse = await axios.get(`${API_BASE_URL}/queues/status`);
        const queues = queueResponse.data.data;
        
        // Build status display
        const rootQueue = queues.find(q => q.name === 'rootProfileQueue') || {};
        const relatedQueue = queues.find(q => q.name === 'relatedProfileQueue') || {};
        
        const status = {
          session: currentSession.status,
          currentDepth: currentSession.stats.currentDepth,
          rootProfilesScraped: currentSession.stats.scrapedProfiles,
          relatedProfilesScraped: currentSession.relatedProfilesScraped?.length || 0,
          totalProfiles: currentSession.stats.totalProfiles,
          errors: currentSession.stats.errors || 0,
          rootQueueActive: rootQueue.active || 0,
          rootQueueWaiting: rootQueue.waiting || 0,
          relatedQueueActive: relatedQueue.active || 0,
          relatedQueueWaiting: relatedQueue.waiting || 0
        };
        
        // Update display every 2 seconds
        if (Date.now() - lastUpdate > 2000) {
          console.log('\n--- Live Progress Update ---');
          console.log(`Session Status: ${status.session}`);
          console.log(`Current Depth: ${status.currentDepth}`);
          console.log(`Root Profiles Scraped: ${status.rootProfilesScraped}`);
          console.log(`Related Profiles Scraped: ${status.relatedProfilesScraped}`);
          console.log(`Total Profiles: ${status.totalProfiles}`);
          console.log(`Errors: ${status.errors}`);
          console.log(`Queue Status - Root: ${status.rootQueueActive} active, ${status.rootQueueWaiting} waiting`);
          console.log(`Queue Status - Related: ${status.relatedQueueActive} active, ${status.relatedQueueWaiting} waiting`);
          
          lastUpdate = Date.now();
        }
        
        // Check if processing is complete
        if (currentSession.status === 'completed' || 
            (status.rootQueueActive === 0 && status.rootQueueWaiting === 0 && 
             status.relatedQueueActive === 0 && status.relatedQueueWaiting === 0 && 
             status.totalProfiles > 0)) {
          
          console.log('\n\n✅ Processing Complete!');
          console.log('='.repeat(60));
          
          // Show final results
          console.log('\n📊 Final Results:');
          console.log(`   Total Profiles Scraped: ${status.totalProfiles}`);
          console.log(`   Root Profiles: ${status.rootProfilesScraped}`);
          console.log(`   Related Profiles: ${status.relatedProfilesScraped}`);
          console.log(`   Total Errors: ${status.errors}`);
          console.log(`   Time Elapsed: ${Math.round((Date.now() - new Date(currentSession.createdAt).getTime()) / 1000)}s`);
          
          // Show parent-child relationships
          if (currentSession.relatedProfilesScraped && currentSession.relatedProfilesScraped.length > 0) {
            console.log('\n🔗 Parent-Child Relationships:');
            const parentGroups = {};
            currentSession.relatedProfilesScraped.forEach(profile => {
              if (!parentGroups[profile.parentUsername]) {
                parentGroups[profile.parentUsername] = [];
              }
              parentGroups[profile.parentUsername].push(profile.username);
            });
            
            Object.entries(parentGroups).slice(0, 3).forEach(([parent, children]) => {
              console.log(`   @${parent} → ${children.length} related profiles`);
              children.slice(0, 5).forEach(child => {
                console.log(`      • @${child}`);
              });
              if (children.length > 5) {
                console.log(`      ... and ${children.length - 5} more`);
              }
            });
          }
          
          break;
        }
        
        await delay(2000); // Check every 2 seconds
        
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.error('\n❌ Lost connection to server. Make sure the backend is running.');
          break;
        }
        // Ignore other errors and continue monitoring
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data?.message || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure the backend server is running on port 5000');
    }
  }
}

// Run the test
createSessionAndProcess().catch(console.error);