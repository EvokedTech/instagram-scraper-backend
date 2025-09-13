require('dotenv').config();
const mongoose = require('mongoose');
const apifyService = require('../src/services/apifyService');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const AnalyzedRelatedProfile = require('../src/models/AnalyzedRelatedProfile');
const Session = require('../src/models/Session');
const logger = require('../src/utils/logger');

async function testScrapeAndAnalyze() {
    console.log('\n' + '='.repeat(70));
    console.log('🔄 TESTING COMPLETE SCRAPE → ANALYZE → SAVE FLOW');
    console.log('='.repeat(70));

    try {
        // Connect to database
        await connectDB();
        console.log('✅ Connected to MongoDB\n');

        // Create a test session
        const session = new Session({
            name: 'Test Scrape & Analyze',
            description: 'Testing AI analysis integration',
            targetProfiles: ['https://www.instagram.com/test_profile/'],
            settings: {
                maxProfiles: 1,
                includeRelatedProfiles: false,
                maxDepth: 0
            },
            status: 'running'
        });
        await session.save();
        console.log(`✅ Created test session: ${session._id}\n`);

        // Test profile URL (use a small/test account)
        const testProfileUrl = 'https://www.instagram.com/nike/';
        console.log(`🎯 Target Profile: ${testProfileUrl}`);
        console.log('-'.repeat(50));

        // Step 1: Scrape the profile
        console.log('\n📥 STEP 1: SCRAPING PROFILE...');
        console.log('-'.repeat(50));

        const startTime = Date.now();
        const scrapedProfile = await apifyService.scrapeProfile(
            testProfileUrl,
            true, // isRootProfile
            session._id.toString(),
            { depth: 0 }
        );

        const scrapeTime = Date.now() - startTime;
        console.log(`✅ Profile scraped in ${(scrapeTime / 1000).toFixed(2)} seconds`);
        console.log(`   Username: ${scrapedProfile.username}`);
        console.log(`   Status: ${scrapedProfile.status}`);
        console.log(`   Profile ID: ${scrapedProfile._id}`);

        // Step 2: Wait for AI analysis to complete
        console.log('\n🤖 STEP 2: WAITING FOR AI ANALYSIS...');
        console.log('-'.repeat(50));

        // Wait a bit for async analysis to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 3: Check if analysis was saved
        console.log('\n💾 STEP 3: CHECKING SAVED ANALYSIS...');
        console.log('-'.repeat(50));

        const savedAnalysis = await AnalyzedRelatedProfile.findOne({
            sourceProfileId: scrapedProfile._id,
            sessionId: session._id
        });

        if (savedAnalysis) {
            console.log('✅ Analysis found in database!');
            console.log(`   Analysis ID: ${savedAnalysis._id}`);
            console.log(`   Status: ${savedAnalysis.analysisStatus}`);
            console.log(`   Model Used: ${savedAnalysis.analysisData.modelUsed || 'Unknown'}`);
            console.log(`   From Cache: ${savedAnalysis.analysisData.fromCache || false}`);

            // Display analysis results
            console.log('\n📊 ANALYSIS RESULTS:');
            console.log('-'.repeat(50));

            const data = savedAnalysis.analysisData;
            console.log(`Profile Type: ${data.profileType || 'N/A'}`);
            console.log(`Engagement Rate: ${data.engagementRate || 'N/A'}`);
            console.log(`Audience Quality: ${data.audienceQuality || 'N/A'}`);
            console.log(`Growth Potential: ${data.growthPotential || 'N/A'}`);

            if (data.authenticity) {
                console.log(`Authenticity Score: ${data.authenticity.score}/10`);
            }

            if (data.estimatedValue) {
                console.log(`\n💰 Estimated Value:`);
                console.log(`   Tier: ${data.estimatedValue.tier}`);
                console.log(`   Monthly Value: ${data.estimatedValue.monthlyValue}`);
            }

            if (data.keyInsights && data.keyInsights.length > 0) {
                console.log(`\n🔍 Key Insights:`);
                data.keyInsights.slice(0, 3).forEach((insight, i) => {
                    console.log(`   ${i + 1}. ${insight}`);
                });
            }

            console.log('\n' + '='.repeat(70));
            console.log('✅ COMPLETE FLOW TEST SUCCESSFUL!');
            console.log('='.repeat(70));
            console.log('\nThe system successfully:');
            console.log('1. Scraped the Instagram profile');
            console.log('2. Triggered AI analysis automatically');
            console.log('3. Saved analysis results to database');

        } else {
            console.log('❌ No analysis found in database');
            console.log('   This might mean:');
            console.log('   - AI analysis is still processing (try waiting longer)');
            console.log('   - Analysis failed (check logs for errors)');
            console.log('   - Integration issue (check triggerAIAnalysis method)');
        }

        // Check profile analysis status
        const updatedProfile = await RootProfileScraped.findById(scrapedProfile._id);
        console.log(`\n📌 Profile Analysis Status: ${updatedProfile.analysisStatus || 'pending'}`);

        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await AnalyzedRelatedProfile.deleteMany({ sessionId: session._id });
        await RootProfileScraped.deleteMany({ sessionId: session._id });
        await Session.findByIdAndDelete(session._id);
        console.log('✅ Test data cleaned up');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Disconnect from database
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the test
console.log('Starting Scrape & Analyze Integration Test...');
testScrapeAndAnalyze();