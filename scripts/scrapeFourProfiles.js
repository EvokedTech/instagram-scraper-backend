require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const apifyService = require('../src/services/apifyService');
const logger = require('../src/utils/logger');

const profilesToScrape = [
    'https://www.instagram.com/julmodelsagency/',
    'https://www.instagram.com/xolod2/',
    'https://www.instagram.com/fer_portrait/',
    'https://www.instagram.com/thejoakimkarlsson/'
];

async function scrapeProfile(profileUrl) {
    try {
        const username = profileUrl.match(/instagram\.com\/([^\/]+)/)[1];
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 SCRAPING: @${username}`);
        console.log(`   URL: ${profileUrl}`);
        console.log(`${'='.repeat(80)}`);

        // Create a session ID for this scraping batch
        const sessionId = new mongoose.Types.ObjectId().toString();
        console.log(`📋 Session ID: ${sessionId}`);

        // Start scraping with Apify
        console.log(`\n🚀 Starting Apify scraper...`);
        const startTime = Date.now();

        const result = await apifyService.scrapeProfile(profileUrl, {
            sessionId,
            resultsLimit: 12,  // Get 12 recent posts
            addParentData: true
        });

        const scrapingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Scraping completed in ${scrapingTime} seconds`);

        if (result.success && result.savedProfile) {
            console.log(`\n📊 Profile Stats:`);
            console.log(`   Username: @${result.savedProfile.username}`);
            console.log(`   Full Name: ${result.savedProfile.fullName || 'N/A'}`);
            console.log(`   Followers: ${result.savedProfile.followersCount?.toLocaleString() || 0}`);
            console.log(`   Following: ${result.savedProfile.followingCount?.toLocaleString() || 0}`);
            console.log(`   Posts: ${result.savedProfile.postsCount?.toLocaleString() || 0}`);
            console.log(`   Bio: ${(result.savedProfile.biography || '').substring(0, 100)}${result.savedProfile.biography?.length > 100 ? '...' : ''}`);
            console.log(`\n✅ Profile saved to database`);
            console.log(`   Database ID: ${result.savedProfile._id}`);
            console.log(`   Collection: RootProfileScraped`);

            // Check if posts were saved
            if (result.posts && result.posts.length > 0) {
                console.log(`   Posts saved: ${result.posts.length}`);
            }

            return {
                success: true,
                username,
                profileId: result.savedProfile._id,
                followers: result.savedProfile.followersCount,
                posts: result.savedProfile.postsCount
            };
        } else {
            console.log(`❌ Failed to scrape profile: ${result.error || 'Unknown error'}`);
            return {
                success: false,
                username,
                error: result.error
            };
        }

    } catch (error) {
        console.error(`❌ Error scraping ${profileUrl}:`, error.message);
        return {
            success: false,
            url: profileUrl,
            error: error.message
        };
    }
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 INSTAGRAM PROFILE SCRAPER');
    console.log('='.repeat(80));
    console.log('\nProfiles to scrape:');
    profilesToScrape.forEach(url => {
        const username = url.match(/instagram\.com\/([^\/]+)/)[1];
        console.log(`  - @${username}`);
    });

    try {
        // Connect to database
        await connectDB();
        console.log('\n✅ Connected to MongoDB');

        const results = {
            successful: [],
            failed: []
        };

        // Scrape each profile
        for (const profileUrl of profilesToScrape) {
            const result = await scrapeProfile(profileUrl);

            if (result.success) {
                results.successful.push(result);
            } else {
                results.failed.push(result);
            }

            // Add a small delay between requests to avoid rate limiting
            if (profilesToScrape.indexOf(profileUrl) < profilesToScrape.length - 1) {
                console.log('\n⏳ Waiting 3 seconds before next profile...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // Display summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 SCRAPING SUMMARY');
        console.log('='.repeat(80));

        console.log(`\n✅ Successfully Scraped: ${results.successful.length}`);
        results.successful.forEach(item => {
            console.log(`\n   @${item.username}:`);
            console.log(`     Profile ID: ${item.profileId}`);
            console.log(`     Followers: ${item.followers?.toLocaleString() || 0}`);
            console.log(`     Posts: ${item.posts?.toLocaleString() || 0}`);
        });

        if (results.failed.length > 0) {
            console.log(`\n❌ Failed: ${results.failed.length}`);
            results.failed.forEach(item => {
                console.log(`   - @${item.username}: ${item.error}`);
            });
        }

        console.log('\n' + '='.repeat(80));
        console.log('💾 All profiles saved to MongoDB database');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n❌ Script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        console.log('\n✅ Scraping complete!');
        process.exit(0);
    }
}

// Run the script
console.log('Starting Instagram profile scraper...');
main();