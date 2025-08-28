const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  rootProfiles: [{
    type: String,
    required: true,
    validate: {
      validator: function(url) {
        return /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?$/.test(url);
      },
      message: 'Invalid Instagram profile URL'
    }
  }],
  config: {
    maxDepth: {
      type: Number,
      default: 2,
      min: 1,
      max: 6
    },
    maxProfilesPerDepth: {
      type: Number,
      default: 100,
      min: 1,
      max: 1000000,
      validate: {
        validator: function(value) {
          // Allow null/undefined for unlimited
          return value === null || value === undefined || value > 0;
        },
        message: 'maxProfilesPerDepth must be null (unlimited) or a positive number'
      }
    },
    analysisEnabled: {
      type: Boolean,
      default: true
    },
    analyzeRootProfiles: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'paused', 'completed', 'failed', 'deleted', 'stopped'],
    default: 'pending'
  },
  stats: {
    totalProfiles: {
      type: Number,
      default: 0
    },
    scrapedProfiles: {
      type: Number,
      default: 0
    },
    analyzedProfiles: {
      type: Number,
      default: 0
    },
    currentDepth: {
      type: Number,
      default: 0
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    }
  },
  depthProgress: [{
    depth: {
      type: Number,
      required: true
    },
    totalProfiles: {
      type: Number,
      default: 0
    },
    scrapedProfiles: {
      type: Number,
      default: 0
    },
    analyzedProfiles: {
      type: Number,
      default: 0
    },
    isScrapingComplete: {
      type: Boolean,
      default: false
    },
    isAnalysisComplete: {
      type: Boolean,
      default: false
    },
    startedAt: Date,
    completedAt: Date
  }],
  isAnalysisComplete: {
    type: Boolean,
    default: false
  },
  error: {
    message: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Indexes
sessionSchema.index({ status: 1, createdAt: -1 });
sessionSchema.index({ 'stats.startedAt': -1 });
sessionSchema.index({ name: 'text' });

// Virtual for progress percentage based on depth completion
sessionSchema.virtual('progressPercentage').get(function() {
  if (!this.config || !this.config.maxDepth || this.config.maxDepth === 0) return 0;
  
  const maxDepth = this.config.maxDepth;
  let totalExpectedDepths = maxDepth + 1; // Include depth 0 (root profiles)
  let completedDepthsScore = 0;
  
  // Check root profiles (depth 0)
  if (this.stats.scrapedProfiles > 0 && this.rootProfiles && this.rootProfiles.length > 0) {
    const rootProgress = Math.min(this.stats.scrapedProfiles / this.rootProfiles.length, 1);
    completedDepthsScore += rootProgress;
  }
  
  // Check each depth level
  for (let depth = 1; depth <= maxDepth; depth++) {
    const depthData = this.depthProgress.find(dp => dp.depth === depth);
    
    if (depthData) {
      // If we have data for this depth, calculate its completion
      if (depthData.totalProfiles === 0) {
        // No profiles at this depth means it's complete
        completedDepthsScore += 1;
      } else {
        // Calculate completion based on scraped profiles
        const scrapingProgress = depthData.scrapedProfiles / depthData.totalProfiles;
        completedDepthsScore += scrapingProgress;
      }
    } else {
      // If no data for this depth yet, it might still be processing
      // Don't count it as complete
      completedDepthsScore += 0;
    }
  }
  
  // Calculate overall percentage
  const progressPercentage = (completedDepthsScore / totalExpectedDepths) * 100;
  return Math.min(Math.round(progressPercentage), 100);
});

// Virtual for duration
sessionSchema.virtual('duration').get(function() {
  if (!this.stats.startedAt) return null;
  const endTime = this.stats.completedAt || new Date();
  return endTime - this.stats.startedAt;
});

// Instance methods
sessionSchema.methods.start = function() {
  this.status = 'running';
  this.stats.startedAt = new Date();
  return this.save();
};

sessionSchema.methods.pause = function() {
  this.status = 'paused';
  return this.save();
};

sessionSchema.methods.complete = function() {
  this.status = 'completed';
  this.stats.completedAt = new Date();
  return this.save();
};

sessionSchema.methods.fail = function(errorMessage) {
  this.status = 'failed';
  this.error = {
    message: errorMessage,
    timestamp: new Date()
  };
  return this.save();
};

sessionSchema.methods.updateStats = function(updates) {
  Object.assign(this.stats, updates);
  return this.save();
};

sessionSchema.methods.incrementScrapedProfiles = function(count = 1) {
  this.stats.scrapedProfiles += count;
  return this.save();
};

sessionSchema.methods.incrementAnalyzedProfiles = function(count = 1) {
  this.stats.analyzedProfiles += count;
  return this.save();
};

sessionSchema.methods.updateDepthProgress = function(depth, updates) {
  let depthProgress = this.depthProgress.find(dp => dp.depth === depth);
  
  if (!depthProgress) {
    depthProgress = {
      depth,
      totalProfiles: 0,
      scrapedProfiles: 0,
      analyzedProfiles: 0,
      isScrapingComplete: false,
      isAnalysisComplete: false
    };
    this.depthProgress.push(depthProgress);
  }
  
  // Find the depth progress again after potential push
  const index = this.depthProgress.findIndex(dp => dp.depth === depth);
  Object.assign(this.depthProgress[index], updates);
  
  return this.save();
};

sessionSchema.methods.checkAndCompleteSession = async function() {
  // Check if all depths are complete
  const allDepthsComplete = this.depthProgress.every(
    dp => dp.isScrapingComplete && dp.isAnalysisComplete
  );
  
  // Check if we've processed all expected depths
  const expectedDepths = this.config.maxDepth;
  const processedDepths = this.depthProgress.filter(
    dp => dp.isScrapingComplete && dp.isAnalysisComplete
  ).length;
  
  if (allDepthsComplete && processedDepths >= expectedDepths && this.status === 'running') {
    this.status = 'completed';
    this.stats.completedAt = new Date();
    this.isAnalysisComplete = true;
    await this.save();
    return true;
  }
  
  return false;
};

// Static methods
sessionSchema.statics.findActive = function() {
  return this.find({ status: { $in: ['running', 'paused'] } });
};

sessionSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

// Ensure virtuals are included in JSON
sessionSchema.set('toJSON', { virtuals: true });
sessionSchema.set('toObject', { virtuals: true });

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;