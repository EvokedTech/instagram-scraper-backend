require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const EnhancedProfileAnalysis = require('../src/models/EnhancedProfileAnalysis');
const enhancedAIAnalysisService = require('../src/services/enhancedAIAnalysisService');
const logger = require('../src/utils/logger');

const profilesToReanalyze = [
    'julmodelsagency',
    'xolod2',
    'fer_portrait',
    'thejoakimkarlsson'
];

async function reanalyzeProfile(profile) {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 RE-ANALYZING WITH ENHANCED FORMAT: @${profile.username}`);
        console.log(`${'='.repeat(80)}`);

        // Check if enhanced analysis already exists
        const existingAnalysis = await EnhancedProfileAnalysis.findOne({
            username: profile.username.toLowerCase()
        });

        if (existingAnalysis) {
            console.log(`⚠️  Enhanced analysis already exists - updating...`);
        }

        // Prepare profile data for enhanced analysis
        const profileData = profile.profileData || {
            username: profile.username,
            fullName: profile.fullName || '',
            biography: profile.bio || profile.biography || '',
            followersCount: profile.followersCount || profile.followers || 0,
            followingCount: profile.followingCount || profile.following || 0,
            postsCount: profile.postsCount || profile.posts || 0,
            isVerified: profile.isVerified || false,
            isBusinessAccount: profile.isBusinessAccount || false,
            categoryName: profile.categoryName || profile.businessCategoryName || '',
            externalUrl: profile.externalUrl || '',
            profilePicUrl: profile.profilePicUrl || profile.profilePicture || ''
        };

        console.log(`\n📊 Profile Stats:`);
        console.log(`   Followers: ${profileData.followersCount?.toLocaleString() || 0}`);
        console.log(`   Following: ${profileData.followingCount?.toLocaleString() || 0}`);
        console.log(`   Posts: ${profileData.postsCount?.toLocaleString() || 0}`);
        console.log(`   Verified: ${profileData.isVerified ? '✅' : '❌'}`);
        console.log(`   Business Account: ${profileData.isBusinessAccount ? '✅' : '❌'}`);

        // Perform enhanced AI analysis
        console.log(`\n🤖 Starting enhanced AI analysis...`);
        const startTime = Date.now();

        const analysisResult = await enhancedAIAnalysisService.analyzeProfileEnhanced(profileData);

        const analysisTime = Date.now() - startTime;
        console.log(`✅ Enhanced analysis completed in ${(analysisTime / 1000).toFixed(2)} seconds`);
        console.log(`   Model used: ${analysisResult._aiMetadata?.modelUsed || 'fallback'}`);

        // Save or update enhanced analysis
        let savedAnalysis;
        if (existingAnalysis) {
            // Update existing
            Object.assign(existingAnalysis, analysisResult);
            existingAnalysis.sessionId = profile.sessionId;
            existingAnalysis.sourceProfileId = profile._id;
            savedAnalysis = await existingAnalysis.save();
        } else {
            // Create new
            savedAnalysis = new EnhancedProfileAnalysis({
                ...analysisResult,
                sessionId: profile.sessionId,
                sourceProfileId: profile._id
            });
            await savedAnalysis.save();
        }

        // Display key results
        console.log(`\n📈 Enhanced Analysis Results:`);
        console.log(`   Gender: ${analysisResult.gender}`);
        console.log(`   Estimated Age: ${analysisResult.age}`);
        console.log(`   Engagement Rate: ${analysisResult.engagementRate}%`);
        console.log(`   Adult Content Score: ${analysisResult.adultContentScore}/100`);
        console.log(`   Influencer Tier: ${analysisResult.summaryStats?.influencerTier}`);
        console.log(`   Brand Safety: ${analysisResult.summaryStats?.brandSafetyLevel}`);
        console.log(`   Commercial Readiness: ${analysisResult.summaryStats?.commercialReadiness}`);

        // Display profile summary
        console.log(`\n📝 Profile Summary:`);
        if (analysisResult.profileSummary && analysisResult.profileSummary.length > 0) {
            analysisResult.profileSummary.slice(0, 3).forEach((point, i) => {
                console.log(`   ${i + 1}. ${point}`);
            });
        }

        // Display business suitability
        console.log(`\n💼 Perfect Business Matches:`);
        if (analysisResult.businessCategorySuitability?.perfectMatch?.length > 0) {
            analysisResult.businessCategorySuitability.perfectMatch.forEach(match => {
                console.log(`   - ${match.category} (${match.confidenceScore}% confidence)`);
            });
        }

        // Display audience insights
        console.log(`\n👥 Audience Insights:`);
        console.log(`   Primary Gender: ${analysisResult.audienceSignals?.likelyAudienceGender}`);
        console.log(`   Primary Age Group: ${analysisResult.audienceSignals?.primaryAgeGroup}`);
        console.log(`   Audience Quality: ${analysisResult.audienceSignals?.engagementQuality}`);

        // Display value estimate
        const valueEstimate = savedAnalysis.getValueEstimate();
        console.log(`\n💰 Estimated Value:`);
        console.log(`   $${valueEstimate.min} - $${valueEstimate.max} per post`);

        console.log(`\n✅ Enhanced analysis saved to database`);
        console.log(`   Analysis ID: ${savedAnalysis._id}`);

        return savedAnalysis;

    } catch (error) {
        console.error(`\n❌ Failed to re-analyze ${profile.username}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 ENHANCED PROFILE RE-ANALYSIS');
    console.log('='.repeat(80));
    console.log('\nProfiles to re-analyze with enhanced format:');
    profilesToReanalyze.forEach(username => console.log(`  - @${username}`));

    try {
        // Connect to database
        await connectDB();
        console.log('\n✅ Connected to MongoDB');

        const results = {
            successful: [],
            failed: [],
            notFound: []
        };

        // Process each profile
        for (const username of profilesToReanalyze) {
            try {
                // Find the scraped profile
                const profile = await RootProfileScraped.findOne({
                    username: username.toLowerCase()
                }).sort({ createdAt: -1 });

                if (!profile) {
                    console.log(`\n⚠️  Profile @${username} not found in database`);
                    results.notFound.push(username);
                    continue;
                }

                console.log(`\n✅ Found profile @${username}`);
                console.log(`   Profile ID: ${profile._id}`);

                // Re-analyze with enhanced format
                const analysis = await reanalyzeProfile(profile);

                if (analysis) {
                    results.successful.push({
                        username,
                        analysisId: analysis._id,
                        tier: analysis.summaryStats?.influencerTier,
                        engagementRate: analysis.engagementRate
                    });
                } else {
                    results.failed.push(username);
                }

            } catch (error) {
                console.error(`\n❌ Error processing @${username}:`, error.message);
                results.failed.push(username);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 RE-ANALYSIS SUMMARY');
        console.log('='.repeat(80));

        console.log(`\n✅ Successfully Re-analyzed: ${results.successful.length}`);
        results.successful.forEach(item => {
            console.log(`   - @${item.username} (${item.tier}, ${item.engagementRate}% engagement)`);
        });

        if (results.failed.length > 0) {
            console.log(`\n❌ Failed: ${results.failed.length}`);
            results.failed.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        if (results.notFound.length > 0) {
            console.log(`\n⚠️  Not Found: ${results.notFound.length}`);
            results.notFound.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        // Verify enhanced analyses in database
        console.log('\n' + '='.repeat(80));
        console.log('💾 ENHANCED ANALYSES IN DATABASE');
        console.log('='.repeat(80));

        const allEnhancedAnalyses = await EnhancedProfileAnalysis.find({
            username: { $in: profilesToReanalyze.map(u => u.toLowerCase()) }
        }).select('username gender age engagementRate summaryStats._aiMetadata');

        console.log(`\n📋 Total Enhanced Analyses: ${allEnhancedAnalyses.length}`);
        allEnhancedAnalyses.forEach(analysis => {
            console.log(`\n@${analysis.username}:`);
            console.log(`   Gender: ${analysis.gender}`);
            console.log(`   Age: ${analysis.age}`);
            console.log(`   Engagement: ${analysis.engagementRate}%`);
            console.log(`   Tier: ${analysis.summaryStats?.influencerTier}`);
        });

    } catch (error) {
        console.error('\n❌ Script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        console.log('\n✅ Enhanced re-analysis complete!');
        process.exit(0);
    }
}

// Run the script
console.log('Starting enhanced profile re-analysis...');
main();