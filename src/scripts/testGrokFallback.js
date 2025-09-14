/**
 * Test Grok Fallback
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

class ProfileAnalyzer {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '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';
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.primaryModel = 'qwen/qwen-2.5-72b-instruct';
    this.fallbackModel = 'x-ai/grok-3-mini';
  }

  async analyzeWithModel(profileData, model, maxTokens = 400) {
    const prompt = `
      Analyze this Instagram profile:
      Username: @${profileData.username}
      Followers: ${profileData.followers}

      Respond in JSON format with:
      {
        "profileSummary": ["insight 1", "insight 2", "insight 3"],
        "influencerTier": "Micro/Mid-Tier/Macro"
      }
    `;

    console.log(`\n📡 Calling ${model}...`);

    const response = await axios.post(
      this.apiUrl,
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an Instagram profile analyzer. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: maxTokens
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://instagram-analyzer.com',
          'X-Title': 'Test Fallback'
        },
        timeout: 15000
      }
    );

    const text = response.data.choices[0].message.content;
    console.log(`✅ Response from ${model}:`, text.substring(0, 100) + '...');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      parsed.modelUsed = model;
      return parsed;
    }

    throw new Error('Could not parse JSON from response');
  }

  async analyzeProfile(profileData) {
    try {
      // Try primary model with too many tokens (will fail)
      console.log('\n🔹 STEP 1: Trying Qwen with 1500 tokens (will fail)...');
      return await this.analyzeWithModel(profileData, this.primaryModel, 1500);
    } catch (primaryError) {
      console.error(`❌ Primary model failed:`, primaryError.response?.data?.error?.message || primaryError.message);

      try {
        // Try fallback model (Grok)
        console.log('\n🔹 STEP 2: Switching to Grok-3-mini fallback...');
        return await this.analyzeWithModel(profileData, this.fallbackModel, 400);
      } catch (fallbackError) {
        console.error(`❌ Fallback model also failed:`, fallbackError.message);

        // Local fallback
        console.log('\n🔹 STEP 3: Using local fallback...');
        return {
          profileSummary: [
            'Profile analysis generated locally',
            'Due to API limitations',
            'Basic insights provided'
          ],
          influencerTier: 'Mid-Tier',
          modelUsed: 'local-fallback'
        };
      }
    }
  }
}

async function testFallback() {
  console.log('🧪 TESTING GROK FALLBACK MECHANISM');
  console.log('=' .repeat(50));

  const analyzer = new ProfileAnalyzer();

  const testProfile = {
    username: 'testuser',
    followers: 25000
  };

  const result = await analyzer.analyzeProfile(testProfile);

  console.log('\n' + '=' .repeat(50));
  console.log('✅ FINAL RESULT:');
  console.log('Model used:', result.modelUsed);
  console.log('Profile summary:', result.profileSummary);
  console.log('=' .repeat(50));
}

testFallback().catch(console.error);