require('dotenv').config();
const mongoose = require('mongoose');
const n8nWebhookService = require('../services/n8n/N8nWebhookService');
const logger = require('../utils/logger');

async function testN8nWebhook() {
  try {
    console.log('Testing n8n webhook connectivity...');
    console.log('Webhook URL:', process.env.N8N_WEBHOOK_URL || 'https://evoked.app.n8n.cloud/webhook-test/analysed-data');
    
    // Test webhook connectivity
    const testResult = await n8nWebhookService.testWebhook();
    console.log('Test result:', testResult);
    
    if (testResult.success) {
      console.log('✅ Webhook is reachable!');
      
      // Test with sample profile data
      console.log('\nTesting with sample profile data...');
      
      const sampleProfile = {
        _id: 'test123',
        username: 'testuser',
        sessionId: 'session123',
        depth: 1,
        profileUrl: 'https://instagram.com/testuser',
        profileData: {
          id: '12345',
          username: 'testuser',
          fullName: 'Test User',
          biography: 'This is a test profile',
          profilePicUrl: 'https://example.com/pic.jpg',
          followersCount: 1000,
          followsCount: 500,
          postsCount: 50,
          verified: false,
          isBusinessAccount: false,
          isPrivate: false,
          externalUrl: 'https://example.com',
          externalUrls: ['https://example.com', 'https://test.com'],
          posts: [
            {
              id: 'post1',
              shortCode: 'ABC123',
              caption: 'Test post',
              likesCount: 100,
              commentsCount: 10,
              timestamp: new Date().toISOString(),
              type: 'image',
              url: 'https://instagram.com/p/ABC123',
              displayUrl: 'https://example.com/image.jpg'
            }
          ]
        },
        scrapedAt: new Date()
      };
      
      const sendResult = await n8nWebhookService.sendProfileData(sampleProfile);
      console.log('Send result:', sendResult);
      
      if (sendResult.success) {
        console.log('✅ Successfully sent sample profile data to n8n!');
      } else {
        console.log('❌ Failed to send sample profile data:', sendResult.error);
      }
    } else {
      console.log('❌ Webhook is not reachable:', testResult.message);
    }
    
  } catch (error) {
    console.error('Error testing n8n webhook:', error);
  }
}

// Run the test
testN8nWebhook();