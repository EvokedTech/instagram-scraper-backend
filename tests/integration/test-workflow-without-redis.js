const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testWorkflowWithoutRedis() {
    try {
        console.log('=== Testing Instagram Scraper Workflow (Without Redis) ===');
        console.log('Profile: soy_loruga');
        console.log('Max Depth: 3');
        console.log('Max Profiles Per Depth: 5');
        console.log('=========================================================\n');

        // Step 1: Create a new session
        console.log('Step 1: Creating new session...');
        const sessionData = {
            name: `Test soy_loruga - No Redis - ${new Date().toISOString()}`,
            description: 'Testing with maxDepth=3 and maxProfilesPerDepth=5 without Redis',
            rootProfiles: ['https://www.instagram.com/soy_loruga'],
            config: {
                maxDepth: 3,
                maxProfilesPerDepth: 5,
                analysisEnabled: false
            }
        };

        const createResponse = await axios.post(`${API_BASE_URL}/sessions`, sessionData);
        const session = createResponse.data.data;
        const sessionId = session._id;
        
        console.log(`✓ Session created: ${session.name}`);
        console.log(`  Session ID: ${sessionId}`);
        console.log(`  Config: maxDepth=${session.config.maxDepth}, maxProfilesPerDepth=${session.config.maxProfilesPerDepth}`);

        // Check if profile already exists
        if (createResponse.data.profilesInfo && createResponse.data.profilesInfo.existing > 0) {
            console.log(`\n⚠️  Found ${createResponse.data.profilesInfo.existing} existing profile(s) in database`);
            console.log(`  New profiles to scrape: ${createResponse.data.profilesInfo.new}`);
            
            if (createResponse.data.profilesInfo.existingProfiles) {
                createResponse.data.profilesInfo.existingProfiles.forEach(profile => {
                    console.log(`  - @${profile.username} (${profile.relatedProfilesCount} related profiles)`);
                });
            }
        }

        // Step 2: Start batch processing (non-queued version)
        console.log('\nStep 2: Starting batch processing (without queues)...');
        const startResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/start-batch`);
        console.log('✓ Batch processing started');

        // Step 3: Start depth processing
        console.log('\nStep 3: Starting depth processing...');
        setTimeout(async () => {
            try {
                const depthResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/start-depth-processing`);
                console.log('✓ Depth processing started');
            } catch (error) {
                console.error('Error starting depth processing:', error.response?.data || error.message);
            }
        }, 5000);

        // Step 4: Monitor progress
        console.log('\nStep 4: Monitoring progress...');
        let completed = false;
        let lastStatus = null;
        let checkCount = 0;
        const maxChecks = 60; // Maximum 5 minutes

        while (!completed && checkCount < maxChecks) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            checkCount++;

            try {
                // Get session details
                const sessionResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
                const currentSession = sessionResponse.data.data.session;
                
                // Display progress
                const status = currentSession.status;
                const progress = currentSession.progressPercentage || 0;
                
                if (status !== lastStatus) {
                    console.log(`\n[${new Date().toLocaleTimeString()}] Status: ${status}`);
                    lastStatus = status;
                }

                console.log(`Progress: ${progress}% | Scraped: ${currentSession.stats.scrapedProfiles}/${currentSession.stats.totalProfiles} | Current Depth: ${currentSession.stats.currentDepth}`);

                // Check if completed
                if (status === 'completed' || status === 'completed_with_errors' || status === 'failed' || progress === 100) {
                    completed = true;
                }
            } catch (error) {
                console.error('Error checking status:', error.message);
            }
        }

        // Step 5: Get final statistics
        console.log('\n\nStep 5: Final Statistics');
        console.log('========================');
        
        try {
            const finalStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/stats`);
            const finalStats = finalStatsResponse.data.data;

            console.log(`\nSession: ${finalStats.session.name}`);
            console.log(`Status: ${finalStats.session.status}`);
            console.log(`Duration: ${Math.round((finalStats.session.duration || 0) / 1000)}s`);
            console.log(`\nProfiles Summary:`);
            console.log(`- Total Profiles: ${finalStats.profiles.total}`);
            console.log(`- Root Profiles: ${finalStats.profiles.rootProfiles.total} (${finalStats.profiles.rootProfiles.scraped} scraped)`);
            console.log(`- Related Profiles: ${finalStats.profiles.relatedProfiles.total}`);
            
            console.log(`\nProfiles by Depth:`);
            if (finalStats.profiles.relatedProfiles.byDepth) {
                Object.entries(finalStats.profiles.relatedProfiles.byDepth).forEach(([depth, stats]) => {
                    console.log(`  Depth ${depth}: ${stats.scraped} scraped, ${stats.failed} failed`);
                });
            }
        } catch (error) {
            console.error('Error getting final stats:', error.message);
        }

        console.log('\n=== Workflow Test Completed ===');

    } catch (error) {
        console.error('Error during workflow test:', error.response?.data || error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('\n❌ Cannot connect to backend server. Please ensure the server is running on port 5000.');
        }
        process.exit(1);
    }
}

// Run the test
testWorkflowWithoutRedis();