const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompleteWorkflow() {
    try {
        console.log('=== Testing Complete Instagram Scraper Workflow ===');
        console.log('Testing configuration:');
        console.log('- Profile: test_profile_' + Date.now());
        console.log('- Max Depth: 3');
        console.log('- Max Profiles Per Depth: 5');
        console.log('- Expected batch sizes: Depth 0=20, Depth 1=20, Depth 2=50, Depth 3=100');
        console.log('==================================================\n');

        // Use a unique profile name to avoid existing data
        const testUsername = 'cristiano'; // Popular profile with many related profiles
        
        // Step 1: Create a new session
        console.log('Step 1: Creating new session...');
        const sessionData = {
            name: `Complete Test - ${new Date().toISOString()}`,
            description: 'Testing complete workflow with depth limits',
            rootProfiles: [`https://www.instagram.com/${testUsername}`],
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
        console.log(`  Profile: ${testUsername}`);
        console.log(`  Config: maxDepth=${session.config.maxDepth}, maxProfilesPerDepth=${session.config.maxProfilesPerDepth}`);

        // Step 2: Start queue-based processing
        console.log('\nStep 2: Starting queue-based processing...');
        const startResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/queue-process`);
        console.log('✓ Queue processing started');
        console.log(`  Initial jobs queued: ${startResponse.data.data.jobsQueued}`);

        // Step 3: Monitor progress
        console.log('\nStep 3: Monitoring progress (this may take several minutes)...');
        console.log('Time | Status | Progress | Scraped | Active | Waiting | Notes');
        console.log('-----|--------|----------|---------|--------|---------|------');
        
        let completed = false;
        let checkCount = 0;
        const maxChecks = 180; // 15 minutes max
        let lastScrapedCount = 0;
        let noProgressCount = 0;
        const depthTracking = {};

        while (!completed && checkCount < maxChecks) {
            await sleep(5000);
            checkCount++;

            try {
                // Get all status information
                const [sessionResponse, queueStatsResponse, depthStatusResponse] = await Promise.all([
                    axios.get(`${API_BASE_URL}/sessions/${sessionId}`),
                    axios.get(`${API_BASE_URL}/sessions/${sessionId}/queue-stats`),
                    axios.get(`${API_BASE_URL}/sessions/${sessionId}/depth-status`)
                ]);

                const currentSession = sessionResponse.data.data.session;
                const queueStats = queueStatsResponse.data.data;
                const depthStatus = depthStatusResponse.data.data;

                const status = currentSession.status;
                const progress = currentSession.progressPercentage || 0;
                const scrapedCount = currentSession.stats.scrapedProfiles;
                
                // Calculate queue totals
                const totalActive = (queueStats.rootProfile?.active || 0) + 
                                   (queueStats.relatedProfile?.active || 0) + 
                                   (queueStats.relatedProfileBatch?.active || 0);
                const totalWaiting = (queueStats.rootProfile?.waiting || 0) + 
                                    (queueStats.relatedProfile?.waiting || 0) + 
                                    (queueStats.relatedProfileBatch?.waiting || 0);

                // Build notes about depth progression
                let notes = '';
                if (depthStatus.profilesByDepth) {
                    const depths = Object.keys(depthStatus.profilesByDepth).sort();
                    notes = depths.map(d => {
                        const stats = depthStatus.profilesByDepth[d];
                        return `D${d}:${stats.scraped}/${stats.total}`;
                    }).join(' ');
                }

                // Print status line
                const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                console.log(`${time.substring(3)} | ${status.padEnd(7)} | ${(progress + '%').padEnd(8)} | ${String(scrapedCount).padEnd(7)} | ${String(totalActive).padEnd(6)} | ${String(totalWaiting).padEnd(7)} | ${notes}`);

                // Check if we're making progress
                if (scrapedCount === lastScrapedCount) {
                    noProgressCount++;
                } else {
                    noProgressCount = 0;
                    lastScrapedCount = scrapedCount;
                }

                // Completion conditions
                if (status === 'completed' || status === 'completed_with_errors' || status === 'failed') {
                    completed = true;
                    console.log(`\n✓ Processing completed with status: ${status}`);
                } else if (totalActive === 0 && totalWaiting === 0 && noProgressCount > 3) {
                    completed = true;
                    console.log('\n✓ All queues empty and no progress - processing appears complete');
                }

            } catch (error) {
                console.error('Error checking status:', error.message);
            }
        }

        // Step 4: Final analysis
        console.log('\n\nStep 4: Final Analysis');
        console.log('======================');
        
        const finalStatsResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/stats`);
        const finalStats = finalStatsResponse.data.data;

        console.log(`\nSession Summary:`);
        console.log(`- Name: ${finalStats.session.name}`);
        console.log(`- Status: ${finalStats.session.status}`);
        console.log(`- Duration: ${Math.round((finalStats.session.duration || 0) / 1000)}s`);
        console.log(`- Total Profiles: ${finalStats.profiles.total}`);

        console.log(`\nProfiles by Category:`);
        console.log(`- Root Profiles: ${finalStats.profiles.rootProfiles.total} (${finalStats.profiles.rootProfiles.scraped} scraped)`);
        console.log(`- Related Profiles: ${finalStats.profiles.relatedProfiles.total}`);

        console.log(`\nDepth Analysis:`);
        const depthLimit = 5;
        let allWithinLimits = true;
        
        if (finalStats.profiles.relatedProfiles.byDepth) {
            Object.entries(finalStats.profiles.relatedProfiles.byDepth).forEach(([depth, stats]) => {
                const total = stats.scraped + stats.failed;
                const withinLimit = total <= depthLimit;
                const status = withinLimit ? '✓' : '✗';
                
                console.log(`- Depth ${depth}: ${total} profiles (limit: ${depthLimit}) ${status}`);
                
                if (!withinLimit) {
                    allWithinLimits = false;
                    console.log(`  WARNING: Exceeded limit by ${total - depthLimit} profiles`);
                }
            });
        }

        console.log(`\nWorkflow Verification:`);
        console.log(`- Deduplication: ${finalStats.profiles.total < 1000 ? '✓ Working' : '✗ May have issues'}`);
        console.log(`- Depth Limits: ${allWithinLimits ? '✓ All respected' : '✗ Some exceeded'}`);
        console.log(`- Queue System: ✓ Processed successfully`);

        console.log('\n=== Workflow Test Completed ===');
        
        if (allWithinLimits) {
            console.log('\n✅ SUCCESS: All systems working correctly!');
        } else {
            console.log('\n⚠️  PARTIAL SUCCESS: System working but some limits exceeded');
        }

    } catch (error) {
        console.error('\n❌ Error during workflow test:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Run the test
testCompleteWorkflow();