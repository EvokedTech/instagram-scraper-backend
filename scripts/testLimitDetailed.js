const axios = require('axios');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/instagram-scraper', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');

async function testLimitDetailed() {
    try {
        console.log('Testing maxProfilesPerDepth limit enforcement (detailed)...\n');
        
        // Create a session with maxProfilesPerDepth = 5
        const sessionData = {
            name: `Test Limit Detailed ${Date.now()}`,
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
        
        // Monitor with direct database queries
        console.log('Monitoring session progress...\n');
        
        let checkCount = 0;
        const checkInterval = setInterval(async () => {
            try {
                checkCount++;
                
                // Direct database query for depth 1 profiles
                const depth1Count = await RelatedProfileScraped.countDocuments({
                    sessionId: session._id,
                    depth: 1
                });
                
                const depth2Count = await RelatedProfileScraped.countDocuments({
                    sessionId: session._id,
                    depth: 2
                });
                
                // Get queue stats
                const queueResponse = await axios.get(`http://localhost:5000/api/sessions/${session._id}/queue-stats`);
                const queueStats = queueResponse.data.data;
                
                console.log(`Check ${checkCount}:`);
                console.log(`- Profiles at depth 1: ${depth1Count}`);
                console.log(`- Profiles at depth 2: ${depth2Count}`);
                console.log(`- Queue: Waiting=${queueStats.waiting}, Active=${queueStats.active}, Completed=${queueStats.completed}`);
                
                // Show some profile names at depth 1
                if (depth1Count > 0) {
                    const depth1Profiles = await RelatedProfileScraped.find({
                        sessionId: session._id,
                        depth: 1
                    }).limit(10).select('username status');
                    
                    console.log('- Depth 1 profiles:', depth1Profiles.map(p => `${p.username}(${p.status})`).join(', '));
                }
                console.log('');
                
                // Check if processing is complete
                if (queueStats.waiting === 0 && queueStats.active === 0 && checkCount >= 4) {
                    clearInterval(checkInterval);
                    
                    console.log('\n=== FINAL RESULTS ===');
                    console.log(`Profiles at depth 1: ${depth1Count}`);
                    console.log(`Expected: 5 (due to maxProfilesPerDepth limit)`);
                    
                    if (depth1Count > 5) {
                        console.log(`\n❌ FAILED: System processed ${depth1Count} profiles instead of 5!`);
                    } else if (depth1Count === 5) {
                        console.log('\n✅ SUCCESS: Limit was enforced correctly!');
                    } else {
                        console.log(`\n⚠️  WARNING: Only ${depth1Count} profiles processed (less than limit)`);
                    }
                    
                    // Stop the session
                    console.log('\nStopping session...');
                    await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
                    console.log('Session stopped.');
                    
                    // Disconnect from MongoDB
                    mongoose.disconnect();
                }
            } catch (error) {
                console.error('Error during monitoring:', error.message);
            }
        }, 3000);  // Check every 3 seconds
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
        mongoose.disconnect();
    }
}

// Run the test
testLimitDetailed();