require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const Session = require('../models/Session');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const logger = require('../utils/logger');

// Sample data based on the provided structure
const sampleSession = {
  name: "Fashion Influencers Analysis",
  description: "Scraping fashion influencers and their networks",
  rootProfiles: [
    "https://www.instagram.com/sof_alexa/",
    "https://www.instagram.com/username2/"
  ],
  config: {
    maxDepth: 2,
    maxProfilesPerDepth: 100,
    analysisEnabled: true
  },
  status: "running",
  stats: {
    totalProfiles: 1247,
    scrapedProfiles: 856,
    currentDepth: 1,
    startedAt: new Date("2025-01-15T10:00:00Z")
  }
};

const sampleRootProfile = {
  username: "sof_alexa",
  profileUrl: "https://www.instagram.com/sof_alexa/",
  depth: 0,
  status: "scraped",
  scrapedAt: new Date("2025-01-15T11:15:00Z"),
  profileData: {
    inputUrl: "https://www.instagram.com/sof_alexa/",
    id: "2365903225",
    username: "sof_alexa",
    url: "https://www.instagram.com/sof_alexa",
    fullName: "Sofia Alexandra 🍓",
    biography: "Una cubana cancuneando \n🇨🇺~🇲🇽\nCEO: @ohl.alashes",
    externalUrls: [],
    followersCount: 94170,
    followsCount: 929,
    hasChannel: false,
    highlightReelCount: 18,
    isBusinessAccount: false,
    joinedRecently: false,
    businessCategoryName: "Personal blog",
    private: false,
    verified: false,
    profilePicUrl: "https://scontent-gru2-2.cdninstagram.com/...",
    profilePicUrlHD: "https://scontent-gru2-2.cdninstagram.com/...",
    igtvVideoCount: 2,
    postsCount: 285,
    fbid: "17841402376775737",
    relatedProfiles: [
      {
        id: "5805390591",
        full_name: "Yiseh",
        is_private: false,
        is_verified: false,
        profile_pic_url: "https://scontent-gru1-2.cdninstagram.com/...",
        username: "yisehh_99"
      },
      {
        id: "48381468907",
        full_name: "Arlet VPR",
        is_private: false,
        is_verified: false,
        profile_pic_url: "https://scontent-gru2-2.cdninstagram.com/...",
        username: "arlet.v1996"
      }
    ],
    latestPosts: [
      {
        id: "3680484039219194391",
        type: "Video",
        shortCode: "DMTtLvPJ6oX",
        caption: "🔥😉\n#fyp #reels #reelsinstagram",
        hashtags: ["fyp", "reels", "reelsinstagram", "reelsvideo"],
        mentions: [],
        url: "https://www.instagram.com/p/DMTtLvPJ6oX/",
        commentsCount: 1,
        dimensionsHeight: 1920,
        dimensionsWidth: 1080,
        displayUrl: "https://scontent-gru2-2.cdninstagram.com/...",
        likesCount: 14,
        videoViewCount: 0,
        timestamp: "2025-07-19T23:32:33.000Z",
        productType: "clips",
        musicInfo: {
          artist_name: "Ariana Grande",
          song_name: "7 rings (Remix) [feat. 2 Chainz]",
          uses_original_audio: false,
          audio_id: "545755629269815"
        },
        locationName: null,
        locationId: null,
        isCommentsDisabled: false
      }
    ],
    latestIgtvVideos: [
      {
        type: "Video",
        shortCode: "CXutdlNA2w0",
        title: "",
        caption: "Remember 🥥🤍\n#likesforlike #followforfollowback",
        commentsCount: 9,
        dimensionsHeight: 1333,
        dimensionsWidth: 750,
        displayUrl: "https://scontent-gru1-2.cdninstagram.com/...",
        likesCount: 617,
        videoDuration: 7.966,
        videoViewCount: 6013,
        hashtags: ["likesforlike", "followforfollowback", "pool"],
        timestamp: "2021-12-21T03:30:43.000Z",
        locationName: "Melia Peninsula Varadero",
        locationId: "422190387852326"
      }
    ]
  },
  metadata: {
    apifyRunId: "run_abc123def456",
    processingTime: 45.2,
    relatedProfilesCount: 85,
    postsCount: 12,
    igtvCount: 2
  }
};

const sampleRelatedProfile = {
  parentProfileUrl: "https://www.instagram.com/sof_alexa/",
  parentUsername: "sof_alexa",
  depth: 1,
  username: "yisehh_99",
  profileUrl: "https://www.instagram.com/yisehh_99/",
  status: "scraped",
  scrapedAt: new Date("2025-01-15T12:30:00Z"),
  profileData: {
    inputUrl: "https://www.instagram.com/yisehh_99/",
    id: "5805390591",
    username: "yisehh_99",
    url: "https://www.instagram.com/yisehh_99",
    fullName: "Yiseh",
    biography: "Fitness enthusiast 💪 | Lifestyle blogger",
    externalUrls: [],
    followersCount: 12450,
    followsCount: 567,
    hasChannel: false,
    highlightReelCount: 5,
    isBusinessAccount: false,
    joinedRecently: false,
    businessCategoryName: null,
    private: false,
    verified: false,
    profilePicUrl: "https://scontent-gru1-2.cdninstagram.com/...",
    profilePicUrlHD: "https://scontent-gru1-2.cdninstagram.com/...",
    igtvVideoCount: 0,
    postsCount: 156,
    fbid: "17841402376775737",
    relatedProfiles: [
      {
        id: "1234567890",
        full_name: "Another User",
        is_private: false,
        is_verified: false,
        profile_pic_url: "https://scontent-gru1-2.cdninstagram.com/...",
        username: "another_user"
      }
    ],
    latestPosts: [
      {
        id: "3680484039219194392",
        type: "Photo",
        shortCode: "DMTtLvPJ6oY",
        caption: "Workout motivation 💪 #fitness #gym",
        hashtags: ["fitness", "gym", "motivation"],
        mentions: [],
        url: "https://www.instagram.com/p/DMTtLvPJ6oY/",
        commentsCount: 8,
        dimensionsHeight: 1080,
        dimensionsWidth: 1080,
        displayUrl: "https://scontent-gru2-2.cdninstagram.com/...",
        likesCount: 89,
        timestamp: "2025-07-18T15:20:00.000Z",
        productType: "feed",
        locationName: "Gold's Gym",
        locationId: "123456789",
        isCommentsDisabled: false
      }
    ],
    latestIgtvVideos: []
  },
  metadata: {
    apifyRunId: "run_def456ghi789",
    processingTime: 32.8,
    relatedProfilesCount: 42,
    postsCount: 12,
    igtvCount: 0,
    discoveredFrom: "relatedProfiles"
  }
};

async function testSchemas() {
  try {
    logger.info('Starting schema test...');
    
    // Connect to database
    await connectDB();
    logger.info('Connected to MongoDB');

    // Clear existing test data
    logger.info('Clearing existing test data...');
    await Session.deleteMany({ name: "Fashion Influencers Analysis" });
    await RootProfileScraped.deleteMany({ username: { $in: ["sof_alexa", "username2"] } });
    await RelatedProfileScraped.deleteMany({ username: "yisehh_99" });

    // Test 1: Create a session
    logger.info('\n=== Test 1: Creating Session ===');
    const session = new Session(sampleSession);
    await session.save();
    logger.info('Session created:', {
      id: session._id,
      name: session.name,
      status: session.status,
      progressPercentage: session.progressPercentage
    });

    // Test 2: Create root profile
    logger.info('\n=== Test 2: Creating Root Profile ===');
    const rootProfile = new RootProfileScraped({
      ...sampleRootProfile,
      sessionId: session._id
    });
    await rootProfile.save();
    logger.info('Root profile created:', {
      id: rootProfile._id,
      username: rootProfile.username,
      followers: rootProfile.profileData.followersCount,
      engagementRate: rootProfile.avgEngagementRate.toFixed(2) + '%'
    });

    // Test 3: Create related profile
    logger.info('\n=== Test 3: Creating Related Profile ===');
    const relatedProfile = new RelatedProfileScraped({
      ...sampleRelatedProfile,
      sessionId: session._id
    });
    await relatedProfile.save();
    logger.info('Related profile created:', {
      id: relatedProfile._id,
      username: relatedProfile.username,
      parentUsername: relatedProfile.parentUsername,
      depth: relatedProfile.depth
    });

    // Test 4: Query sessions
    logger.info('\n=== Test 4: Querying Sessions ===');
    const activeSessions = await Session.findActive();
    logger.info(`Found ${activeSessions.length} active sessions`);

    // Test 5: Query root profiles
    logger.info('\n=== Test 5: Querying Root Profiles ===');
    const sessionProfiles = await RootProfileScraped.findBySession(session._id);
    logger.info(`Found ${sessionProfiles.length} root profiles for session`);

    // Test 6: Query related profiles by depth
    logger.info('\n=== Test 6: Querying Related Profiles by Depth ===');
    const depth1Profiles = await RelatedProfileScraped.findBySessionAndDepth(session._id, 1);
    logger.info(`Found ${depth1Profiles.length} profiles at depth 1`);

    // Test 7: Get depth statistics
    logger.info('\n=== Test 7: Getting Depth Statistics ===');
    const depthStats = await RelatedProfileScraped.getDepthStats(session._id);
    logger.info('Depth statistics:', depthStats);

    // Test 8: Update session stats
    logger.info('\n=== Test 8: Updating Session Stats ===');
    await session.incrementScrapedProfiles();
    logger.info('Updated session stats:', {
      scrapedProfiles: session.stats.scrapedProfiles,
      progressPercentage: session.progressPercentage
    });

    // Test 9: Test error handling
    logger.info('\n=== Test 9: Testing Error Handling ===');
    const failedProfile = new RootProfileScraped({
      sessionId: session._id,
      username: "test_failed",
      profileUrl: "https://www.instagram.com/test_failed/",
      status: "pending"
    });
    await failedProfile.save();
    await failedProfile.markAsFailed(new Error('Test error: Profile not found'));
    logger.info('Failed profile error stored:', failedProfile.metadata.error.message);

    // Test 10: Complex aggregation - Top influencers
    logger.info('\n=== Test 10: Getting Top Influencers ===');
    const topInfluencers = await RelatedProfileScraped.getTopInfluencers(session._id, 5);
    logger.info(`Found ${topInfluencers.length} top influencers`);

    logger.info('\n✅ All tests completed successfully!');

  } catch (error) {
    logger.error('Test failed:', error);
  } finally {
    // Disconnect from database
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run the tests
testSchemas();