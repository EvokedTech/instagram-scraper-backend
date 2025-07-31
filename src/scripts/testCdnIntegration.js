require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const imageCdnService = require('../services/imageCdnService');
const cloudflareR2Service = require('../services/cloudflareR2Service');
const { RelatedProfileScraped, RootProfileScraped } = require('../models');

// Test data simulating Apify response
const testApifyResponse = {
  inputUrl: "https://www.instagram.com/test_user/",
  id: "123456789",
  username: "test_user",
  url: "https://www.instagram.com/test_user/",
  fullName: "Test User",
  biography: "Test bio for CDN integration",
  externalUrls: ["https://example.com"],
  followersCount: 1000,
  followsCount: 500,
  postsCount: 50,
  hasChannel: false,
  highlightReelCount: 2,
  isBusinessAccount: false,
  joinedRecently: false,
  businessCategoryName: null,
  private: false,
  verified: false,
  profilePicUrl: "https://instagram.fbom19-2.fna.fbcdn.net/v/t51.2885-19/123456_123456789012345_1234567890123456789_n.jpg?stp=dst-jpg_s150x150&_nc_ht=instagram.fbom19-2.fna.fbcdn.net&_nc_cat=1&_nc_ohc=AbCdEfGhIjK&edm=AP_V10EBAAAA&ccb=7-5&oh=00_AT-aBcDeFgHiJkLmNoPqRsTuVwXyZ&oe=12345678&_nc_sid=abcdef",
  profilePicUrlHD: "https://instagram.fbom19-2.fna.fbcdn.net/v/t51.2885-19/123456_123456789012345_1234567890123456789_n.jpg?_nc_ht=instagram.fbom19-2.fna.fbcdn.net&_nc_cat=1&_nc_ohc=AbCdEfGhIjK&edm=AP_V10EBAAAA&ccb=7-5&oh=00_AT-aBcDeFgHiJkLmNoPqRsTuVwXyZ&oe=12345678&_nc_sid=abcdef",
  igtvVideoCount: 5,
  fbid: "987654321",
  relatedProfiles: [
    {
      id: "111111",
      full_name: "Related User 1",
      is_private: false,
      is_verified: true,
      profile_pic_url: "https://instagram.fbom19-2.fna.fbcdn.net/related1.jpg",
      username: "related_user_1"
    }
  ],
  latestPosts: [
    {
      id: "3012345678901234567",
      type: "Image",
      shortCode: "CaBC123defg",
      caption: "Test post caption",
      hashtags: ["#test"],
      mentions: ["@mentioned_user"],
      url: "https://www.instagram.com/p/CaBC123defg/",
      commentsCount: 10,
      dimensionsHeight: 1080,
      dimensionsWidth: 1080,
      displayUrl: "https://instagram.fbom19-2.fna.fbcdn.net/post1.jpg",
      images: ["https://instagram.fbom19-2.fna.fbcdn.net/post1.jpg"],
      likesCount: 100,
      timestamp: "2024-01-15T10:30:00.000Z"
    }
  ],
  latestIgtvVideos: []
};

async function testCdnIntegration() {
  try {
    console.log('\n🚀 Starting CDN Integration Test\n');
    
    // Test 1: Check if CDN service is enabled
    console.log('1. Checking CDN service status...');
    const stats = imageCdnService.getStats();
    console.log('   CDN Service Status:', stats.enabled ? '✅ Enabled' : '❌ Disabled');
    
    if (!stats.enabled) {
      console.log('\n⚠️  CDN service is disabled. Please check Cloudflare configuration in .env file');
      return;
    }

    // Test 2: Test image download and upload
    console.log('\n2. Testing image download and CDN upload...');
    const testImageUrl = 'https://via.placeholder.com/150'; // Test image
    const cdnUrl = await cloudflareR2Service.processProfileImage(testImageUrl, 'test_user');
    console.log('   Original URL:', testImageUrl);
    console.log('   CDN URL:', cdnUrl);
    console.log('   Upload Status:', cdnUrl !== testImageUrl ? '✅ Success' : '❌ Failed');

    // Test 3: Test profile image processing
    console.log('\n3. Testing profile data CDN conversion...');
    const processedData = await imageCdnService.processCompleteProfile(
      testApifyResponse,
      'test_user',
      { includePostImages: false }
    );
    
    console.log('   Profile Pic URL converted:', 
      processedData.profilePicUrl !== testApifyResponse.profilePicUrl ? '✅ Yes' : '❌ No'
    );
    console.log('   Profile Pic HD URL converted:', 
      processedData.profilePicUrlHD !== testApifyResponse.profilePicUrlHD ? '✅ Yes' : '❌ No'
    );
    
    if (processedData._cdnProcessed) {
      console.log('   CDN Processing Metadata:', processedData._cdnProcessed);
    }

    // Test 4: Test MongoDB integration
    console.log('\n4. Testing MongoDB model integration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   MongoDB connected ✅');

    // Create a test session
    const Session = require('../models/Session');
    const testSession = await Session.create({
      name: 'CDN Test Session',
      description: 'Testing CDN integration',
      profiles: ['test_user'],
      config: {
        maxDepth: 1,
        maxProfilesPerDepth: 10
      }
    });
    console.log('   Test session created ✅');

    // Test with RelatedProfileScraped model
    const relatedProfile = new RelatedProfileScraped({
      sessionId: testSession._id,
      parentUsername: 'parent_user',
      parentProfileUrl: 'https://instagram.com/parent_user',
      depth: 1,
      username: 'test_user',
      profileUrl: 'https://instagram.com/test_user'
    });

    await relatedProfile.markAsScraped(testApifyResponse, {
      apifyRunId: 'test-run-123',
      processingTime: 1.5,
      discoveredFrom: 'relatedProfiles'
    });

    console.log('   RelatedProfile saved with CDN URLs ✅');
    console.log('   Saved profilePicUrl:', relatedProfile.profileData.profilePicUrl);
    console.log('   Saved profilePicUrlHD:', relatedProfile.profileData.profilePicUrlHD);

    // Test 5: Verify stats
    console.log('\n5. CDN Service Statistics:');
    const finalStats = imageCdnService.getStats();
    console.log('   Total Processed:', finalStats.processed);
    console.log('   Total Failed:', finalStats.failed);
    console.log('   Success Rate:', finalStats.successRate);
    console.log('   Cache Stats:', finalStats.cacheStats);

    // Cleanup
    await RelatedProfileScraped.deleteOne({ _id: relatedProfile._id });
    await Session.deleteOne({ _id: testSession._id });
    console.log('\n✅ Test cleanup completed');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('\n📤 MongoDB disconnected');
    }
  }
}

// Run the test
testCdnIntegration()
  .then(() => {
    console.log('\n🎉 CDN Integration Test Completed!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test Error:', error);
    process.exit(1);
  });