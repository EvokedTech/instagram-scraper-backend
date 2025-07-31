const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  fullName: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    default: ''
  },
  profilePicUrl: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  followerCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  },
  postCount: {
    type: Number,
    default: 0
  },
  externalUrl: {
    type: String,
    default: ''
  },
  posts: [{
    postId: String,
    imageUrl: String,
    caption: String,
    likeCount: Number,
    commentCount: Number,
    timestamp: Date,
    isVideo: Boolean,
    videoUrl: String
  }],
  lastScraped: {
    type: Date,
    default: Date.now
  },
  scrapingHistory: [{
    timestamp: Date,
    success: Boolean,
    error: String
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
profileSchema.index({ username: 1 });
profileSchema.index({ lastScraped: 1 });
profileSchema.index({ 'posts.postId': 1 });

// Instance methods
profileSchema.methods.updateScrapeStatus = function(success, error = null) {
  this.lastScraped = new Date();
  this.scrapingHistory.push({
    timestamp: new Date(),
    success,
    error: error ? error.toString() : null
  });
  
  // Keep only last 10 scraping history entries
  if (this.scrapingHistory.length > 10) {
    this.scrapingHistory = this.scrapingHistory.slice(-10);
  }
  
  return this.save();
};

// Static methods
profileSchema.statics.findByUsername = function(username) {
  return this.findOne({ username: username.toLowerCase() });
};

profileSchema.statics.getRecentlyScraped = function(limit = 10) {
  return this.find()
    .sort({ lastScraped: -1 })
    .limit(limit)
    .select('username fullName lastScraped followerCount postCount');
};

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;