require('dotenv').config();
const axios = require('axios');

// Test profile for analysis
const testProfile = {
    username: 'cristiano',
    fullName: 'Cristiano Ronaldo',
    biography: '⚽ Football Player | 5x Ballon d\'Or | @manchesterunited @realmadrid @juventus | CR7 Brand | Family ❤️',
    followersCount: 615000000,
    followingCount: 583,
    postsCount: 3650,
    isVerified: true,
    isBusinessAccount: false,
    categoryName: 'Athlete',
    externalUrl: 'https://cr7.com'
};

async function analyzeWithDeepSeek() {
    console.log('\n' + '='.repeat(70));
    console.log('🤖 DEEPSEEK AI ANALYSIS TEST');
    console.log('='.repeat(70));

    console.log('\n📱 PROFILE TO ANALYZE:');
    console.log('-'.repeat(50));
    console.log(`Username: @${testProfile.username}`);
    console.log(`Full Name: ${testProfile.fullName}`);
    console.log(`Followers: ${testProfile.followersCount.toLocaleString()}`);
    console.log(`Bio: ${testProfile.biography}`);

    console.log('\n🔄 Sending to DeepSeek AI...\n');

    const prompt = `Analyze this Instagram profile and provide detailed insights:

Profile Data:
- Username: ${testProfile.username}
- Full Name: ${testProfile.fullName}
- Biography: ${testProfile.biography}
- Followers: ${testProfile.followersCount}
- Following: ${testProfile.followingCount}
- Posts: ${testProfile.postsCount}
- Is Verified: ${testProfile.isVerified}
- Is Business: ${testProfile.isBusinessAccount}
- Category: ${testProfile.categoryName}
- External URL: ${testProfile.externalUrl}

Please provide analysis in the following JSON format:
{
    "profileType": "personal/business/influencer/brand/celebrity",
    "engagementRate": "percentage estimate",
    "audienceQuality": "high/medium/low",
    "contentStrategy": "description of content strategy",
    "growthPotential": "high/medium/low",
    "authenticity": {
        "score": 1-10,
        "indicators": ["list of authenticity indicators"]
    },
    "recommendations": ["list of recommendations"],
    "keyInsights": ["list of key insights"],
    "estimatedValue": {
        "tier": "nano/micro/mid/macro/mega",
        "monthlyValue": "estimated monetary value range"
    },
    "risks": ["potential risks or red flags"],
    "opportunities": ["growth or collaboration opportunities"]
}`;

    try {
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Instagram profile analyzer. Analyze the provided profile data and return insights in JSON format.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 4000,
                stream: false
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer sk-57fb77112c994135a1b323ef1c0888d0'
                },
                timeout: 30000
            }
        );

        if (response.data && response.data.choices && response.data.choices[0]) {
            const content = response.data.choices[0].message.content;

            console.log('✅ DEEPSEEK RESPONSE RECEIVED!\n');
            console.log('='.repeat(70));
            console.log('📊 RAW AI RESPONSE:');
            console.log('='.repeat(70));
            console.log(content);
            console.log('\n' + '='.repeat(70));

            // Try to parse JSON from response
            try {
                let analysis;
                const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[1]);
                } else {
                    analysis = JSON.parse(content);
                }

                console.log('📈 PARSED ANALYSIS:');
                console.log('='.repeat(70));
                console.log(JSON.stringify(analysis, null, 2));

                console.log('\n' + '='.repeat(70));
                console.log('🎯 KEY FINDINGS:');
                console.log('='.repeat(70));
                console.log(`\n✅ Profile Type: ${analysis.profileType}`);
                console.log(`✅ Engagement Rate: ${analysis.engagementRate}`);
                console.log(`✅ Audience Quality: ${analysis.audienceQuality}`);
                console.log(`✅ Authenticity Score: ${analysis.authenticity.score}/10`);
                console.log(`✅ Estimated Tier: ${analysis.estimatedValue.tier}`);
                console.log(`✅ Monthly Value: ${analysis.estimatedValue.monthlyValue}`);

                if (analysis.keyInsights && analysis.keyInsights.length > 0) {
                    console.log('\n📍 Top Insights:');
                    analysis.keyInsights.slice(0, 3).forEach((insight, i) => {
                        console.log(`   ${i + 1}. ${insight}`);
                    });
                }

            } catch (parseError) {
                console.log('Note: Response is not in JSON format, showing raw text analysis');
            }

            // Show token usage if available
            if (response.data.usage) {
                console.log('\n' + '='.repeat(70));
                console.log('📊 TOKEN USAGE:');
                console.log('='.repeat(70));
                console.log(`Prompt Tokens: ${response.data.usage.prompt_tokens}`);
                console.log(`Completion Tokens: ${response.data.usage.completion_tokens}`);
                console.log(`Total Tokens: ${response.data.usage.total_tokens}`);
            }

            console.log('\n' + '='.repeat(70));
            console.log('✅ DEEPSEEK ANALYSIS COMPLETE!');
            console.log('='.repeat(70));

        }
    } catch (error) {
        console.error('❌ Error calling DeepSeek:', error.response?.data || error.message);

        if (error.response?.data) {
            console.log('\nFull error response:');
            console.log(JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the test
console.log('Starting DeepSeek Analysis Test...');
analyzeWithDeepSeek().then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
}).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});