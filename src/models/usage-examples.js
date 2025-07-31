/**
 * Usage Examples for Updated MongoDB Models
 * 
 * This file demonstrates how to use the RootProfileScraped and RelatedProfileScraped
 * models with the complete Apify Instagram scraper output structure.
 */

const { RootProfileScraped, RelatedProfileScraped } = require('./index');

// Example 1: Saving a Root Profile with Complete Apify Data
async function saveRootProfile(sessionId, apifyScrapedData) {
  try {
    // Create new root profile document
    const rootProfile = new RootProfileScraped({
      sessionId: sessionId,
      username: apifyScrapedData.username.toLowerCase().trim(),
      profileUrl: apifyScrapedData.url || `https://instagram.com/${apifyScrapedData.username}`,
      depth: 0 // Always 0 for root profiles
    });

    // Save with complete Apify response and metadata
    await rootProfile.markAsScraped(apifyScrapedData, {
      apifyRunId: 'NJThPp3nRlBvlqtdf',
      datasetId: '7ZlESaINNbukPiOyI',
      scrapingDuration: 8240,
      processingTime: 8.24
    });

    console.log(`Root profile ${rootProfile.username} saved successfully`);
    return rootProfile;
  } catch (error) {
    console.error('Error saving root profile:', error);
    throw error;
  }
}

// Example 2: Saving a Related Profile with Complete Apify Data
async function saveRelatedProfile(sessionId, parentUsername, parentUrl, depth, apifyScrapedData) {
  try {
    // Create new related profile document
    const relatedProfile = new RelatedProfileScraped({
      sessionId: sessionId,
      parentUsername: parentUsername.toLowerCase().trim(),
      parentProfileUrl: parentUrl,
      depth: depth,
      username: apifyScrapedData.username.toLowerCase().trim(),
      profileUrl: apifyScrapedData.url || `https://instagram.com/${apifyScrapedData.username}`
    });

    // Save with complete Apify response and metadata
    await relatedProfile.markAsScraped(apifyScrapedData, {
      apifyRunId: 'KhTB4p3nRlCvmqsef',
      datasetId: '8YmFRbJOMcvlQuOhJ',
      scrapingDuration: 5420,
      processingTime: 5.42,
      discoveredFrom: 'relatedProfiles'
    });

    console.log(`Related profile ${relatedProfile.username} at depth ${depth} saved successfully`);
    return relatedProfile;
  } catch (error) {
    console.error('Error saving related profile:', error);
    throw error;
  }
}

// Example 3: Querying Top Influencers
async function findTopInfluencers(sessionId, minFollowers = 100000) {
  try {
    const topInfluencers = await RelatedProfileScraped.find({
      sessionId: sessionId,
      'profileData.followersCount': { $gt: minFollowers },
      'profileData.verified': true,
      'profileData.private': false
    })
    .sort({ 'profileData.followersCount': -1 })
    .limit(20)
    .select('username profileUrl depth profileData.fullName profileData.followersCount profileData.biography');

    return topInfluencers;
  } catch (error) {
    console.error('Error finding top influencers:', error);
    throw error;
  }
}

// Example 4: Text Search in Profiles and Posts
async function searchProfilesAndPosts(sessionId, searchTerm) {
  try {
    // Search in root profiles
    const rootResults = await RootProfileScraped.find({
      sessionId: sessionId,
      $text: { $search: searchTerm }
    })
    .select('username profileUrl profileData.biography profileData.followersCount')
    .limit(10);

    // Search in related profiles
    const relatedResults = await RelatedProfileScraped.find({
      sessionId: sessionId,
      $text: { $search: searchTerm }
    })
    .select('username profileUrl depth profileData.biography profileData.followersCount')
    .limit(10);

    return {
      rootProfiles: rootResults,
      relatedProfiles: relatedResults
    };
  } catch (error) {
    console.error('Error searching profiles:', error);
    throw error;
  }
}

// Example 5: Find Profiles with Carousel Posts
async function findProfilesWithCarousels(sessionId) {
  try {
    const profiles = await RootProfileScraped.find({
      sessionId: sessionId,
      'profileData.latestPosts': {
        $elemMatch: {
          type: 'Sidecar',
          'childPosts.0': { $exists: true }
        }
      }
    })
    .select('username profileUrl profileData.latestPosts.$');

    return profiles;
  } catch (error) {
    console.error('Error finding profiles with carousels:', error);
    throw error;
  }
}

// Example 6: Analyze Engagement Rates
async function analyzeEngagementRates(sessionId) {
  try {
    // Get all scraped profiles with posts
    const profiles = await RootProfileScraped.find({
      sessionId: sessionId,
      status: 'scraped',
      'profileData.latestPosts.0': { $exists: true }
    })
    .select('username profileData.followersCount followersRatio avgEngagementRate');

    // Sort by engagement rate
    const sortedByEngagement = profiles
      .map(p => ({
        username: p.username,
        followersCount: p.profileData.followersCount,
        followersRatio: p.followersRatio,
        avgEngagementRate: p.avgEngagementRate
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    return sortedByEngagement;
  } catch (error) {
    console.error('Error analyzing engagement rates:', error);
    throw error;
  }
}

// Example 7: Get Session Statistics
async function getSessionStatistics(sessionId) {
  try {
    // Root profiles stats
    const rootStats = await RootProfileScraped.getSessionStats(sessionId);
    
    // Related profiles stats by depth
    const relatedStats = await RelatedProfileScraped.getDepthStats(sessionId);
    
    // Top influencers
    const topInfluencers = await RelatedProfileScraped.getTopInfluencers(sessionId, 10);

    return {
      rootProfiles: rootStats,
      relatedProfilesByDepth: relatedStats,
      topInfluencers: topInfluencers
    };
  } catch (error) {
    console.error('Error getting session statistics:', error);
    throw error;
  }
}

// Example 8: Find Profiles by Music Usage
async function findProfilesByMusic(sessionId, artistName) {
  try {
    const profiles = await RootProfileScraped.find({
      sessionId: sessionId,
      'profileData.latestPosts.musicInfo.artist_name': new RegExp(artistName, 'i')
    })
    .select('username profileUrl profileData.latestPosts.musicInfo');

    return profiles;
  } catch (error) {
    console.error('Error finding profiles by music:', error);
    throw error;
  }
}

// Example 9: Handle Failed Profiles
async function markProfileAsFailed(profileId, error) {
  try {
    // Try root profile first
    let profile = await RootProfileScraped.findById(profileId);
    
    if (!profile) {
      // Try related profile
      profile = await RelatedProfileScraped.findById(profileId);
    }

    if (profile) {
      await profile.markAsFailed(error);
      console.log(`Profile ${profile.username} marked as failed`);
    }

    return profile;
  } catch (error) {
    console.error('Error marking profile as failed:', error);
    throw error;
  }
}

// Example 10: Complete Apify Data Structure Example
const exampleApifyResponse = {
  inputUrl: "https://www.instagram.com/soy_loruga/",
  id: "32769279847",
  username: "soy_loruga",
  url: "https://www.instagram.com/soy_loruga/",
  fullName: "Alvaro | Lifestyle 🐒",
  biography: "Bienvenido a mi mundo 🌍\n🎬 Videos diarios\n📍 Madrid, Spain\n📧 Business: contact@soyloruga.com",
  externalUrls: ["https://linktr.ee/soyloruga"],
  followersCount: 1234567,
  followsCount: 234,
  postsCount: 456,
  hasChannel: true,
  highlightReelCount: 5,
  isBusinessAccount: true,
  joinedRecently: false,
  businessCategoryName: "Digital Creator",
  private: false,
  verified: true,
  profilePicUrl: "https://scontent.cdninstagram.com/...",
  profilePicUrlHD: "https://scontent.cdninstagram.com/..._hd.jpg",
  igtvVideoCount: 23,
  fbid: "1234567890",
  
  relatedProfiles: [
    {
      id: "123456",
      full_name: "Related User 1",
      is_private: false,
      is_verified: true,
      profile_pic_url: "https://...",
      username: "relateduser1"
    }
    // ... more related profiles
  ],
  
  latestPosts: [
    {
      id: "3012345678901234567",
      type: "Sidecar", // Carousel post
      shortCode: "CaBC123defg",
      caption: "Amazing carousel post! 🎨 #art #design @taggeduser",
      hashtags: ["#art", "#design"],
      mentions: ["@taggeduser"],
      url: "https://www.instagram.com/p/CaBC123defg/",
      commentsCount: 234,
      dimensionsHeight: 1080,
      dimensionsWidth: 1080,
      displayUrl: "https://scontent.cdninstagram.com/...",
      images: [
        "https://scontent.cdninstagram.com/image1.jpg",
        "https://scontent.cdninstagram.com/image2.jpg"
      ],
      likesCount: 5678,
      timestamp: "2024-01-15T10:30:00.000Z",
      productType: "carousel_container",
      isCommentsDisabled: false,
      
      childPosts: [
        {
          id: "3012345678901234568",
          type: "Image",
          shortCode: "CaBC123defg_1",
          displayUrl: "https://scontent.cdninstagram.com/child1.jpg",
          images: ["https://scontent.cdninstagram.com/child1.jpg"],
          dimensionsHeight: 1080,
          dimensionsWidth: 1080,
          taggedUsers: [
            {
              full_name: "Tagged User",
              id: "987654321",
              is_verified: false,
              profile_pic_url: "https://...",
              username: "taggeduser"
            }
          ]
        },
        {
          id: "3012345678901234569",
          type: "Video",
          shortCode: "CaBC123defg_2",
          displayUrl: "https://scontent.cdninstagram.com/child2.jpg",
          videoUrl: "https://scontent.cdninstagram.com/child2.mp4",
          videoDuration: 15.5,
          videoViewCount: 1234
        }
      ],
      
      taggedUsers: [
        {
          full_name: "Tagged User",
          id: "987654321",
          is_verified: false,
          profile_pic_url: "https://...",
          username: "taggeduser"
        }
      ]
    },
    {
      id: "3012345678901234570",
      type: "Video",
      shortCode: "CaBC456hijk",
      caption: "Check out this video! 🎥",
      url: "https://www.instagram.com/p/CaBC456hijk/",
      videoUrl: "https://scontent.cdninstagram.com/video.mp4",
      videoDuration: 30.5,
      videoViewCount: 12345,
      musicInfo: {
        artist_name: "Artist Name",
        song_name: "Song Title",
        uses_original_audio: false,
        audio_id: "123456789"
      }
    }
  ],
  
  latestIgtvVideos: [
    {
      id: "2912345678901234567",
      type: "Video",
      shortCode: "CaIG789lmno",
      title: "IGTV Video Title",
      caption: "Full IGTV video description...",
      url: "https://www.instagram.com/tv/CaIG789lmno/",
      videoUrl: "https://scontent.cdninstagram.com/igtv.mp4",
      videoDuration: 600.5,
      videoViewCount: 54321,
      likesCount: 2345,
      commentsCount: 123,
      hashtags: ["#igtv", "#video"],
      timestamp: "2024-01-10T15:45:00.000Z"
    }
  ]
};

module.exports = {
  saveRootProfile,
  saveRelatedProfile,
  findTopInfluencers,
  searchProfilesAndPosts,
  findProfilesWithCarousels,
  analyzeEngagementRates,
  getSessionStatistics,
  findProfilesByMusic,
  markProfileAsFailed,
  exampleApifyResponse
};