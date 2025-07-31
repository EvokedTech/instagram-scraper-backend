const axios = require('axios');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/instagram-scraper', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');

async function verifyLimitEnforcement() {
    try {
        console.log('FINAL VERIFICATION: Testing limit enforcement\n');
        
        // Use a profile we know has many related profiles
        const testProfile = 'https://www.instagram.com/soy_loruga/';
        
        // Create TWO sessions to test cumulative limit
        console.log('Creating first session with limit of 3...');
        const session1Data = {
            name: `Verify Test 1 - ${Date.now()}`,
            description: 'First session with limit 3',
            rootProfiles: [testProfile],
            config: {
                maxDepth: 1,
                maxProfilesPerDepth: 3,
                analysisEnabled: false
            }
        };
        
        const response1 = await axios.post('http://localhost:5000/api/sessions', session1Data);
        const session1 = response1.data.data;
        console.log(`Session 1 ID: ${session1._id}`);
        console.log(`Existing profile info:`, response1.data.profilesInfo);
        
        // Start processing
        await axios.post(`http://localhost:5000/api/sessions/${session1._id}/queue-process`);
        console.log('Processing started for session 1\n');
        
        // Wait for processing
        console.log('Waiting 10 seconds for processing...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check results
        const depth1Count1 = await RelatedProfileScraped.countDocuments({
            sessionId: session1._id,
            depth: 1
        });
        
        console.log(`Session 1 Results:`);
        console.log(`- Profiles at depth 1: ${depth1Count1}`);
        console.log(`- Expected: 3 (limit)`);
        console.log(`- Status: ${depth1Count1 <= 3 ? '✅ PASS' : '❌ FAIL'}\n`);
        
        // Now create a second session with a different limit
        console.log('Creating second session with limit of 7...');
        const session2Data = {
            name: `Verify Test 2 - ${Date.now()}`,
            description: 'Second session with limit 7',
            rootProfiles: [testProfile],
            config: {
                maxDepth: 1,
                maxProfilesPerDepth: 7,
                analysisEnabled: false
            }
        };
        
        const response2 = await axios.post('http://localhost:5000/api/sessions', session2Data);
        const session2 = response2.data.data;
        console.log(`Session 2 ID: ${session2._id}`);
        
        // Start processing
        await axios.post(`http://localhost:5000/api/sessions/${session2._id}/queue-process`);
        console.log('Processing started for session 2\n');
        
        // Wait for processing
        console.log('Waiting 10 seconds for processing...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check results
        const depth1Count2 = await RelatedProfileScraped.countDocuments({
            sessionId: session2._id,
            depth: 1
        });
        
        console.log(`Session 2 Results:`);
        console.log(`- Profiles at depth 1: ${depth1Count2}`);
        console.log(`- Expected: 7 (limit)`);
        console.log(`- Status: ${depth1Count2 <= 7 ? '✅ PASS' : '❌ FAIL'}\n`);
        
        // Final summary
        console.log('=== FINAL SUMMARY ===');
        if (depth1Count1 <= 3 && depth1Count2 <= 7) {
            console.log('✅ SUCCESS: Limit enforcement is working correctly!');
            console.log('Each session respects its own maxProfilesPerDepth limit.');
        } else {
            console.log('❌ FAILED: Limit enforcement is NOT working!');
            if (depth1Count1 > 3) {
                console.log(`Session 1 processed ${depth1Count1} profiles instead of max 3`);
            }
            if (depth1Count2 > 7) {
                console.log(`Session 2 processed ${depth1Count2} profiles instead of max 7`);
            }
        }
        
        // Stop both sessions
        await axios.post(`http://localhost:5000/api/sessions/${session1._id}/stop`);
        await axios.post(`http://localhost:5000/api/sessions/${session2._id}/stop`);
        console.log('\nBoth sessions stopped.');
        
        mongoose.disconnect();
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
        mongoose.disconnect();
    }
}

// Run the verification
verifyLimitEnforcement();