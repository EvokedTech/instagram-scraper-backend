const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testRealProfiles() {
    console.log('Testing Instagram Profile Scraper with Real Profiles\n');
    
    // Test profiles - using popular public profiles
    const testProfiles = [
        'cristiano',       // Cristiano Ronaldo
        'leomessi',        // Lionel Messi
        'natgeo',          // National Geographic
        'nasa',            // NASA
        'instagram'        // Instagram official
    ];
    
    for (const username of testProfiles) {
        console.log(`\n📱 Testing profile: @${username}`);
        console.log('=' + '='.repeat(40));
        
        try {
            // First, create a session
            console.log('Creating session...');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`, {
                name: `Test - ${username} - ${timestamp}`,
                description: `Testing scraping for @${username}`,
                rootProfiles: [username]  // Add the username as root profile
            });
            
            const sessionId = sessionResponse.data.data._id;
            console.log(`✅ Session created: ${sessionId}`);
            
            // Now scrape the profile
            console.log(`\nScraping profile @${username}...`);
            const startTime = Date.now();
            
            const scrapeResponse = await axios.post(`${API_BASE_URL}/scraper/scrape/${username}`, {
                sessionId: sessionId,
                useApify: true
            });
            
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            if (scrapeResponse.data.success) {
                const profile = scrapeResponse.data.data;
                console.log(`\n✅ Successfully scraped @${username} in ${duration}s`);
                console.log('\nProfile Details:');
                console.log(`  - Username: ${profile.username || 'N/A'}`);
                console.log(`  - Full Name: ${profile.profileData?.fullName || 'N/A'}`);
                console.log(`  - Bio: ${profile.profileData?.biography ? profile.profileData.biography.substring(0, 100) + '...' : 'N/A'}`);
                console.log(`  - Followers: ${profile.profileData?.followersCount?.toLocaleString() || 'N/A'}`);
                console.log(`  - Following: ${profile.profileData?.followingCount?.toLocaleString() || 'N/A'}`);
                console.log(`  - Posts: ${profile.profileData?.postsCount?.toLocaleString() || 'N/A'}`);
                console.log(`  - Verified: ${profile.profileData?.isVerified ? '✓' : '✗'}`);
                console.log(`  - Business Account: ${profile.profileData?.isBusinessAccount ? '✓' : '✗'}`);
                console.log(`  - Profile URL: ${profile.profileUrl}`);
                
                if (profile.latestPosts && profile.latestPosts.length > 0) {
                    console.log(`  - Latest Posts: ${profile.latestPosts.length} posts captured`);
                }
            } else {
                console.log(`\n❌ Failed to scrape @${username}: ${scrapeResponse.data.message}`);
            }
            
        } catch (error) {
            console.log(`\n❌ Error testing @${username}:`);
            console.log(`  - ${error.response?.data?.message || error.message}`);
            if (error.response?.data?.error) {
                console.log(`  - Details: ${JSON.stringify(error.response.data.error)}`);
            }
        }
        
        // Add a small delay between requests to be respectful
        if (testProfiles.indexOf(username) < testProfiles.length - 1) {
            console.log('\nWaiting 3 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log('\n\n✅ All tests completed!');
}

// Run the tests
testRealProfiles().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
});