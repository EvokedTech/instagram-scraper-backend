require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');
const AnalyzedRelatedProfile = require('../src/models/AnalyzedRelatedProfile');
const aiAnalysisService = require('../src/services/aiAnalysisService');
const logger = require('../src/utils/logger');

const targetProfiles = [
    'julmodelsagency',
    'xolod2',
    'fer_portrait',
    'thejoakimkarlsson',
    'hope.mikaa'
];

async function analyzeProfile(username) {
    try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🔄 ANALYZING: @${username}`);
        console.log(`${'='.repeat(70)}`);

        // Find the profile in database
        let profile = await RootProfileScraped.findOne({
            username: username.toLowerCase()
        }).sort({ createdAt: -1 });

        if (!profile) {
            profile = await RelatedProfileScraped.findOne({
                username: username.toLowerCase()
            }).sort({ createdAt: -1 });
        }

        if (!profile) {
            console.log(`❌ Profile @${username} not found in database`);
            console.log(`   Need to scrape this profile first`);
            return null;
        }

        console.log(`✅ Found profile in database`);
        console.log(`   Collection: ${profile.constructor.modelName}`);
        console.log(`   Profile ID: ${profile._id}`);

        // Check for existing analysis
        const existingAnalysis = await AnalyzedRelatedProfile.findOne({
            sourceProfileId: profile._id
        });

        if (existingAnalysis) {
            console.log(`⚠️  Existing analysis found - deleting to re-analyze`);
            await AnalyzedRelatedProfile.deleteOne({ _id: existingAnalysis._id });
        }

        // Prepare profile data
        const profileData = profile.profileData || {
            username: profile.username,
            fullName: profile.fullName || '',
            biography: profile.bio || profile.biography || '',
            followersCount: profile.followersCount || profile.followers || 0,
            followingCount: profile.followingCount || profile.following || 0,
            postsCount: profile.postsCount || profile.posts || 0,
            isVerified: profile.isVerified || false,
            isBusinessAccount: profile.isBusinessAccount || false,
            categoryName: profile.categoryName || '',
            externalUrl: profile.externalUrl || '',
            profilePicUrl: profile.profilePicUrl || ''
        };

        // Display profile info
        console.log(`\n📊 Profile Stats:`);
        console.log(`   Full Name: ${profileData.fullName || 'N/A'}`);
        console.log(`   Followers: ${profileData.followersCount?.toLocaleString() || 0}`);
        console.log(`   Following: ${profileData.followingCount?.toLocaleString() || 0}`);
        console.log(`   Posts: ${profileData.postsCount?.toLocaleString() || 0}`);
        console.log(`   Verified: ${profileData.isVerified ? '✅' : '❌'}`);

        // Skip if no followers (empty profile)
        if (profileData.followersCount === 0) {
            console.log(`⚠️  Profile has 0 followers - skipping analysis`);
            return null;
        }

        // Perform AI analysis
        console.log(`\n🤖 Starting AI analysis...`);
        const startTime = Date.now();

        const aiResult = await aiAnalysisService.analyzeProfile(profileData, {
            forceRefresh: true
        });

        const analysisTime = Date.now() - startTime;
        console.log(`✅ Analysis completed in ${(analysisTime / 1000).toFixed(2)} seconds`);
        console.log(`   Model used: ${aiResult.modelUsed}`);

        // Prepare analysis data
        const analysisData = {
            ...aiResult.analysis,
            modelUsed: aiResult.modelUsed,
            fromCache: aiResult.fromCache,
            processingTime: aiResult.processingTime,
            analyzedAt: new Date()
        };

        // Save analysis
        const analyzedProfile = new AnalyzedRelatedProfile({
            sourceProfileId: profile._id,
            sourceCollection: profile.constructor.modelName,
            sessionId: profile.sessionId,
            username: profile.username,
            profileUrl: profile.profileUrl || `https://www.instagram.com/${profile.username}/`,
            depth: profile.depth || 0,
            analysisData: analysisData,
            analysisStatus: 'completed'
        });

        await analyzedProfile.save();

        // Update profile status if method exists
        if (profile.markAsAnalyzed) {
            await profile.markAsAnalyzed();
        } else {
            profile.analysisStatus = 'analyzed';
            await profile.save();
        }

        // Display results
        console.log(`\n📈 Analysis Results:`);
        console.log(`   Profile Type: ${analysisData.profileType || 'N/A'}`);
        console.log(`   Engagement Rate: ${analysisData.engagementRate || 'N/A'}`);
        console.log(`   Audience Quality: ${analysisData.audienceQuality || 'N/A'}`);
        console.log(`   Growth Potential: ${analysisData.growthPotential || 'N/A'}`);

        if (analysisData.authenticity) {
            console.log(`   Authenticity Score: ${analysisData.authenticity.score}/10`);
        }

        if (analysisData.estimatedValue) {
            console.log(`\n💰 Estimated Value:`);
            console.log(`   Tier: ${analysisData.estimatedValue.tier}`);
            console.log(`   Monthly Value: ${analysisData.estimatedValue.monthlyValue}`);
        }

        if (analysisData.keyInsights && analysisData.keyInsights.length > 0) {
            console.log(`\n🔍 Key Insights:`);
            analysisData.keyInsights.slice(0, 3).forEach((insight, i) => {
                console.log(`   ${i + 1}. ${insight}`);
            });
        }

        console.log(`\n✅ Analysis saved successfully`);
        console.log(`   Analysis ID: ${analyzedProfile._id}`);

        return {
            username,
            analysisId: analyzedProfile._id,
            profileType: analysisData.profileType,
            engagementRate: analysisData.engagementRate,
            tier: analysisData.estimatedValue?.tier,
            value: analysisData.estimatedValue?.monthlyValue,
            modelUsed: analysisData.modelUsed
        };

    } catch (error) {
        console.error(`❌ Failed to analyze ${username}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 PROFILE ANALYSIS BATCH');
    console.log('='.repeat(70));
    console.log('\nProfiles to analyze:');
    targetProfiles.forEach(username => console.log(`  - @${username}`));

    try {
        // Connect to database
        await connectDB();
        console.log('\n✅ Connected to MongoDB');

        const results = {
            successful: [],
            failed: [],
            notFound: [],
            empty: []
        };

        // Analyze each profile
        for (const username of targetProfiles) {
            const result = await analyzeProfile(username);

            if (result === null) {
                // Check if it was not found or empty
                const profile = await RootProfileScraped.findOne({ username: username.toLowerCase() });
                if (!profile) {
                    results.notFound.push(username);
                } else if ((profile.followersCount || 0) === 0) {
                    results.empty.push(username);
                } else {
                    results.failed.push(username);
                }
            } else {
                results.successful.push(result);
            }
        }

        // Display summary
        console.log('\n' + '='.repeat(70));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('='.repeat(70));

        console.log(`\n✅ Successfully Analyzed: ${results.successful.length}`);
        results.successful.forEach(item => {
            console.log(`\n   @${item.username}:`);
            console.log(`     Type: ${item.profileType}`);
            console.log(`     Engagement: ${item.engagementRate}`);
            console.log(`     Tier: ${item.tier}`);
            console.log(`     Value: ${item.value}`);
            console.log(`     Model: ${item.modelUsed}`);
        });

        if (results.empty.length > 0) {
            console.log(`\n⚠️  Empty Profiles (0 followers): ${results.empty.length}`);
            results.empty.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        if (results.notFound.length > 0) {
            console.log(`\n❌ Not Found (need to scrape first): ${results.notFound.length}`);
            results.notFound.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        if (results.failed.length > 0) {
            console.log(`\n❌ Failed to Analyze: ${results.failed.length}`);
            results.failed.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        // Verify in database
        console.log('\n' + '='.repeat(70));
        console.log('💾 DATABASE VERIFICATION');
        console.log('='.repeat(70));

        const allAnalyses = await AnalyzedRelatedProfile.find({
            username: { $in: targetProfiles.map(u => u.toLowerCase()) }
        }).select('username analysisStatus analysisData.profileType analysisData.estimatedValue');

        console.log(`\n📋 Total Analyses in Database: ${allAnalyses.length}`);
        allAnalyses.forEach(analysis => {
            console.log(`\n@${analysis.username}:`);
            console.log(`   Status: ${analysis.analysisStatus}`);
            console.log(`   Type: ${analysis.analysisData?.profileType || 'N/A'}`);
            console.log(`   Value: ${analysis.analysisData?.estimatedValue?.monthlyValue || 'N/A'}`);
        });

    } catch (error) {
        console.error('\n❌ Script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        console.log('\n✅ Analysis batch complete!');
        process.exit(0);
    }
}

// Run the script
console.log('Starting profile analysis batch...');
main();