/**
 * Test Model Tracking
 * Tests if the modelUsed field is properly tracked
 */

const axios = require('axios');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';

async function testModelTracking() {
  const testProfile = {
    username: 'testuser123',
    fullName: 'Test User',
    biography: 'This is a test profile for model tracking',
    followersCount: 5000,
    followsCount: 500,
    postsCount: 100,
    verified: false,
    isBusinessAccount: false
  };

  console.log('🧪 Testing Model Tracking...');
  console.log('=' .repeat(50));

  try {
    // Test with primary model
    console.log('\n1️⃣ Testing Primary Model (Qwen 2.5)...');
    const primaryResponse = await callModel(testProfile, 'qwen/qwen2.5-vl-72b-instruct');
    console.log('   Model returned:', primaryResponse.modelUsed || 'NOT SET');

    // Test with fallback model
    console.log('\n2️⃣ Testing Fallback Model (Grok)...');
    const fallbackResponse = await callModel(testProfile, 'x-ai/grok-3-mini');
    console.log('   Model returned:', fallbackResponse.modelUsed || 'NOT SET');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function callModel(profileData, model) {
  const prompt = `
    Analyze this Instagram profile:
    Username: @${profileData.username}
    Followers: ${profileData.followersCount}

    Provide a JSON response with:
    {
      "gender": "Male/Female/Brand/Unknown",
      "profileSummary": ["One insight about the profile"]
    }
  `;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Instagram profile analyzer.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://instagram-analyzer.com',
          'X-Title': 'Instagram Profile Analyzer'
        },
        timeout: 10000
      }
    );

    const text = response.data.choices[0].message.content;
    console.log('   ✅ API call successful');

    // Return with modelUsed
    return {
      response: text,
      modelUsed: model  // This should be tracked
    };

  } catch (error) {
    console.error(`   ❌ API call failed: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
    }
    throw error;
  }
}

// Run the test
testModelTracking();