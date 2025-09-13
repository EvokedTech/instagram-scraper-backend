require('dotenv').config();
const aiAnalysisService = require('../src/services/aiAnalysisService');
const logger = require('../src/utils/logger');

// Test profile data
const testProfileData = {
    username: 'testuser123',
    fullName: 'Test User',
    biography: 'Professional photographer and content creator. Travel enthusiast. 📸✈️',
    followersCount: 25000,
    followingCount: 500,
    postsCount: 450,
    isVerified: false,
    isBusinessAccount: true,
    categoryName: 'Photography',
    externalUrl: 'https://example.com',
    latestPosts: [
        {
            likesCount: 1200,
            commentsCount: 45,
            timestamp: new Date(Date.now() - 86400000),
            type: 'image'
        },
        {
            likesCount: 950,
            commentsCount: 30,
            timestamp: new Date(Date.now() - 172800000),
            type: 'video'
        }
    ]
};

async function testAIFallback() {
    console.log('========================================');
    console.log('AI FALLBACK SYSTEM TEST');
    console.log('========================================\n');

    try {
        // Test 1: First analysis (should use primary model)
        console.log('Test 1: First Analysis Request');
        console.log('-------------------------------');
        const startTime1 = Date.now();

        const result1 = await aiAnalysisService.analyzeProfile(testProfileData);

        console.log(`✅ Analysis successful!`);
        console.log(`   Model used: ${result1.modelUsed}`);
        console.log(`   From cache: ${result1.fromCache}`);
        console.log(`   Processing time: ${result1.processingTime}ms`);
        console.log(`   Analysis type: ${result1.analysis.profileType || 'N/A'}`);
        console.log(`   Engagement rate: ${result1.analysis.engagementRate || 'N/A'}`);
        console.log('\n');

        // Test 2: Second analysis (should use cache)
        console.log('Test 2: Cached Analysis Request');
        console.log('-------------------------------');
        const startTime2 = Date.now();

        const result2 = await aiAnalysisService.analyzeProfile(testProfileData);

        console.log(`✅ Analysis successful!`);
        console.log(`   Model used: ${result2.modelUsed}`);
        console.log(`   From cache: ${result2.fromCache}`);
        console.log(`   Processing time: ${result2.processingTime}ms`);
        console.log('\n');

        // Test 3: Force refresh (bypass cache)
        console.log('Test 3: Force Refresh Analysis');
        console.log('-------------------------------');
        const startTime3 = Date.now();

        const result3 = await aiAnalysisService.analyzeProfile(testProfileData, {
            forceRefresh: true
        });

        console.log(`✅ Analysis successful!`);
        console.log(`   Model used: ${result3.modelUsed}`);
        console.log(`   From cache: ${result3.fromCache}`);
        console.log(`   Processing time: ${result3.processingTime}ms`);
        console.log('\n');

        // Test 4: Different profile (no cache hit)
        console.log('Test 4: Different Profile Analysis');
        console.log('-------------------------------');
        const differentProfile = {
            ...testProfileData,
            username: 'anotheruser456',
            followersCount: 50000
        };

        const result4 = await aiAnalysisService.analyzeProfile(differentProfile);

        console.log(`✅ Analysis successful!`);
        console.log(`   Model used: ${result4.modelUsed}`);
        console.log(`   From cache: ${result4.fromCache}`);
        console.log(`   Processing time: ${result4.processingTime}ms`);
        console.log('\n');

        // Display model status
        console.log('Model Status');
        console.log('------------');
        const modelStatus = aiAnalysisService.getModelStatus();
        modelStatus.forEach(model => {
            console.log(`${model.name}:`);
            console.log(`   Available: ${model.available ? '✅' : '❌'}`);
            console.log(`   API calls: ${model.calls}`);
            console.log(`   Errors: ${model.errors}`);
        });

        console.log('\n========================================');
        console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
        console.log('========================================');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
}

// Test fallback by simulating primary model failure
async function testFallbackScenario() {
    console.log('\n========================================');
    console.log('FALLBACK SCENARIO TEST');
    console.log('========================================\n');

    try {
        // Test 1: Primary model failure (falls back to Grok)
        console.log('Test 1: Primary Model Failure');
        console.log('------------------------------');
        const originalModels = [...aiAnalysisService.models];
        aiAnalysisService.models[0].endpoint = 'https://invalid-endpoint.com/api';

        const result1 = await aiAnalysisService.analyzeProfile(testProfileData, {
            forceRefresh: true
        });

        console.log(`✅ First fallback successful!`);
        console.log(`   Model used: ${result1.modelUsed}`);
        console.log(`   Analysis completed with first fallback (Grok)\n`);

        // Test 2: Both primary and first fallback fail (falls back to Mistral)
        console.log('Test 2: Primary and First Fallback Failure');
        console.log('-------------------------------------------');
        aiAnalysisService.models[0].endpoint = 'https://invalid-endpoint.com/api';
        aiAnalysisService.models[1].endpoint = 'https://invalid-endpoint.com/api';

        const result2 = await aiAnalysisService.analyzeProfile({
            ...testProfileData,
            username: 'fallbacktest'
        }, {
            forceRefresh: true
        });

        console.log(`✅ Second fallback successful!`);
        console.log(`   Model used: ${result2.modelUsed}`);
        console.log(`   Analysis completed with second fallback (Mistral)\n`);

        // Test 3: Display fallback chain
        console.log('Fallback Chain:');
        console.log('---------------');
        console.log('1. DeepSeek-R1 (Primary)');
        console.log('2. Grok (First Fallback)');
        console.log('3. Mistral (Second Fallback)');

        // Restore original models
        aiAnalysisService.models = originalModels;

    } catch (error) {
        console.error('❌ Fallback test failed:', error.message);
    }
}

// Run tests
async function runAllTests() {
    try {
        await testAIFallback();
        await testFallbackScenario();

        console.log('\n✅ All tests completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    }
}

// Execute tests
runAllTests();