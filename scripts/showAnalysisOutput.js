require('dotenv').config();
const aiAnalysisService = require('../src/services/aiAnalysisService');

// Sample Instagram profile data
const sampleProfile = {
    username: 'fashioninfluencer',
    fullName: 'Sarah Johnson',
    biography: 'Fashion & Lifestyle Blogger 👗✨ | NYC Based | Collaborations: contact@example.com | Shop my looks 👇',
    followersCount: 125000,
    followingCount: 850,
    postsCount: 1240,
    isVerified: true,
    isBusinessAccount: true,
    categoryName: 'Fashion/Beauty',
    externalUrl: 'https://linktr.ee/fashioninfluencer',
    latestPosts: [
        {
            likesCount: 8500,
            commentsCount: 245,
            timestamp: new Date(Date.now() - 86400000),
            type: 'image',
            hashtags: ['#ootd', '#fashion', '#style', '#nyc']
        },
        {
            likesCount: 12000,
            commentsCount: 380,
            timestamp: new Date(Date.now() - 172800000),
            type: 'carousel',
            hashtags: ['#fashionweek', '#streetstyle', '#trending']
        },
        {
            likesCount: 6200,
            commentsCount: 190,
            timestamp: new Date(Date.now() - 259200000),
            type: 'video',
            hashtags: ['#grwm', '#makeup', '#beauty']
        }
    ]
};

async function demonstrateAnalysis() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 AI PROFILE ANALYSIS DEMONSTRATION');
    console.log('='.repeat(60));

    console.log('\n📱 PROFILE BEING ANALYZED:');
    console.log('-'.repeat(40));
    console.log(`Username: @${sampleProfile.username}`);
    console.log(`Full Name: ${sampleProfile.fullName}`);
    console.log(`Followers: ${sampleProfile.followersCount.toLocaleString()}`);
    console.log(`Following: ${sampleProfile.followingCount.toLocaleString()}`);
    console.log(`Posts: ${sampleProfile.postsCount.toLocaleString()}`);
    console.log(`Verified: ${sampleProfile.isVerified ? '✅' : '❌'}`);
    console.log(`Business Account: ${sampleProfile.isBusinessAccount ? '✅' : '❌'}`);
    console.log(`Category: ${sampleProfile.categoryName}`);

    console.log('\n🔄 ANALYZING PROFILE...');
    console.log('-'.repeat(40));

    try {
        const startTime = Date.now();

        // Perform AI analysis
        const result = await aiAnalysisService.analyzeProfile(sampleProfile, {
            forceRefresh: true // Force fresh analysis for demo
        });

        const processingTime = Date.now() - startTime;

        console.log(`\n✅ ANALYSIS COMPLETE!`);
        console.log(`⚡ Processing Time: ${(processingTime / 1000).toFixed(2)} seconds`);
        console.log(`🤖 AI Model Used: ${result.modelUsed}`);
        console.log(`💾 From Cache: ${result.fromCache ? 'Yes' : 'No'}`);

        console.log('\n' + '='.repeat(60));
        console.log('📈 ANALYSIS RESULTS');
        console.log('='.repeat(60));

        const analysis = result.analysis;

        // Profile Type & Classification
        console.log('\n🏷️  PROFILE CLASSIFICATION:');
        console.log('-'.repeat(40));
        console.log(`Profile Type: ${analysis.profileType || 'Unknown'}`);
        console.log(`Audience Quality: ${analysis.audienceQuality || 'Unknown'}`);
        console.log(`Growth Potential: ${analysis.growthPotential || 'Unknown'}`);

        // Engagement Metrics
        console.log('\n📊 ENGAGEMENT METRICS:');
        console.log('-'.repeat(40));
        console.log(`Engagement Rate: ${analysis.engagementRate || 'N/A'}`);
        if (analysis.authenticity) {
            console.log(`Authenticity Score: ${analysis.authenticity.score}/10`);
        }

        // Content Strategy
        console.log('\n📝 CONTENT STRATEGY:');
        console.log('-'.repeat(40));
        console.log(analysis.contentStrategy || 'No strategy analysis available');

        // Estimated Value
        if (analysis.estimatedValue) {
            console.log('\n💰 ESTIMATED VALUE:');
            console.log('-'.repeat(40));
            console.log(`Influencer Tier: ${analysis.estimatedValue.tier}`);
            console.log(`Monthly Value: ${analysis.estimatedValue.monthlyValue}`);
        }

        // Key Insights
        if (analysis.keyInsights && analysis.keyInsights.length > 0) {
            console.log('\n🔍 KEY INSIGHTS:');
            console.log('-'.repeat(40));
            analysis.keyInsights.forEach((insight, index) => {
                console.log(`${index + 1}. ${insight}`);
            });
        }

        // Recommendations
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            console.log('-'.repeat(40));
            analysis.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }

        // Opportunities
        if (analysis.opportunities && analysis.opportunities.length > 0) {
            console.log('\n🚀 OPPORTUNITIES:');
            console.log('-'.repeat(40));
            analysis.opportunities.forEach((opp, index) => {
                console.log(`${index + 1}. ${opp}`);
            });
        }

        // Risks
        if (analysis.risks && analysis.risks.length > 0) {
            console.log('\n⚠️  POTENTIAL RISKS:');
            console.log('-'.repeat(40));
            analysis.risks.forEach((risk, index) => {
                console.log(`${index + 1}. ${risk}`);
            });
        }

        // Authenticity Indicators
        if (analysis.authenticity && analysis.authenticity.indicators && analysis.authenticity.indicators.length > 0) {
            console.log('\n✔️  AUTHENTICITY INDICATORS:');
            console.log('-'.repeat(40));
            analysis.authenticity.indicators.forEach((indicator, index) => {
                console.log(`${index + 1}. ${indicator}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('📋 FULL JSON RESPONSE');
        console.log('='.repeat(60));
        console.log(JSON.stringify(analysis, null, 2));

        console.log('\n' + '='.repeat(60));
        console.log('✅ DEMONSTRATION COMPLETE');
        console.log('='.repeat(60));

        // Show model status
        console.log('\n📊 AI MODEL STATUS:');
        console.log('-'.repeat(40));
        const modelStatus = aiAnalysisService.getModelStatus();
        modelStatus.forEach(model => {
            const status = model.available ? '✅ Available' : '❌ Unavailable';
            console.log(`${model.name}: ${status} (Calls: ${model.calls}, Errors: ${model.errors})`);
        });

    } catch (error) {
        console.error('\n❌ ANALYSIS FAILED:', error.message);
        console.error('\nThis might happen if all AI models are unavailable or rate limited.');
        console.error('The system would normally fall back to basic metrics analysis.');
    }
}

// Run the demonstration
console.log('Starting AI Analysis Demonstration...');
demonstrateAnalysis().then(() => {
    console.log('\n👋 Demo finished successfully!');
    process.exit(0);
}).catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
});