const axios = require('axios');

async function debugTest() {
    try {
        console.log('DEBUG TEST: Creating session and checking what happens\n');
        
        // Create a session
        const sessionData = {
            name: `Debug Test ${Date.now()}`,
            description: 'Debug test',
            rootProfiles: ['https://www.instagram.com/cristiano/'],
            config: {
                maxDepth: 1,
                maxProfilesPerDepth: 5,
                analysisEnabled: false
            }
        };
        
        console.log('1. Creating session...');
        const createResponse = await axios.post('http://localhost:5000/api/sessions', sessionData);
        const session = createResponse.data.data;
        const profileInfo = createResponse.data.profilesInfo;
        
        console.log(`   Session ID: ${session._id}`);
        console.log(`   Profile Info:`, profileInfo);
        console.log('');
        
        console.log('2. Starting queue processing...');
        await axios.post(`http://localhost:5000/api/sessions/${session._id}/queue-process`);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('\n3. Checking queue stats...');
        const queueStats = await axios.get(`http://localhost:5000/api/sessions/${session._id}/queue-stats`);
        console.log(`   Queue stats:`, queueStats.data.data);
        
        console.log('\n4. Checking session stats...');
        const sessionStats = await axios.get(`http://localhost:5000/api/sessions/${session._id}/stats`);
        console.log(`   Session stats:`, sessionStats.data.data);
        
        // Stop the session
        await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
        console.log('\nSession stopped.');
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

debugTest();