#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');

const models = [
    {
        name: 'DeepSeek-R1',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
    },
    {
        name: 'Grok',
        endpoint: 'https://api.x.ai/v1/chat/completions',
        apiKey: process.env.GROK_API_KEY,
        model: 'grok-4-latest'
    },
    {
        name: 'Mistral',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        apiKey: process.env.MISTRAL_API_KEY,
        model: 'mistral-large-latest'
    }
];

async function testModel(modelConfig) {
    console.log(`\nTesting ${modelConfig.name}...`);
    console.log('-'.repeat(30));

    try {
        const response = await axios.post(
            modelConfig.endpoint,
            {
                model: modelConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant. Reply with a simple JSON object.'
                    },
                    {
                        role: 'user',
                        content: 'Please respond with a JSON object containing: {"status": "working", "model": "your-model-name"}'
                    }
                ],
                temperature: 0.7,
                max_tokens: 100,
                stream: false
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${modelConfig.apiKey}`
                },
                timeout: 10000
            }
        );

        if (response.data && response.data.choices && response.data.choices[0]) {
            console.log(`✅ ${modelConfig.name} is WORKING`);
            console.log(`   Response: ${response.data.choices[0].message.content.substring(0, 100)}...`);
            return true;
        }
    } catch (error) {
        console.log(`❌ ${modelConfig.name} FAILED`);
        console.log(`   Error: ${error.response?.data?.error?.message || error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('========================================');
    console.log('AI MODEL CONNECTIVITY TEST');
    console.log('========================================');

    const results = [];

    for (const model of models) {
        const success = await testModel(model);
        results.push({ name: model.name, success });
    }

    console.log('\n========================================');
    console.log('TEST RESULTS SUMMARY');
    console.log('========================================');

    results.forEach((result, index) => {
        const status = result.success ? '✅ OPERATIONAL' : '❌ FAILED';
        const role = index === 0 ? '(Primary)' : index === 1 ? '(First Fallback)' : '(Second Fallback)';
        console.log(`${index + 1}. ${result.name} ${role}: ${status}`);
    });

    const workingModels = results.filter(r => r.success).length;
    console.log(`\nWorking Models: ${workingModels}/${results.length}`);

    if (workingModels === 0) {
        console.log('\n⚠️  WARNING: No AI models are currently operational!');
        console.log('Please check your API keys and network connectivity.');
    } else if (workingModels < results.length) {
        console.log('\n⚠️  WARNING: Some models are not operational.');
        console.log('The system will use fallback models when needed.');
    } else {
        console.log('\n✅ All models are operational!');
        console.log('Full redundancy is available.');
    }

    process.exit(workingModels === 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
});