/**
 * Test OpenRouter API Connection
 */

const axios = require('axios');

async function testOpenRouter() {
  const apiKey = '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';
  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  console.log('🔧 Testing OpenRouter API Connection');
  console.log('=====================================');
  console.log('🔑 API Key:', apiKey.substring(0, 20) + '...');
  console.log('🌐 API URL:', apiUrl);
  console.log('=====================================\n');

  // Try different model names
  const modelsToTest = [
    'qwen/qwen-2.5-72b-instruct',
    'qwen/qwen-2-72b-instruct',
    'openai/gpt-3.5-turbo',
    'anthropic/claude-3-haiku',
    'meta-llama/llama-3.2-3b-instruct:free'
  ];

  for (const model of modelsToTest) {
    console.log(`\n🤖 Testing model: ${model}`);
    console.log('-'.repeat(40));

    try {
      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello, API is working!" in JSON format with a field called "status"'
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      };

      console.log('📤 Sending request...');
      console.log('   Body:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        apiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://instagram-analyzer.com',
            'X-Title': 'API Test'
          },
          timeout: 15000
        }
      );

      console.log('✅ SUCCESS!');
      console.log('   Status:', response.status);
      console.log('   Model Used:', response.data.model);
      console.log('   Response:', response.data.choices[0].message.content);
      console.log('   Usage:', JSON.stringify(response.data.usage, null, 2));

      // If this model works, use it for the rest
      console.log('\n🎉 Found working model:', model);
      return model;

    } catch (error) {
      console.log('❌ FAILED');

      if (error.response) {
        console.log('   Status:', error.response.status);
        console.log('   Error:', error.response.data?.error || error.response.data);

        if (error.response.status === 404) {
          console.log('   → Model not found');
        } else if (error.response.status === 402) {
          console.log('   → Payment required / Insufficient credits');
        } else if (error.response.status === 401) {
          console.log('   → Invalid API key');
        } else if (error.response.status === 429) {
          console.log('   → Rate limit exceeded');
        }
      } else if (error.request) {
        console.log('   → No response received from API');
        console.log('   → Check internet connection or API endpoint');
      } else {
        console.log('   → Error:', error.message);
      }
    }
  }

  console.log('\n❌ No working models found');
  console.log('Please check:');
  console.log('1. API key is valid');
  console.log('2. Account has credits');
  console.log('3. Model names are correct');
}

// Run the test
testOpenRouter().catch(console.error);