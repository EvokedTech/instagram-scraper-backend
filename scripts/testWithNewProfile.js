const axios = require('axios');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/instagram-scraper', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');
const RootProfileScraped = require('../src/models/RootProfileScraped');

async function testWithNewProfile() {
    try {
        console.log('Testing maxProfilesPerDepth limit with a fresh profile...\n');
        
        // Use a different profile that's less likely to be in the database
        const testProfile = 'https://www.instagram.com/cristiano/';
        
        // First check if this profile exists
        const existing = await RootProfileScraped.findOne({ 
            profileUrl: testProfile,
            status: 'scraped'
        });
        
        if (existing) {
            console.log('Profile already exists in database. Deleting it for a clean test...');
            await RootProfileScraped.deleteMany({ profileUrl: testProfile });
            console.log('Deleted existing profile data.\n');
        }
        
        // Create a session with maxProfilesPerDepth = 10
        const sessionData = {
            name: `Test Limit Fresh ${Date.now()}`,
            description: 'Testing maxProfilesPerDepth limit enforcement',
            rootProfiles: [testProfile],
            config: {
                maxDepth: 2,
                maxProfilesPerDepth: 10,  // Allow 10 profiles per depth
                analysisEnabled: false
            }
        };
        
        console.log('Creating session with:');
        console.log('- Root profile: cristiano');
        console.log('- Max Depth: 2');
        console.log('- Max Profiles Per Depth: 10\n');
        
        const createResponse = await axios.post('http://localhost:5000/api/sessions', sessionData);
        const session = createResponse.data.data;
        
        console.log(`Session created: ${session.name}`);
        console.log(`Session ID: ${session._id}\n`);
        
        // Start processing
        console.log('Starting queued batch processing...');
        await axios.post(`http://localhost:5000/api/sessions/${session._id}/queue-process`);
        console.log('Processing started\n');
        
        // Monitor with direct database queries
        console.log('Monitoring session progress...\n');
        
        let checkCount = 0;
        let lastDepth1Count = 0;
        const checkInterval = setInterval(async () => {
            try {
                checkCount++;
                
                // Check root profile status
                const rootProfile = await RootProfileScraped.findOne({
                    sessionId: session._id,
                    profileUrl: testProfile
                });
                
                // Direct database query for depth 1 profiles
                const depth1Count = await RelatedProfileScraped.countDocuments({
                    sessionId: session._id,
                    depth: 1
                });
                
                // Get queue stats
                const queueResponse = await axios.get(`http://localhost:5000/api/sessions/${session._id}/queue-stats`);
                const queueStats = queueResponse.data.data;
                
                console.log(`Check ${checkCount}:`);
                console.log(`- Root profile status: ${rootProfile?.status || 'not found'}`);
                console.log(`- Profiles at depth 1: ${depth1Count}`);
                console.log(`- Queue: Waiting=${queueStats.waiting}, Active=${queueStats.active}, Completed=${queueStats.completed}`);
                
                // Show some profile names at depth 1 if count increased
                if (depth1Count > lastDepth1Count) {
                    const newProfiles = await RelatedProfileScraped.find({
                        sessionId: session._id,
                        depth: 1
                    }).sort({ createdAt: -1 }).limit(5).select('username');
                    
                    console.log(`- New depth 1 profiles: ${newProfiles.map(p => p.username).join(', ')}`);
                }
                lastDepth1Count = depth1Count;
                console.log('');
                
                // Check if processing is complete or timeout
                if ((queueStats.waiting === 0 && queueStats.active === 0 && queueStats.completed > 0 && checkCount >= 3) || checkCount >= 20) {
                    clearInterval(checkInterval);
                    
                    console.log('\n=== FINAL RESULTS ===');
                    console.log(`Root profile status: ${rootProfile?.status}`);
                    console.log(`Profiles at depth 1: ${depth1Count}`);
                    console.log(`Expected: Max 10 (due to maxProfilesPerDepth limit)`);
                    
                    if (depth1Count > 10) {
                        console.log(`\n❌ FAILED: System processed ${depth1Count} profiles instead of max 10!`);
                        console.log('The limit enforcement is NOT working!');
                    } else if (depth1Count > 0 && depth1Count <= 10) {
                        console.log('\n✅ SUCCESS: Limit was enforced correctly!');
                        console.log(`System processed ${depth1Count} profiles (within the limit of 10)`);
                    } else {
                        console.log(`\n⚠️  WARNING: No profiles were processed at depth 1`);
                        console.log('This might indicate the profile has no related profiles or there was an error.');
                    }
                    
                    // Stop the session
                    console.log('\nStopping session...');
                    await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
                    console.log('Session stopped.');
                    
                    mongoose.disconnect();
                }
            } catch (error) {
                console.error('Error during monitoring:', error.message);
                clearInterval(checkInterval);
                mongoose.disconnect();
            }
        }, 3000);  // Check every 3 seconds
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
        mongoose.disconnect();
    }
}

// Run the test
testWithNewProfile();