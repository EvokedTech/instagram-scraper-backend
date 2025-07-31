const axios = require('axios');
const logger = require('../../src/utils/logger');

const API_BASE_URL = 'http://localhost:5000/api';

async function testWorkflowWithLimitedDepth() {
    try {
        console.log('=== Testing Instagram Scraper Workflow ===');
        console.log('Profile: soy_loruga');
        console.log('Max Depth: 3');
        console.log('Max Profiles Per Depth: 5');
        console.log('=========================================\n');

        // Step 1: Create a new session
        console.log('Step 1: Creating new session...');
        const sessionData = {
            name: `Test soy_loruga - Depth 3 Limited - ${new Date().toISOString()}`,
            description: 'Testing with maxDepth=3 and maxProfilesPerDepth=5',
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

        // Step 2: Start batch processing using queues
        console.log('\nStep 2: Starting queued batch processing...');
        const startResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/start-queued-batch`);
        console.log('✓ Batch processing started');
        console.log(`  Jobs queued: ${startResponse.data.data.jobsQueued}`);

        // Step 3: Monitor progress
        console.log('\nStep 3: Monitoring progress...');
        let completed = false;
        let lastStatus = null;
        let depthStats = {};

        while (!completed) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

            // Get session details
            const sessionResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
            const currentSession = sessionResponse.data.data.session;
            
            // Get queue stats
            const queueStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/queue-stats`);
            const queueStats = queueStatsResponse.data.data;

            // Get depth processing status
            const depthStatusResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/depth-status`);
            const depthStatus = depthStatusResponse.data.data;

            // Display progress
            const status = currentSession.status;
            const progress = currentSession.progressPercentage || 0;
            
            if (status !== lastStatus) {
                console.log(`\n[${new Date().toLocaleTimeString()}] Status: ${status}`);
                lastStatus = status;
            }

            console.log(`Progress: ${progress}% | Scraped: ${currentSession.stats.scrapedProfiles} | Current Depth: ${currentSession.stats.currentDepth}`);
            
            // Display queue information
            console.log(`Queues - Root: ${queueStats.rootProfile.active}/${queueStats.rootProfile.waiting} | ` +
                       `Related: ${queueStats.relatedProfile.active}/${queueStats.relatedProfile.waiting} | ` +
                       `Batch: ${queueStats.relatedProfileBatch.active}/${queueStats.relatedProfileBatch.waiting}`);

            // Display depth information
            if (depthStatus.profilesByDepth) {
                Object.entries(depthStatus.profilesByDepth).forEach(([depth, stats]) => {
                    if (!depthStats[depth] || depthStats[depth].scraped !== stats.scraped) {
                        console.log(`  Depth ${depth}: ${stats.scraped}/${stats.total} scraped (${stats.pending} pending, ${stats.failed} failed)`);
                        depthStats[depth] = stats;
                    }
                });
            }

            // Check if completed
            if (status === 'completed' || status === 'completed_with_errors' || status === 'failed') {
                completed = true;
            }
        }

        // Step 4: Get final statistics
        console.log('\n\nStep 4: Final Statistics');
        console.log('========================');
        
        const finalStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/stats`);
        const finalStats = finalStatsResponse.data.data;

        console.log(`\nSession: ${finalStats.session.name}`);
        console.log(`Status: ${finalStats.session.status}`);
        console.log(`Duration: ${Math.round(finalStats.session.duration / 1000)}s`);
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

        // Step 5: Verify the limit is working
        console.log('\n\nStep 5: Verifying maxProfilesPerDepth Limit');
        console.log('==========================================');
        
        const depthLimitCheck = finalStats.profiles.relatedProfiles.byDepth;
        let limitViolation = false;
        
        Object.entries(depthLimitCheck || {}).forEach(([depth, stats]) => {
            const totalAtDepth = stats.scraped + stats.failed;
            console.log(`Depth ${depth}: ${totalAtDepth} profiles processed (limit: 5)`);
            if (totalAtDepth > 5) {
                console.log(`  ⚠️ LIMIT VIOLATION: Processed ${totalAtDepth} profiles, expected max 5`);
                limitViolation = true;
            } else {
                console.log(`  ✓ Within limit`);
            }
        });

        if (!limitViolation) {
            console.log('\n✅ All depth limits were respected!');
        } else {
            console.log('\n❌ Some depth limits were exceeded!');
        }

        console.log('\n=== Workflow Test Completed ===');

    } catch (error) {
        console.error('Error during workflow test:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Run the test
testWorkflowWithLimitedDepth();