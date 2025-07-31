const axios = require('axios');

async function stopAllRunningSessions() {
    try {
        console.log('Fetching all running sessions...');
        
        // Get all running sessions
        const response = await axios.get('http://localhost:5000/api/sessions?status=running');
        const sessions = response.data.data;
        
        if (sessions.length === 0) {
            console.log('No running sessions found.');
            return;
        }
        
        console.log(`Found ${sessions.length} running session(s):\n`);
        
        // Stop each session
        for (const session of sessions) {
            console.log(`Stopping: ${session.name}`);
            console.log(`  ID: ${session._id}`);
            console.log(`  Created: ${new Date(session.createdAt).toLocaleString()}`);
            
            try {
                const stopResponse = await axios.post(`http://localhost:5000/api/sessions/${session._id}/stop`);
                console.log(`  ✓ Stopped successfully\n`);
            } catch (error) {
                console.log(`  ✗ Failed to stop: ${error.response?.data?.error || error.message}\n`);
            }
        }
        
        console.log('All sessions have been processed.');
        
    } catch (error) {
        console.error('Error fetching sessions:', error.response?.data || error.message);
    }
}

// Run the function
stopAllRunningSessions();