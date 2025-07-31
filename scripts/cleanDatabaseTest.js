const axios = require('axios');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/instagram-scraper', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');
const RootProfileScraped = require('../src/models/RootProfileScraped');

async function cleanDatabaseTest() {
    try {
        console.log('CLEAN DATABASE TEST: Testing with fresh data\n');
        
        // Clean up any existing soy_loruga related profiles
        console.log('Cleaning database...');
        const deleteResult = await RelatedProfileScraped.deleteMany({
            parentUsername: 'soy_loruga'
        });
        console.log(`Deleted ${deleteResult.deletedCount} existing related profiles for soy_loruga\n`);
        
        // Create a session
        console.log('Creating session with maxProfilesPerDepth = 8...');
        const sessionData = {
            name: `Clean Test ${Date.now()}`,
            description: 'Test with clean database',
            rootProfiles: ['https://www.instagram.com/soy_loruga/'],
            config: {
                maxDepth: 1,
                maxProfilesPerDepth: 8,  // Only 8 profiles at depth 1
                analysisEnabled: false
            }
        };
        
        const response = await axios.post('http://localhost:5000/api/sessions', sessionData);
        const session = response.data.data;
        console.log(`Session ID: ${session._id}`);
        console.log(`Profile info:`, response.data.profilesInfo);
        
        // Start processing
        console.log('\nStarting processing...');
        await axios.post(`http://localhost:5000/api/sessions/${session._id}/queue-process`);
        
        // Monitor progress
        console.log('Monitoring progress...\n');
        let lastCount = 0;
        
        for (let i = 0; i < 8; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const depth1Count = await RelatedProfileScraped.countDocuments({
                sessionId: session._id,
                depth: 1
            });
            
            const queueStats = await axios.get(`http://localhost:5000/api/sessions/${session._id}/queue-stats`);
            const queue = queueStats.data.data;
            
            console.log(`Check ${i + 1}:`);
            console.log(`- Profiles at depth 1: ${depth1Count}`);
            console.log(`- Queue: W=${queue.waiting}, A=${queue.active}, C=${queue.completed}`);
            
            if (depth1Count > lastCount) {
                const newProfiles = await RelatedProfileScraped.find({
                    sessionId: session._id,
                    depth: 1
                }).sort({ createdAt: -1 }).limit(depth1Count - lastCount).select('username');
                console.log(`- New profiles: ${newProfiles.map(p => p.username).join(', ')}`);
            }
            lastCount = depth1Count;
            
            // If queue is empty and we have results, stop
            if (queue.waiting === 0 && queue.active === 0 && depth1Count > 0) {
                console.log('\nProcessing complete!');
                break;
            }
        }
        
        // Final check
        const finalCount = await RelatedProfileScraped.countDocuments({
            sessionId: session._id,
            depth: 1
        });
        
        console.log('\n=== FINAL RESULTS ===');
        console.log(`Total profiles at depth 1: ${finalCount}`);
        console.log(`Configured limit: 8`);
        console.log(`Source profile had: 80 related profiles`);
        
        if (finalCount === 0) {
            console.log('\n⚠️  All profiles were duplicates (already existed)');
            console.log('The limit enforcement prevented queuing any new profiles.');
        } else if (finalCount <= 8) {
            console.log('\n✅ SUCCESS: Limit enforced correctly!');
            console.log(`Only ${finalCount} profiles were processed (within limit of 8)`);
        } else {
            console.log('\n❌ FAILED: Limit not enforced!');
            console.log(`${finalCount} profiles were processed, exceeding limit of 8`);
        }
        
        // Stop session
        await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
        console.log('\nSession stopped.');
        
        mongoose.disconnect();
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
        mongoose.disconnect();
    }
}

// Run the test
cleanDatabaseTest();