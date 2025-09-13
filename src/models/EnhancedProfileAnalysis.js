const mongoose = require('mongoose');

const enhancedProfileAnalysisSchema = new mongoose.Schema({
    // Parent relationship (if analyzing related profiles)
    parentUsername: String,
    parentProfileUrl: String,

    // Basic profile information
    username: {
        type: String,
        required: true,
        index: true
    },
    fullName: String,
    profileUrl: String,
    profilePicUrl: String,

    // Demographics
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Non-binary', 'Unknown'],
        default: 'Unknown'
    },
    age: Number,

    // Profile summary (array of detailed points)
    profileSummary: [String],

    // Content scoring
    adultContentScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    engagementRate: Number,
    contentType: [String],

    // Contact information
    contactInformation: {
        email: String,
        phoneNumber: String,
        businessEmail: String,
        externalLinks: [{
            type: {
                type: String,
                enum: ['website', 'landing_page', 'social', 'other']
            },
            url: String,
            platform: String
        }],
        collaborationMethod: {
            type: String,
            enum: ['direct', 'agent', 'email', 'unknown'],
            default: 'direct'
        },
        mediaKit: Boolean,
        rateCardAvailable: Boolean
    },

    // Account metrics
    accountMetrics: {
        followersCount: Number,
        followingCount: Number,
        postsCount: Number,
        verified: Boolean,
        businessAccount: Boolean,
        lastActiveDate: Date,
        accountAge: {
            type: String,
            enum: ['New', 'Growing', 'Established', 'Unknown']
        },
        postingConsistency: {
            type: String,
            enum: ['consistent', 'irregular', 'sporadic', 'unknown']
        },
        profileCompleteness: {
            type: Number,
            min: 0,
            max: 100
        }
    },

    // Content metrics
    contentMetrics: {
        avgLikesPerPost: Number,
        avgCommentsPerPost: Number,
        avgViewsPerPost: Number,
        postFrequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'rarely', 'unknown']
        },
        primaryHashtags: [String],
        sponsoredContentRate: Number,
        engagementRate: Number,
        engagementGrowthTrend: {
            type: String,
            enum: ['growing', 'stable', 'declining', 'unknown']
        },
        contentQualityScore: {
            type: Number,
            min: 0,
            max: 100
        },
        viralPotential: {
            type: Number,
            min: 0,
            max: 100
        },
        brandMentionFrequency: Number,
        hashtagStrategy: {
            type: String,
            enum: ['aggressive', 'moderate', 'low', 'none', 'unknown']
        },
        captionLength: {
            type: String,
            enum: ['short', 'medium', 'long', 'varies', 'unknown']
        },
        contentFormats: [String],
        postingTimePatterns: [String]
    },

    // Geographic signals
    geographicSignals: [{
        index: Number,
        location: String,
        code: String,
        confidence: {
            type: String,
            enum: ['high', 'medium', 'low']
        }
    }],

    // Audience signals
    audienceSignals: {
        likelyAudienceGender: String,
        primaryAgeGroup: String,
        networkVerificationRate: String,
        engagementQuality: {
            type: String,
            enum: ['High', 'Medium', 'Low', 'Unknown']
        },
        audienceGenderBreakdown: {
            male: Number,
            female: Number,
            non_binary: Number
        },
        audienceAgeBreakdown: {
            '13_17': Number,
            '18_24': Number,
            '25_34': Number,
            '35_44': Number,
            '45_54': Number,
            '55_plus': Number
        },
        audienceGeoBreakdown: [{
            country: String,
            percentage: Number,
            city: String
        }],
        estimatedAudienceQualityScore: {
            type: Number,
            min: 0,
            max: 100
        },
        audienceInterests: [String],
        audienceLanguages: [String],
        audiencePurchasingPower: {
            type: String,
            enum: ['low', 'medium', 'high', 'unknown']
        },
        peakEngagementTimes: [String]
    },

    // Content analysis
    contentAnalysis: {
        contentType: [String],
        primaryContentThemes: [String],
        secondaryContentThemes: [String],
        contentTone: String,
        languagesUsed: [String],
        visualStyle: String,
        adultContentScore: Number,
        brandSafetyScore: Number,
        adultContentType: {
            type: String,
            enum: ['none', 'suggestive', 'explicit']
        },
        adultPlatformPresence: [String],
        controversyRisk: {
            type: String,
            enum: ['low', 'medium', 'high']
        },
        nicheExpertise: [String],
        contentCategories: [String]
    },

    // Business category suitability
    businessCategorySuitability: {
        perfectMatch: [{
            category: String,
            confidenceScore: Number,
            reasoning: String,
            audienceAlignment: String,
            contentAlignment: String,
            historicalEvidence: Boolean
        }],
        highlyCompatible: [{
            category: String,
            confidenceScore: Number,
            reasoning: String,
            requiredAdaptations: [String]
        }],
        moderatelyCompatible: [{
            category: String,
            confidenceScore: Number,
            reasoning: String,
            successFactors: [String],
            risks: [String]
        }],
        requiresConsideration: [{
            category: String,
            confidenceScore: Number,
            specificConsiderations: [String],
            minimumRequirements: [String]
        }],
        notRecommended: [{
            category: String,
            reasoning: String,
            conflictAreas: [String]
        }],
        brandCollaborationHistory: [{
            brandName: String,
            category: String,
            postUrl: String,
            engagementMetrics: {
                likes: Number,
                comments: Number
            },
            collaborationType: String
        }],
        monetizationIndicators: [{
            type: String,
            evidence: String,
            frequency: String,
            categories: [String],
            adultContentMonetization: Boolean,
            subscriptionModelUsage: Boolean,
            fanFundingPlatforms: [String]
        }]
    },

    // Professional readiness
    professionalReadiness: {
        businessSetupScore: Number,
        contentCreatorToolsUsage: [String],
        brandCollaborationExperience: {
            type: String,
            enum: ['none', 'beginner', 'intermediate', 'expert', 'unknown']
        },
        mediaKitQuality: {
            type: String,
            enum: ['none', 'basic', 'professional', 'unknown']
        },
        responseTimeEstimate: {
            type: String,
            enum: ['fast', 'moderate', 'slow', 'unknown']
        },
        multiPlatformPresence: [String]
    },

    // Summary statistics
    summaryStats: {
        totalGeographicSignals: Number,
        totalContentTypes: Number,
        influencerTier: {
            type: String,
            enum: ['nano', 'micro', 'mid-tier', 'macro', 'mega']
        },
        engagementTier: {
            type: String,
            enum: ['low', 'medium', 'high', 'exceptional']
        },
        brandSafetyLevel: {
            type: String,
            enum: ['low', 'medium', 'high']
        },
        audienceQualityTier: {
            type: String,
            enum: ['low', 'medium', 'high']
        },
        commercialReadiness: {
            type: String,
            enum: ['not-ready', 'developing', 'ready', 'professional']
        },
        nicheInfluence: {
            type: String,
            enum: ['broad', 'focused', 'niche', 'unknown']
        },
        growthTrajectory: {
            type: String,
            enum: ['declining', 'stable', 'growing', 'explosive']
        },
        platformOptimization: {
            type: String,
            enum: ['poor', 'fair', 'good', 'excellent']
        },
        audienceAlignment: {
            type: String,
            enum: ['poor', 'fair', 'good', 'excellent']
        },
        contentConsistency: {
            type: String,
            enum: ['inconsistent', 'somewhat-consistent', 'consistent', 'unknown']
        }
    },

    // Status tracking
    currentStatus: {
        value: {
            type: String,
            default: 'Default'
        },
        color: {
            type: String,
            default: '#6B7280'
        },
        isCustom: {
            type: Boolean,
            default: false
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },

    // Metadata
    statusId: mongoose.Schema.Types.ObjectId,
    sessionId: mongoose.Schema.Types.ObjectId,
    sourceProfileId: mongoose.Schema.Types.ObjectId,

    // AI metadata
    _aiMetadata: {
        modelUsed: String,
        processingTime: Number,
        analyzedAt: Date
    }
}, {
    timestamps: true,
    collection: 'enhancedprofileanalyses'
});

// Indexes for performance
enhancedProfileAnalysisSchema.index({ username: 1 });
enhancedProfileAnalysisSchema.index({ sessionId: 1 });
enhancedProfileAnalysisSchema.index({ 'accountMetrics.followersCount': -1 });
enhancedProfileAnalysisSchema.index({ engagementRate: -1 });
enhancedProfileAnalysisSchema.index({ 'summaryStats.influencerTier': 1 });

// Instance methods
enhancedProfileAnalysisSchema.methods.getValueEstimate = function() {
    const followers = this.accountMetrics.followersCount;
    const engagement = this.engagementRate;
    const tier = this.summaryStats.influencerTier;

    // Basic value calculation
    let minValue = 0;
    let maxValue = 0;

    switch(tier) {
        case 'nano':
            minValue = 50;
            maxValue = 200;
            break;
        case 'micro':
            minValue = 200;
            maxValue = 1000;
            break;
        case 'mid-tier':
            minValue = 1000;
            maxValue = 5000;
            break;
        case 'macro':
            minValue = 5000;
            maxValue = 20000;
            break;
        case 'mega':
            minValue = 20000;
            maxValue = 100000;
            break;
    }

    // Adjust based on engagement
    if (engagement > 5) {
        minValue *= 1.5;
        maxValue *= 1.5;
    } else if (engagement < 1) {
        minValue *= 0.5;
        maxValue *= 0.5;
    }

    return {
        min: Math.round(minValue),
        max: Math.round(maxValue),
        currency: 'USD',
        period: 'per_post'
    };
};

// Static methods
enhancedProfileAnalysisSchema.statics.findByUsername = function(username) {
    return this.findOne({ username: username.toLowerCase() });
};

enhancedProfileAnalysisSchema.statics.findByTier = function(tier) {
    return this.find({ 'summaryStats.influencerTier': tier });
};

enhancedProfileAnalysisSchema.statics.findHighEngagement = function(minRate = 3) {
    return this.find({ engagementRate: { $gte: minRate } });
};

const EnhancedProfileAnalysis = mongoose.model('EnhancedProfileAnalysis', enhancedProfileAnalysisSchema);

module.exports = EnhancedProfileAnalysis;