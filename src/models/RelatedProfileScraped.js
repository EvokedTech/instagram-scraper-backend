const mongoose = require('mongoose');
const imageCdnService = require('../services/imageCdnService');
const logger = require('../utils/logger');

// Reuse schemas from RootProfileScraped for consistency
const relatedProfileSchema = new mongoose.Schema({
  id: String,
  full_name: String,
  is_private: Boolean,
  is_verified: Boolean,
  profile_pic_url: String,
  username: String
}, { _id: false });

// Schema for tagged users
const taggedUserSchema = new mongoose.Schema({
  full_name: String,
  id: String,
  is_verified: Boolean,
  profile_pic_url: String,
  username: String
}, { _id: false });

// Schema for child posts (for carousel/sidecar posts)
const childPostSchema = new mongoose.Schema({
  id: String,
  type: String,
  shortCode: String,
  caption: String,
  hashtags: [String],
  mentions: [String],
  url: String,
  commentsCount: Number,
  dimensionsHeight: Number,
  dimensionsWidth: Number,
  displayUrl: String,
  images: [String],
  videoUrl: String,
  alt: String,
  likesCount: Number,
  videoViewCount: Number,
  timestamp: Date,
  ownerUsername: String,
  ownerId: String,
  taggedUsers: [taggedUserSchema]
}, { _id: false });

// Schema for posts within the Apify response
const postSchema = new mongoose.Schema({
  id: String,
  type: String, // 'Image', 'Video', 'Sidecar'
  shortCode: String,
  caption: String,
  hashtags: [String],
  mentions: [String],
  url: String,
  commentsCount: Number,
  dimensionsHeight: Number,
  dimensionsWidth: Number,
  displayUrl: String,
  images: [String],
  videoUrl: String,
  alt: String,
  likesCount: Number,
  videoViewCount: Number,
  timestamp: Date,
  productType: String,
  musicInfo: {
    artist_name: String,
    song_name: String,
    uses_original_audio: Boolean,
    audio_id: String
  },
  locationName: String,
  locationId: String,
  isCommentsDisabled: Boolean,
  videoDuration: Number,
  
  // Child posts for carousels
  childPosts: [childPostSchema],
  
  ownerUsername: String,
  ownerId: String,
  taggedUsers: [taggedUserSchema]
}, { _id: false });

const igtvVideoSchema = new mongoose.Schema({
  id: String,
  type: String,
  shortCode: String,
  title: String,
  caption: String,
  hashtags: [String],
  mentions: [String],
  url: String,
  commentsCount: Number,
  dimensionsHeight: Number,
  dimensionsWidth: Number,
  displayUrl: String,
  videoUrl: String,
  alt: String,
  likesCount: Number,
  videoDuration: Number,
  videoViewCount: Number,
  timestamp: Date,
  locationName: String,
  locationId: String,
  ownerUsername: String,
  ownerId: String
}, { _id: false });

// Main schema for related profiles
const relatedProfileScrapedSchema = new mongoose.Schema({
  // Session & Source Info
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  parentProfileUrl: {
    type: String,
    required: true
  },
  parentUsername: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  depth: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    index: true
  },
  
  // Target Profile Info
  username: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  profileUrl: {
    type: String,
    required: true
  },
  
  // Processing Status
  status: {
    type: String,
    enum: ['pending', 'scraped', 'analyzed', 'failed'],
    default: 'pending',
    index: true
  },
  scrapedAt: {
    type: Date,
    index: true
  },
  
  // Complete Apify Raw Response (Stored As-Is)
  profileData: {
    inputUrl: String,
    id: String,
    username: String,
    url: String,
    fullName: String,
    biography: String,
    externalUrls: [String],
    followersCount: Number,
    followsCount: Number,
    hasChannel: Boolean,
    highlightReelCount: Number,
    isBusinessAccount: Boolean,
    joinedRecently: Boolean,
    businessCategoryName: String,
    private: Boolean,
    verified: Boolean,
    profilePicUrl: String,
    profilePicUrlHD: String,
    igtvVideoCount: Number,
    postsCount: Number,
    fbid: String,
    relatedProfiles: [relatedProfileSchema],
    latestPosts: [postSchema],
    latestIgtvVideos: [igtvVideoSchema]
  },
  
  // Processing Metadata
  metadata: {
    apifyRunId: String,
    datasetId: String,
    processingTime: Number, // in seconds
    scrapingDuration: Number, // in milliseconds
    relatedProfilesCount: Number,
    postsCount: Number,
    igtvCount: Number,
    discoveredFrom: {
      type: String,
      enum: ['relatedProfiles', 'mentions', 'hashtags', 'manual'],
      default: 'relatedProfiles'
    },
    scrapingSource: {
      type: String,
      default: 'apify'
    },
    dataVersion: {
      type: String,
      default: '1.0'
    },
    error: {
      message: String,
      stack: String,
      timestamp: Date
    }
  },
  
  // n8n webhook tracking
  n8nProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  n8nProcessedAt: {
    type: Date,
    index: true
  },
  
  // n8n analysis results
  n8nAnalysisResult: {
    status: {
      type: String,
      enum: ['stored', 'skipped', 'failed', 'unknown'],
      index: true
    },
    adultContentScore: {
      type: Number,
      min: 0,
      max: 100
    },
    reason: String, // e.g., 'adult_content', 'low_score'
    isAdultCreator: Boolean, // true if score > 30
    markAsStored: Boolean,
    markAsSkipped: Boolean,
    analyzedAt: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
relatedProfileScrapedSchema.index({ sessionId: 1, username: 1, depth: 1 }, { unique: true });
relatedProfileScrapedSchema.index({ sessionId: 1, profileUrl: 1 });
relatedProfileScrapedSchema.index({ sessionId: 1, status: 1, depth: 1 });
relatedProfileScrapedSchema.index({ sessionId: 1, parentUsername: 1 });
relatedProfileScrapedSchema.index({ sessionId: 1, scrapedAt: -1 });
relatedProfileScrapedSchema.index({ sessionId: 1, depth: 1, status: 1 });
relatedProfileScrapedSchema.index({ 'profileData.followersCount': -1 });
relatedProfileScrapedSchema.index({ 'profileData.verified': 1 });
relatedProfileScrapedSchema.index({ 'profileData.private': 1 });

// Text search index for biography and post captions
relatedProfileScrapedSchema.index({
  'profileData.biography': 'text',
  'profileData.latestPosts.caption': 'text'
});

// Virtual for followers to following ratio
relatedProfileScrapedSchema.virtual('followersRatio').get(function() {
  if (!this.profileData || this.profileData.followsCount === 0) return 0;
  return this.profileData.followersCount / this.profileData.followsCount;
});

// Virtual for engagement rate
relatedProfileScrapedSchema.virtual('avgEngagementRate').get(function() {
  if (!this.profileData || !this.profileData.latestPosts || 
      this.profileData.latestPosts.length === 0 || 
      this.profileData.followersCount === 0) {
    return 0;
  }
  
  const totalEngagement = this.profileData.latestPosts.reduce((sum, post) => {
    return sum + (post.likesCount || 0) + (post.commentsCount || 0);
  }, 0);
  
  const avgEngagement = totalEngagement / this.profileData.latestPosts.length;
  return (avgEngagement / this.profileData.followersCount) * 100;
});

// Instance methods
relatedProfileScrapedSchema.methods.markAsScraped = async function(apifyResponse, metadata) {
  this.status = 'scraped';
  this.scrapedAt = new Date();
  
  // Helper function to convert timestamps
  const convertTimestamp = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (typeof timestamp === 'number') return new Date(timestamp * 1000); // Unix timestamp
    return null;
  };
  
  // Transform posts with proper timestamp conversion
  const transformPost = (post) => {
    if (!post) return null;
    return {
      ...post,
      timestamp: convertTimestamp(post.timestamp),
      childPosts: post.childPosts ? post.childPosts.map(child => ({
        ...child,
        timestamp: convertTimestamp(child.timestamp)
      })) : []
    };
  };
  
  // Transform IGTV videos with proper timestamp conversion
  const transformIgtv = (video) => {
    if (!video) return null;
    return {
      ...video,
      timestamp: convertTimestamp(video.timestamp)
    };
  };
  
  // Transform the apifyResponse to match our schema
  const transformedData = {
    ...apifyResponse,
    // Transform externalUrls to array of strings if it exists
    externalUrls: apifyResponse.externalUrls ? 
      (Array.isArray(apifyResponse.externalUrls) ? 
        apifyResponse.externalUrls.map(url => 
          typeof url === 'object' ? (url.url || url.lynx_url || '') : url
        ) : 
        []) : 
      [],
    // Transform posts with timestamp conversion
    latestPosts: apifyResponse.latestPosts ? 
      apifyResponse.latestPosts.map(transformPost) : [],
    // Transform IGTV videos with timestamp conversion
    latestIgtvVideos: apifyResponse.latestIgtvVideos ? 
      apifyResponse.latestIgtvVideos.map(transformIgtv) : []
  };
  
  // Process images through CDN service
  try {
    const processedData = await imageCdnService.processCompleteProfile(
      transformedData,
      this.username,
      {
        includePostImages: false, // Can be enabled if needed
        includeIgtvImages: false  // Can be enabled if needed
      }
    );
    this.profileData = processedData;
  } catch (error) {
    // Log error but continue with original data
    console.error(`CDN processing failed for ${this.username}:`, error);
    this.profileData = transformedData;
  }
  
  this.metadata = {
    ...this.metadata,
    ...metadata,
    relatedProfilesCount: apifyResponse.relatedProfiles ? apifyResponse.relatedProfiles.length : 0,
    postsCount: apifyResponse.latestPosts ? apifyResponse.latestPosts.length : 0,
    igtvCount: apifyResponse.latestIgtvVideos ? apifyResponse.latestIgtvVideos.length : 0,
    scrapingSource: metadata.scrapingSource || 'apify',
    dataVersion: metadata.dataVersion || '1.0'
  };
  return this.save();
};

// Analysis now handled by n8n webhook - status tracking moved to n8nProcessed field

relatedProfileScrapedSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.metadata.error = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date()
  };
  return this.save();
};

// Static methods
relatedProfileScrapedSchema.statics.findBySession = function(sessionId) {
  return this.find({ sessionId });
};

relatedProfileScrapedSchema.statics.findBySessionAndDepth = function(sessionId, depth) {
  return this.find({ sessionId, depth });
};

relatedProfileScrapedSchema.statics.findPendingBySessionAndDepth = function(sessionId, depth) {
  return this.find({ sessionId, depth, status: 'pending' });
};

relatedProfileScrapedSchema.statics.findChildrenOf = function(sessionId, parentUsername) {
  return this.find({ sessionId, parentUsername });
};

relatedProfileScrapedSchema.statics.getDepthStats = function(sessionId) {
  return this.aggregate([
    { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: { depth: '$depth', status: '$status' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.depth',
        stats: {
          $push: {
            status: '$_id.status',
            count: '$count'
          }
        },
        total: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

relatedProfileScrapedSchema.statics.getTopInfluencers = function(sessionId, limit = 10) {
  return this.find({ 
    sessionId, 
    status: 'scraped',
    'profileData.private': false 
  })
  .sort({ 'profileData.followersCount': -1 })
  .limit(limit)
  .select('username profileUrl depth profileData.fullName profileData.followersCount profileData.verified');
};

// Ensure virtuals are included in JSON
relatedProfileScrapedSchema.set('toJSON', { virtuals: true });
relatedProfileScrapedSchema.set('toObject', { virtuals: true });

// Post-save hook to queue for n8n analysis
relatedProfileScrapedSchema.post('save', async function(doc) {
  try {
    // Only queue for n8n analysis if:
    // 1. Status is 'scraped'
    // 2. Depth > 0 (not a root profile)
    // 3. Not already sent to n8n
    if (doc.status === 'scraped' && doc.depth > 0 && !doc.n8nProcessed) {
      // Lazy load to avoid circular dependency
      const { queueProfileForN8nAnalysis } = require('../queues/n8nAnalysisQueue');
      
      // Queue the profile for n8n analysis
      await queueProfileForN8nAnalysis(
        doc._id,
        doc.sessionId,
        doc.username,
        doc.depth
      );
      
      logger.info(`Queued profile ${doc.username} for n8n analysis`);
    }
  } catch (error) {
    // Log error but don't throw to avoid disrupting the save operation
    logger.error(`Failed to queue profile ${doc.username} for n8n analysis:`, error);
  }
});

const RelatedProfileScraped = mongoose.model('relatedprofiles_scraped_datas', relatedProfileScrapedSchema);

module.exports = RelatedProfileScraped;