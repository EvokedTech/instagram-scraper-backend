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
    'thejoakimkarlsson',
    'hope.mikaa'
];

async function analyzeInQwenFormat(username, parentProfile = null) {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 ANALYZING IN QWEN FORMAT: @${username}`);
        console.log(`${'='.repeat(80)}`);

        // Find the profile in database
        let profile = await RootProfileScraped.findOne({
            username: username.toLowerCase()
        }).sort({ createdAt: -1 });

        if (!profile) {
            console.log(`❌ Profile @${username} not found in database`);
            return null;
        }

        console.log(`✅ Found profile in database`);
        console.log(`   Profile ID: ${profile._id}`);

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

        // Skip if no followers
        if (profileData.followersCount === 0) {
            console.log(`⚠️  Profile has 0 followers - skipping analysis`);
            return null;
        }

        // Perform Qwen-format analysis
        console.log(`\n🤖 Starting Qwen-format AI analysis...`);
        const startTime = Date.now();

        const analysisResult = await qwenFormatAnalysisService.analyzeInQwenFormat(
            profileData,
            parentProfile
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

        // Debug: Save raw result first
        const debugDir = path.join(__dirname, '../qwen-format-outputs');
        await fs.mkdir(debugDir, { recursive: true });
        const debugFile = path.join(debugDir, `${username}_raw_debug.json`);
        await fs.writeFile(debugFile, JSON.stringify(analysisResult, null, 2));
        console.log(`   DEBUG: Raw JSON saved to: ${debugFile}`);

        // Deep clean the analysis result before saving
        let cleanedResult;
        try {
            // Convert to JSON string and back to ensure clean data
            const jsonStr = JSON.stringify(analysisResult);
            cleanedResult = JSON.parse(jsonStr);

            // Fix monetizationIndicators if it's malformed
            if (cleanedResult.businessCategorySuitability?.monetizationIndicators) {
                const indicators = cleanedResult.businessCategorySuitability.monetizationIndicators;

                // Check if it's an array with a string element that looks like JS code
                if (Array.isArray(indicators) && indicators.length > 0) {
                    if (typeof indicators[0] === 'string' && indicators[0].includes('{')) {
                        // It's a stringified array, try to fix it
                        try {
                            // Remove array brackets and parse as object
                            const cleanStr = indicators[0].replace(/^\[/, '').replace(/\]$/, '').trim();
                            // Try to convert JS-style object to JSON
                            const jsonStr = cleanStr
                                .replace(/(\w+):/g, '"$1":')  // Add quotes to keys
                                .replace(/'/g, '"')  // Replace single quotes with double
                                .replace(/false/g, 'false')
                                .replace(/true/g, 'true');

                            const parsed = JSON.parse(`[${jsonStr}]`);
                            cleanedResult.businessCategorySuitability.monetizationIndicators = parsed;
                        } catch (e) {
                            // If all parsing fails, set default
                            cleanedResult.businessCategorySuitability.monetizationIndicators = [{
                                type: 'none',
                                evidence: 'Unable to determine',
                                frequency: 'none',
                                categories: [],
                                adultContentMonetization: false,
                                subscriptionModelUsage: false,
                                fanFundingPlatforms: []
                            }];
                        }
                    } else if (!Array.isArray(indicators[0])) {
                        // Already proper format, ensure all fields exist
                        cleanedResult.businessCategorySuitability.monetizationIndicators = indicators.map(ind => ({
                            type: ind.type || 'none',
                            evidence: ind.evidence || '',
                            frequency: ind.frequency || 'none',
                            categories: ind.categories || [],
                            adultContentMonetization: ind.adultContentMonetization || false,
                            subscriptionModelUsage: ind.subscriptionModelUsage || false,
                            fanFundingPlatforms: ind.fanFundingPlatforms || []
                        }));
                    }
                } else if (!Array.isArray(indicators)) {
                    cleanedResult.businessCategorySuitability.monetizationIndicators = [];
                }
            }

            // Ensure all other arrays are properly formatted
            if (cleanedResult.businessCategorySuitability) {
                const fieldsToCheck = ['perfectMatch', 'highlyCompatible', 'moderatelyCompatible', 'requiresConsideration', 'notRecommended', 'brandCollaborationHistory'];
                fieldsToCheck.forEach(field => {
                    if (!Array.isArray(cleanedResult.businessCategorySuitability[field])) {
                        cleanedResult.businessCategorySuitability[field] = [];
                    }
                });
            }
        } catch (e) {
            console.error('Failed to clean result:', e);
            cleanedResult = analysisResult;
        }

        // Save to database - ensure all fields are properly structured
        const dataToSave = {
            username: cleanedResult.username,
            gender: cleanedResult.gender,
            age: cleanedResult.age,
            profileSummary: cleanedResult.profileSummary,
            geographicSignals: cleanedResult.geographicSignals,
            profileMetrics: cleanedResult.profileMetrics,
            contentMetrics: cleanedResult.contentMetrics,
            audienceAnalysis: cleanedResult.audienceAnalysis,
            contentAnalysis: cleanedResult.contentAnalysis,
            businessCategorySuitability: cleanedResult.businessCategorySuitability,
            professionalReadiness: cleanedResult.professionalReadiness,
            summaryStats: cleanedResult.summaryStats,
            engagementRate: cleanedResult.engagementRate,
            adultContentScore: cleanedResult.adultContentScore,
            _aiMetadata: cleanedResult._aiMetadata,
            sessionId: profile.sessionId,
            sourceProfileId: profile._id,
            statusId: new mongoose.Types.ObjectId()
        };

        const enhancedAnalysis = new EnhancedProfileAnalysis(dataToSave);
        await enhancedAnalysis.save();
        console.log(`\n✅ Qwen-format analysis saved to database`);
        console.log(`   Analysis ID: ${enhancedAnalysis._id}`);

        // Also save as JSON file for review
        const outputDir = path.join(__dirname, '../qwen-format-outputs');
        await fs.mkdir(outputDir, { recursive: true });

        const outputFile = path.join(outputDir, `${username}_qwen_format.json`);
        await fs.writeFile(outputFile, JSON.stringify(cleanedResult, null, 2));
        console.log(`   JSON saved to: ${outputFile}`);

        return analysisResult;

    } catch (error) {
        console.error(`❌ Failed to analyze ${username}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 QWEN FORMAT ANALYSIS');
    console.log('='.repeat(80));
    console.log('\nProfiles to analyze in Qwen format:');
    targetProfiles.forEach(username => console.log(`  - @${username}`));

    try {
        // Connect to database
        await connectDB();
        console.log('\n✅ Connected to MongoDB');

        const results = [];

        // Analyze each profile
        for (const username of targetProfiles) {
            const analysis = await analyzeInQwenFormat(username);

            if (analysis) {
                results.push({
                    username,
                    success: true,
                    gender: analysis.gender,
                    age: analysis.age,
                    tier: analysis.summaryStats?.influencerTier,
                    engagement: analysis.engagementRate
                });
            } else {
                results.push({
                    username,
                    success: false
                });
            }
        }

        // Display summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 QWEN FORMAT ANALYSIS SUMMARY');
        console.log('='.repeat(80));

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(`\n✅ Successfully Analyzed: ${successful.length}`);
        successful.forEach(item => {
            console.log(`\n   @${item.username}:`);
            console.log(`     Gender: ${item.gender}`);
            console.log(`     Age: ${item.age}`);
            console.log(`     Tier: ${item.tier}`);
            console.log(`     Engagement: ${item.engagement}%`);
        });

        if (failed.length > 0) {
            console.log(`\n❌ Failed: ${failed.length}`);
            failed.forEach(item => {
                console.log(`   - @${item.username}`);
            });
        }

        // Check database
        console.log('\n' + '='.repeat(80));
        console.log('💾 QWEN FORMAT ANALYSES IN DATABASE');
        console.log('='.repeat(80));

        const dbAnalyses = await EnhancedProfileAnalysis.find({
            username: { $in: targetProfiles.map(u => u.toLowerCase()) }
        }).select('username gender age engagementRate summaryStats.influencerTier');

        console.log(`\n📋 Total in Database: ${dbAnalyses.length}`);
        dbAnalyses.forEach(analysis => {
            console.log(`\n@${analysis.username}:`);
            console.log(`   Gender: ${analysis.gender}`);
            console.log(`   Age: ${analysis.age}`);
            console.log(`   Engagement: ${analysis.engagementRate}%`);
            console.log(`   Tier: ${analysis.summaryStats?.influencerTier}`);
        });

        console.log('\n✅ JSON files saved to: qwen-format-outputs/');

    } catch (error) {
        console.error('\n❌ Script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        console.log('\n✅ Qwen format analysis complete!');
        process.exit(0);
    }
}

// Run the script
console.log('Starting Qwen format analysis...');
main();