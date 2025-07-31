const axios = require('axios');

async function testLimitEnforcement() {
    try {
        console.log('Testing maxProfilesPerDepth limit enforcement...\n');
        
        // Create a session with maxProfilesPerDepth = 5
        const sessionData = {
            name: `Test Limit ${Date.now()}`,
            description: 'Testing maxProfilesPerDepth limit enforcement',
            rootProfiles: ['https://www.instagram.com/soy_loruga/'],
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 5,  // Only allow 5 profiles per depth
                analysisEnabled: false
            }
        };
        
        console.log('Creating session with:');
        console.log('- Root profile: soy_loruga');
        console.log('- Max Depth: 2');
        console.log('- Max Profiles Per Depth: 5\n');
        
        const createResponse = await axios.post('http://localhost:5000/api/sessions', sessionData);
        const session = createResponse.data.data;
        
        console.log(`Session created: ${session.name}`);
        console.log(`Session ID: ${session._id}\n`);
        
        // Start processing
        console.log('Starting queued batch processing...');
        const startResponse = await axios.post(`http://localhost:5000/api/sessions/${session._id}/queue-process`);
        console.log('Processing started\n');
        
        // Monitor for a bit
        console.log('Monitoring session for 30 seconds...');
        console.log('The system should only process 5 profiles at depth 1, not all 80!\n');
        
        let checkCount = 0;
        const checkInterval = setInterval(async () => {
            try {
                checkCount++;
                
                // Get session stats
                const statsResponse = await axios.get(`http://localhost:5000/api/sessions/${session._id}/stats`);
                const stats = statsResponse.data.data;
                
                console.log(`Check ${checkCount}:`);
                console.log(`- Total profiles: ${stats.profiles.total}`);
                console.log(`- Root profiles scraped: ${stats.profiles.rootProfiles.scraped}/${stats.profiles.rootProfiles.total}`);
                console.log(`- Related profiles by depth:`, stats.profiles.relatedProfiles.byDepth);
                
                // Get queue stats
                const queueResponse = await axios.get(`http://localhost:5000/api/sessions/${session._id}/queue-stats`);
                const queueStats = queueResponse.data.data;
                console.log(`- Queue status: Waiting=${queueStats.waiting}, Active=${queueStats.active}, Completed=${queueStats.completed}`);
                console.log('');
                
                if (checkCount >= 6) {  // Check for 30 seconds
                    clearInterval(checkInterval);
                    
                    console.log('\n=== FINAL RESULTS ===');
                    console.log(`Total profiles at depth 1: ${stats.profiles.relatedProfiles.byDepth[0]?.count || 0}`);
                    console.log(`Expected: 5 (due to maxProfilesPerDepth limit)`);
                    
                    if (stats.profiles.relatedProfiles.byDepth[0]?.count > 5) {
                        console.log('\n❌ FAILED: Limit was not enforced properly!');
                    } else {
                        console.log('\n✅ SUCCESS: Limit was enforced correctly!');
                    }
                    
                    // Stop the session
                    console.log('\nStopping session...');
                    await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
                    console.log('Session stopped.');
                }
            } catch (error) {
                console.error('Error during monitoring:', error.message);
            }
        }, 5000);  // Check every 5 seconds
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testLimitEnforcement();