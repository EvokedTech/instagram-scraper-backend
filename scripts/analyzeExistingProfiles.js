require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const EnhancedProfileAnalysis = require('../src/models/EnhancedProfileAnalysis');
const qwenFormatAnalysisService = require('../src/services/qwenFormatAnalysisService');
const logger = require('../src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

const targetProfiles = [
    'julmodelsagency',
    'xolod2',
    'fer_portrait',
    'thejoakimkarlsson'
];

async function analyzeProfile(profileData) {
    try {
        const username = profileData.username;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 ANALYZING: @${username}`);
        console.log(`${'='.repeat(80)}`);

        // Check if already analyzed
        const existingAnalysis = await EnhancedProfileAnalysis.findOne({
            username: username.toLowerCase()
        });

        if (existingAnalysis) {
            console.log(`⚠️  Profile already analyzed - skipping`);
            console.log(`   Analysis ID: ${existingAnalysis._id}`);
            return {
                success: true,
                username,
                analysisId: existingAnalysis._id,
                skipped: true
            };
        }

        // Get data source - check if data is in profileData field
        const dataSource = profileData.profileData || profileData;

        // Display profile info
        console.log(`\n📊 Profile Stats:`);
        console.log(`   Profile ID: ${profileData._id}`);
        console.log(`   Full Name: ${dataSource.fullName || profileData.fullName || 'N/A'}`);
        console.log(`   Followers: ${(dataSource.followersCount || profileData.followersCount || 0).toLocaleString()}`);
        console.log(`   Following: ${(dataSource.followingCount || profileData.followingCount || 0).toLocaleString()}`);
        console.log(`   Posts: ${(dataSource.postsCount || profileData.postsCount || 0).toLocaleString()}`);
        console.log(`   Bio: ${((dataSource.biography || profileData.biography || '')).substring(0, 100)}...`);

        // Prepare profile data for analysis
        const profileDataForAnalysis = {
            username: profileData.username,
            fullName: dataSource.fullName || profileData.fullName || '',
            biography: dataSource.biography || dataSource.bio || profileData.biography || profileData.bio || '',
            followersCount: dataSource.followersCount || dataSource.followers || profileData.followersCount || profileData.followers || 0,
            followingCount: dataSource.followingCount || dataSource.following || profileData.followingCount || profileData.following || 0,
            postsCount: dataSource.postsCount || dataSource.posts || profileData.postsCount || profileData.posts || 0,
            isVerified: dataSource.isVerified || profileData.isVerified || false,
            isBusinessAccount: dataSource.isBusinessAccount || profileData.isBusinessAccount || false,
            categoryName: dataSource.categoryName || profileData.categoryName || '',
            externalUrl: dataSource.externalUrl || profileData.externalUrl || '',
            profilePicUrl: dataSource.profilePicUrl || profileData.profilePicUrl || ''
        };

        // Perform Qwen-format analysis
        console.log(`\n🤖 Starting Qwen-format AI analysis...`);
        const startTime = Date.now();

        const analysisResult = await qwenFormatAnalysisService.analyzeInQwenFormat(
            profileDataForAnalysis,
            null // No parent profile
        );

        const analysisTime = Date.now() - startTime;
        console.log(`✅ Analysis completed in ${(analysisTime / 1000).toFixed(2)} seconds`);
        console.log(`   Model used: ${analysisResult._aiMetadata?.modelUsed}`);

        // Display key results
        console.log(`\n📈 Analysis Results:`);
        console.log(`   Gender: ${analysisResult.gender}`);
        console.log(`   Age: ${analysisResult.age}`);
        console.log(`   Engagement Rate: ${analysisResult.engagementRate}%`);
        console.log(`   Adult Content Score: ${analysisResult.adultContentScore}/100`);
        console.log(`   Influencer Tier: ${analysisResult.summaryStats?.influencerTier}`);

        // Display first 3 summary points
        console.log(`\n📝 Profile Summary (first 3 points):`);
        if (analysisResult.profileSummary && analysisResult.profileSummary.length > 0) {
            analysisResult.profileSummary.slice(0, 3).forEach((point, i) => {
                console.log(`   ${i + 1}. ${point.substring(0, 100)}...`);
            });
        }

        // Save to EnhancedProfileAnalysis collection
        try {
            // Create a clean object for saving
            const dataToSave = {
                username: analysisResult.username,
                gender: analysisResult.gender,
                age: analysisResult.age,
                profileSummary: analysisResult.profileSummary,
                geographicSignals: analysisResult.geographicSignals,
                profileMetrics: analysisResult.profileMetrics || {},
                contentMetrics: analysisResult.contentMetrics || {},
                audienceAnalysis: analysisResult.audienceAnalysis || {},
                contentAnalysis: analysisResult.contentAnalysis || {},
                businessCategorySuitability: {
                    perfectMatch: analysisResult.businessCategorySuitability?.perfectMatch || [],
                    highlyCompatible: analysisResult.businessCategorySuitability?.highlyCompatible || [],
                    moderatelyCompatible: analysisResult.businessCategorySuitability?.moderatelyCompatible || [],
                    requiresConsideration: analysisResult.businessCategorySuitability?.requiresConsideration || [],
                    notRecommended: analysisResult.businessCategorySuitability?.notRecommended || [],
                    brandCollaborationHistory: analysisResult.businessCategorySuitability?.brandCollaborationHistory || [],
                    monetizationIndicators: analysisResult.businessCategorySuitability?.monetizationIndicators || []
                },
                professionalReadiness: analysisResult.professionalReadiness || {},
                summaryStats: analysisResult.summaryStats || {},
                engagementRate: analysisResult.engagementRate,
                adultContentScore: analysisResult.adultContentScore,
                _aiMetadata: analysisResult._aiMetadata,
                sessionId: profileData.sessionId || new mongoose.Types.ObjectId(),
                sourceProfileId: profileData._id,
                statusId: new mongoose.Types.ObjectId()
            };

            const enhancedAnalysis = new EnhancedProfileAnalysis(dataToSave);
            await enhancedAnalysis.save();

            console.log(`\n✅ Analysis saved to EnhancedProfileAnalysis collection`);
            console.log(`   Analysis ID: ${enhancedAnalysis._id}`);

            // Also save as JSON file
            const outputDir = path.join(__dirname, '../analyzed-profiles');
            await fs.mkdir(outputDir, { recursive: true });
            const outputFile = path.join(outputDir, `${username}_analysis.json`);
            await fs.writeFile(outputFile, JSON.stringify(analysisResult, null, 2));
            console.log(`   JSON saved to: ${outputFile}`);

            return {
                success: true,
                username,
                analysisId: enhancedAnalysis._id,
                gender: analysisResult.gender,
                age: analysisResult.age,
                tier: analysisResult.summaryStats?.influencerTier,
                engagement: analysisResult.engagementRate
            };

        } catch (saveError) {
            console.error(`❌ Failed to save to database:`, saveError.message);

            // Still save as JSON even if DB save fails
            const outputDir = path.join(__dirname, '../analyzed-profiles');
            await fs.mkdir(outputDir, { recursive: true });
            const outputFile = path.join(outputDir, `${username}_analysis.json`);
            await fs.writeFile(outputFile, JSON.stringify(analysisResult, null, 2));
            console.log(`   JSON saved to: ${outputFile}`);

            return {
                success: false,
                username,
                error: saveError.message
            };
        }

    } catch (error) {
        console.error(`❌ Failed to analyze ${profileData.username}:`, error.message);
        return {
            success: false,
            username: profileData.username,
            error: error.message
        };
    }
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 ANALYZING EXISTING PROFILES FROM DATABASE');
    console.log('='.repeat(80));
    console.log('\nProfiles to analyze:');
    targetProfiles.forEach(username => console.log(`  - @${username}`));

    try {
        // Connect to database
        await connectDB();
        console.log('\n✅ Connected to MongoDB');

        // Check what profiles exist in database
        console.log('\n🔍 Checking RootProfileScraped collection...');
        const existingProfiles = await RootProfileScraped.find({
            username: { $in: targetProfiles.map(u => u.toLowerCase()) }
        }).sort({ createdAt: -1 });

        console.log(`\n📋 Found ${existingProfiles.length} profiles in database:`);
        existingProfiles.forEach(profile => {
            console.log(`   - @${profile.username} (${profile.followersCount?.toLocaleString() || 0} followers)`);
        });

        if (existingProfiles.length === 0) {
            console.log('\n❌ No profiles found in database. Please scrape them first.');
            return;
        }

        const results = {
            successful: [],
            failed: [],
            skipped: []
        };

        // Analyze each profile
        for (const profile of existingProfiles) {
            const result = await analyzeProfile(profile);

            if (result.skipped) {
                results.skipped.push(result);
            } else if (result.success) {
                results.successful.push(result);
            } else {
                results.failed.push(result);
            }
        }

        // Display summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('='.repeat(80));

        if (results.successful.length > 0) {
            console.log(`\n✅ Successfully Analyzed: ${results.successful.length}`);
            results.successful.forEach(item => {
                console.log(`\n   @${item.username}:`);
                console.log(`     Analysis ID: ${item.analysisId}`);
                console.log(`     Gender: ${item.gender}`);
                console.log(`     Age: ${item.age}`);
                console.log(`     Tier: ${item.tier}`);
                console.log(`     Engagement: ${item.engagement}%`);
            });
        }

        if (results.skipped.length > 0) {
            console.log(`\n⏭️  Skipped (already analyzed): ${results.skipped.length}`);
            results.skipped.forEach(item => {
                console.log(`   - @${item.username} (ID: ${item.analysisId})`);
            });
        }

        if (results.failed.length > 0) {
            console.log(`\n❌ Failed: ${results.failed.length}`);
            results.failed.forEach(item => {
                console.log(`   - @${item.username}: ${item.error}`);
            });
        }

        // Check final database status
        console.log('\n' + '='.repeat(80));
        console.log('💾 ENHANCED PROFILE ANALYSES IN DATABASE');
        console.log('='.repeat(80));

        const dbAnalyses = await EnhancedProfileAnalysis.find({
            username: { $in: targetProfiles.map(u => u.toLowerCase()) }
        }).select('username gender age engagementRate summaryStats.influencerTier createdAt');

        console.log(`\n📋 Total in EnhancedProfileAnalysis: ${dbAnalyses.length}`);
        dbAnalyses.forEach(analysis => {
            console.log(`\n@${analysis.username}:`);
            console.log(`   Gender: ${analysis.gender}`);
            console.log(`   Age: ${analysis.age}`);
            console.log(`   Engagement: ${analysis.engagementRate}%`);
            console.log(`   Tier: ${analysis.summaryStats?.influencerTier}`);
            console.log(`   Created: ${analysis.createdAt}`);
        });

    } catch (error) {
        console.error('\n❌ Script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        console.log('\n✅ Analysis complete!');
        process.exit(0);
    }
}

// Run the script
console.log('Starting profile analysis...');
main();