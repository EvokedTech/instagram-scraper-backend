require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const RootProfileScraped = require('../src/models/RootProfileScraped');
const RelatedProfileScraped = require('../src/models/RelatedProfileScraped');
const AnalyzedRelatedProfile = require('../src/models/AnalyzedRelatedProfile');
const aiAnalysisService = require('../src/services/aiAnalysisService');
const logger = require('../src/utils/logger');

const profilesToAnalyze = [
    'julmodelsagency',
    'xolod2',
    'fer_portrait',
    'thejoakimkarlsson',
    'hope.mikaa'
];

async function analyzeProfile(profile, sessionId) {
    try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📊 Analyzing: @${profile.username}`);
        console.log(`${'='.repeat(70)}`);

        // Check if already analyzed
        const existingAnalysis = await AnalyzedRelatedProfile.findOne({
            sourceProfileId: profile._id,
            sessionId: sessionId || profile.sessionId
        });

        if (existingAnalysis && existingAnalysis.analysisStatus === 'completed') {
            console.log(`✅ Already analyzed - skipping`);
            return existingAnalysis;
        }

        // Prepare profile data for AI analysis
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
            profileUrl: profile.profileUrl
        };

        console.log(`📝 Profile Summary:`);
        console.log(`   Followers: ${profileData.followersCount?.toLocaleString() || 0}`);
        console.log(`   Following: ${profileData.followingCount?.toLocaleString() || 0}`);
        console.log(`   Posts: ${profileData.postsCount?.toLocaleString() || 0}`);

        // Perform AI analysis
        console.log(`\n🤖 Starting AI analysis...`);
        const startTime = Date.now();

        const aiResult = await aiAnalysisService.analyzeProfile(profileData, {
            forceRefresh: true // Force fresh analysis
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

        // Save analysis to database
        const analyzedProfile = new AnalyzedRelatedProfile({
            sourceProfileId: profile._id,
            sourceCollection: profile.constructor.modelName || 'rootprofiles_scraped_datas',
            sessionId: sessionId || profile.sessionId,
            username: profile.username,
            profileUrl: profile.profileUrl,
            depth: profile.depth || 0,
            analysisData: analysisData,
            analysisStatus: 'completed'
        });

        await analyzedProfile.save();

        // Update the profile status
        if (profile.markAsAnalyzed) {
            await profile.markAsAnalyzed();
        } else {
            profile.analysisStatus = 'analyzed';
            await profile.save();
        }

        // Display analysis results
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

        console.log(`\n✅ Analysis saved to database`);
        console.log(`   Analysis ID: ${analyzedProfile._id}`);

        return analyzedProfile;

    } catch (error) {
        console.error(`❌ Failed to analyze ${profile.username}:`, error.message);

        // Save failed analysis record
        try {
            const failedAnalysis = new AnalyzedRelatedProfile({
                sourceProfileId: profile._id,
                sourceCollection: profile.constructor.modelName || 'rootprofiles_scraped_datas',
                sessionId: sessionId || profile.sessionId,
                username: profile.username,
                profileUrl: profile.profileUrl,
                depth: profile.depth || 0,
                analysisData: {},
                analysisStatus: 'failed',
                errorDetails: {
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });
            await failedAnalysis.save();
            console.log(`   Failed analysis record saved`);
        } catch (saveError) {
            console.error(`   Could not save failed analysis record:`, saveError.message);
        }

        return null;
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 MANUAL PROFILE ANALYSIS TOOL');
    console.log('='.repeat(70));
    console.log('\nProfiles to analyze:');
    profilesToAnalyze.forEach(username => console.log(`  - @${username}`));

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
        for (const username of profilesToAnalyze) {
            try {
                // Try to find in RootProfileScraped first
                let profile = await RootProfileScraped.findOne({
                    username: username.toLowerCase()
                }).sort({ createdAt: -1 });

                // If not found, try RelatedProfileScraped
                if (!profile) {
                    profile = await RelatedProfileScraped.findOne({
                        username: username.toLowerCase()
                    }).sort({ createdAt: -1 });
                }

                if (!profile) {
                    console.log(`\n⚠️  Profile @${username} not found in database`);
                    console.log(`   Please scrape this profile first`);
                    results.notFound.push(username);
                    continue;
                }

                console.log(`\n✅ Found profile @${username} in database`);
                console.log(`   Collection: ${profile.constructor.modelName}`);
                console.log(`   Profile ID: ${profile._id}`);
                console.log(`   Session ID: ${profile.sessionId || 'N/A'}`);

                // Analyze the profile
                const analysis = await analyzeProfile(profile, profile.sessionId);

                if (analysis) {
                    results.successful.push({
                        username,
                        analysisId: analysis._id,
                        modelUsed: analysis.analysisData.modelUsed
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
        console.log('\n' + '='.repeat(70));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('='.repeat(70));

        console.log(`\n✅ Successfully Analyzed: ${results.successful.length}`);
        results.successful.forEach(item => {
            console.log(`   - @${item.username} (Model: ${item.modelUsed})`);
        });

        if (results.failed.length > 0) {
            console.log(`\n❌ Failed: ${results.failed.length}`);
            results.failed.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        if (results.notFound.length > 0) {
            console.log(`\n⚠️  Not Found (need to scrape first): ${results.notFound.length}`);
            results.notFound.forEach(username => {
                console.log(`   - @${username}`);
            });
        }

        // Check all analyses in database
        console.log('\n' + '='.repeat(70));
        console.log('💾 DATABASE CHECK');
        console.log('='.repeat(70));

        for (const username of profilesToAnalyze) {
            const analyses = await AnalyzedRelatedProfile.find({
                username: username.toLowerCase()
            }).select('username analysisStatus analysisData.modelUsed createdAt');

            if (analyses.length > 0) {
                console.log(`\n@${username}: ${analyses.length} analysis record(s)`);
                analyses.forEach(a => {
                    console.log(`   - Status: ${a.analysisStatus}, Model: ${a.analysisData?.modelUsed || 'N/A'}, Date: ${a.createdAt.toISOString()}`);
                });
            } else {
                console.log(`\n@${username}: No analysis records`);
            }
        }

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
console.log('Starting manual profile analysis...');
main();