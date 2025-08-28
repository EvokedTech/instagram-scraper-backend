const mongoose = require('mongoose');

const analyzedRelatedProfileSchema = new mongoose.Schema({
  // Reference to the original scraped profile
  sourceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  sourceCollection: {
    type: String,
    enum: ['rootprofiles_scraped_datas', 'relatedprofiles_scraped_datas'],
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  
  // Profile identification
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
  depth: {
    type: Number,
    required: true,
    index: true
  },
  
  // Analysis results (structure can be expanded based on your analysis logic)
  analysisData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Analysis metadata
  analyzedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  analysisVersion: {
    type: String,
    default: '1.0'
  },
  analysisStatus: {
    type: String,
    enum: ['completed', 'failed', 'partial'],
    default: 'completed',
    index: true
  },
  errorDetails: {
    message: String,
    stack: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
analyzedRelatedProfileSchema.index({ sessionId: 1, sourceCollection: 1 });
analyzedRelatedProfileSchema.index({ sessionId: 1, username: 1 });
analyzedRelatedProfileSchema.index({ sourceProfileId: 1, sourceCollection: 1 });

// Instance methods
analyzedRelatedProfileSchema.methods.markAsFailed = function(error) {
  this.analysisStatus = 'failed';
  this.errorDetails = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date()
  };
  return this.save();
};

// Static methods
analyzedRelatedProfileSchema.statics.findBySession = function(sessionId) {
  return this.find({ sessionId });
};

analyzedRelatedProfileSchema.statics.getAnalysisStats = function(sessionId) {
  return this.aggregate([
    { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: {
          status: '$analysisStatus',
          source: '$sourceCollection'
        },
        count: { $sum: 1 }
      }
    }
  ]);
};

const AnalyzedRelatedProfile = mongoose.model('analyzed_relatedprofiles', analyzedRelatedProfileSchema);

module.exports = AnalyzedRelatedProfile;