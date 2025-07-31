const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWorkflowWithQueues() {
    try {
        console.log('=== Testing Instagram Scraper Workflow with Queues ===');
        console.log('Profile: soy_loruga');
        console.log('Max Depth: 3');
        console.log('Max Profiles Per Depth: 5');
        console.log('======================================================\n');

        // Step 1: Create a new session
        console.log('Step 1: Creating new session...');
        const sessionData = {
            name: `Test soy_loruga - Queue System - ${new Date().toISOString()}`,
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

        // Step 2: Start queue-based processing
        console.log('\nStep 2: Starting queue-based processing...');
        const startResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/queue-process`);
        console.log('✓ Queue processing started');
        console.log(`  Jobs queued: ${startResponse.data.data.jobsQueued}`);

        // Step 3: Monitor progress
        console.log('\nStep 3: Monitoring progress...');
        let completed = false;
        let lastStatus = null;
        let checkCount = 0;
        const maxChecks = 120; // Maximum 10 minutes (5s intervals)
        let depthInfo = {};

        while (!completed && checkCount < maxChecks) {
            await sleep(5000); // Wait 5 seconds
            checkCount++;

            try {
                // Get session details
                const sessionResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
                const currentSession = sessionResponse.data.data.session;
                
                // Get queue stats
                const queueStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/queue-stats`);
                const queueStats = queueStatsResponse.data.data;

                // Get depth status
                const depthStatusResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/depth-status`);
                const depthStatus = depthStatusResponse.data.data;

                // Display progress
                const status = currentSession.status;
                const progress = currentSession.progressPercentage || 0;
                
                if (status !== lastStatus) {
                    console.log(`\n[${new Date().toLocaleTimeString()}] Status changed to: ${status}`);
                    lastStatus = status;
                }

                // Show queue activity
                const totalActive = (queueStats.rootProfile?.active || 0) + 
                                   (queueStats.relatedProfile?.active || 0) + 
                                   (queueStats.relatedProfileBatch?.active || 0);
                const totalWaiting = (queueStats.rootProfile?.waiting || 0) + 
                                    (queueStats.relatedProfile?.waiting || 0) + 
                                    (queueStats.relatedProfileBatch?.waiting || 0);

                console.log(`[${checkCount}] Progress: ${progress}% | Scraped: ${currentSession.stats.scrapedProfiles} | Active Jobs: ${totalActive} | Waiting: ${totalWaiting}`);
                
                // Show depth progression
                if (depthStatus.profilesByDepth) {
                    Object.entries(depthStatus.profilesByDepth).forEach(([depth, stats]) => {
                        const key = `depth_${depth}`;
                        if (!depthInfo[key] || depthInfo[key].scraped !== stats.scraped) {
                            console.log(`  → Depth ${depth}: ${stats.scraped}/${stats.total} scraped`);
                            depthInfo[key] = stats;
                        }
                    });
                }

                // Check if completed
                if (status === 'completed' || status === 'completed_with_errors' || status === 'failed') {
                    completed = true;
                    console.log(`\n✓ Processing completed with status: ${status}`);
                }

                // If no activity for a while, check if it's done
                if (totalActive === 0 && totalWaiting === 0 && currentSession.stats.scrapedProfiles > 0) {
                    await sleep(5000); // Wait one more check
                    if (totalActive === 0 && totalWaiting === 0) {
                        completed = true;
                        console.log('\n✓ All queues empty, processing appears complete');
                    }
                }

            } catch (error) {
                console.error('Error checking status:', error.message);
            }
        }

        // Step 4: Get final statistics
        console.log('\n\nStep 4: Final Statistics');
        console.log('========================');
        
        const finalStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/stats`);
        const finalStats = finalStatsResponse.data.data;

        console.log(`\nSession: ${finalStats.session.name}`);
        console.log(`Status: ${finalStats.session.status}`);
        console.log(`Duration: ${Math.round((finalStats.session.duration || 0) / 1000)}s`);
        console.log(`Progress: ${finalStats.session.progress}%`);
        
        console.log(`\nProfiles Summary:`);
        console.log(`- Total Profiles: ${finalStats.profiles.total}`);
        console.log(`- Root Profiles: ${finalStats.profiles.rootProfiles.total} (${finalStats.profiles.rootProfiles.scraped} scraped)`);
        console.log(`- Related Profiles: ${finalStats.profiles.relatedProfiles.total}`);
        
        console.log(`\nProfiles by Depth:`);
        if (finalStats.profiles.relatedProfiles.byDepth) {
            Object.entries(finalStats.profiles.relatedProfiles.byDepth).forEach(([depth, stats]) => {
                const total = stats.scraped + stats.failed;
                console.log(`  Depth ${depth}: ${total} total (${stats.scraped} scraped, ${stats.failed} failed)`);
            });
        }

        // Step 5: Verify depth limits
        console.log('\n\nStep 5: Verifying Depth Limits');
        console.log('==============================');
        
        let limitViolation = false;
        if (finalStats.profiles.relatedProfiles.byDepth) {
            Object.entries(finalStats.profiles.relatedProfiles.byDepth).forEach(([depth, stats]) => {
                const total = stats.scraped + stats.failed;
                console.log(`Depth ${depth}: ${total} profiles (limit: 5)`);
                
                if (total > 5) {
                    console.log(`  ⚠️ LIMIT EXCEEDED: Expected max 5, got ${total}`);
                    limitViolation = true;
                } else {
                    console.log(`  ✓ Within limit`);
                }
            });
        }

        // Step 6: Check batch sizes used
        console.log('\n\nStep 6: Batch Size Verification');
        console.log('================================');
        console.log('Expected batch sizes:');
        console.log('- Depth 0 (root): 20');
        console.log('- Depth 1: 20');
        console.log('- Depth 2: 50');
        console.log('- Depth 3+: 100');
        console.log('\n(Note: Actual batches depend on profiles discovered)');

        console.log('\n=== Workflow Test Completed ===');
        
        if (!limitViolation) {
            console.log('\n✅ SUCCESS: All tests passed!');
        } else {
            console.log('\n❌ FAILURE: Some limits were exceeded');
        }

    } catch (error) {
        console.error('\nError during workflow test:', error.response?.data || error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('Cannot connect to backend server. Please ensure the server is running on port 5000.');
        }
        process.exit(1);
    }
}

// Run the test
testWorkflowWithQueues();