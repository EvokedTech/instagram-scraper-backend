const logger = require('../utils/logger');
const AnalyzedRelatedProfile = require('../models/AnalyzedRelatedProfile');
const RootProfileScraped = require('../models/RootProfileScraped');
const aiAnalysisService = require('./aiAnalysisService');

class ProfileAnalysisService {
  constructor() {
    logger.info('ProfileAnalysisService initialized with AI fallback support');
    this.processedProfiles = new Set(); // Track processed profiles to prevent duplicates
  }

  /**
   * Analyze a root profile and save the analysis
   * @param {Object} rootProfile - The root profile document from rootprofiles_scraped_datas
   * @param {string} sessionId - The session ID
   * @returns {Promise<Object>} The analyzed profile document
   */
  async analyzeRootProfile(rootProfile, sessionId) {
    try {
      // Check for duplicate processing
      const profileKey = `${rootProfile.username}_${sessionId}`;
      if (this.processedProfiles.has(profileKey)) {
        logger.info(`Profile ${rootProfile.username} already processed in this session, skipping`);
        return await AnalyzedRelatedProfile.findOne({
          sourceProfileId: rootProfile._id,
          sourceCollection: 'rootprofiles_scraped_datas',
          sessionId
        });
      }

      logger.info(`Analyzing root profile: ${rootProfile.username}`, {
        profileId: rootProfile._id,
        sessionId
      });

      // Check if analysis already exists for this profile
      const existingAnalysis = await AnalyzedRelatedProfile.findOne({
        sourceProfileId: rootProfile._id,
        sourceCollection: 'rootprofiles_scraped_datas',
        sessionId
      });

      if (existingAnalysis) {
        logger.info(`Analysis already exists for root profile ${rootProfile.username}`);
        this.processedProfiles.add(profileKey);
        return existingAnalysis;
      }

      // Use AI service for enhanced analysis with fallback support
      let analysisData;
      try {
        const aiAnalysis = await aiAnalysisService.analyzeProfile(rootProfile.profileData, {
          forceRefresh: false
        });

        // Combine AI analysis with basic metrics
        analysisData = {
          ...this.performAnalysis(rootProfile.profileData),
          aiInsights: aiAnalysis.analysis,
          modelUsed: aiAnalysis.modelUsed,
          fromCache: aiAnalysis.fromCache
        };
      } catch (aiError) {
        logger.warn(`AI analysis failed for ${rootProfile.username}, using basic analysis:`, aiError.message);
        // Fallback to basic analysis if AI fails
        analysisData = this.performAnalysis(rootProfile.profileData);
      }

      // Create new analysis document
      const analyzedProfile = new AnalyzedRelatedProfile({
        sourceProfileId: rootProfile._id,
        sourceCollection: 'rootprofiles_scraped_datas',
        sessionId,
        username: rootProfile.username,
        profileUrl: rootProfile.profileUrl,
        depth: rootProfile.depth || 0,
        analysisData,
        analysisStatus: 'completed'
      });

      await analyzedProfile.save();

      // Mark profile as processed to prevent duplicates
      this.processedProfiles.add(profileKey);

      // Update the root profile status to analyzed
      await rootProfile.markAsAnalyzed();

      logger.info(`Successfully analyzed root profile: ${rootProfile.username}`, {
        analyzedProfileId: analyzedProfile._id,
        modelUsed: analysisData.modelUsed || 'basic'
      });

      return analyzedProfile;

    } catch (error) {
      logger.error(`Failed to analyze root profile ${rootProfile.username}:`, error);
      
      // Try to save failed analysis record
      try {
        const failedAnalysis = new AnalyzedRelatedProfile({
          sourceProfileId: rootProfile._id,
          sourceCollection: 'rootprofiles_scraped_datas',
          sessionId,
          username: rootProfile.username,
          profileUrl: rootProfile.profileUrl,
          depth: rootProfile.depth || 0,
          analysisData: {},
          analysisStatus: 'failed',
          errorDetails: {
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
          }
        });
        await failedAnalysis.save();
      } catch (saveError) {
        logger.error('Failed to save failed analysis record:', saveError);
      }

      throw error;
    }
  }

  /**
   * Perform the actual analysis on profile data
   * @param {Object} profileData - The profile data to analyze
   * @returns {Object} Analysis results
   */
  performAnalysis(profileData) {
    // This is where you implement your custom analysis logic
    // For now, returning a structured analysis object
    
    const analysis = {
      // Basic metrics
      metrics: {
        followersCount: profileData?.followersCount || 0,
        followsCount: profileData?.followsCount || 0,
        postsCount: profileData?.postsCount || 0,
        engagementRate: this.calculateEngagementRate(profileData),
        followersRatio: this.calculateFollowersRatio(profileData),
        averageLikes: this.calculateAverageLikes(profileData),
        averageComments: this.calculateAverageComments(profileData)
      },
      
      // Profile characteristics
      characteristics: {
        isVerified: profileData?.verified || false,
        isBusinessAccount: profileData?.isBusinessAccount || false,
        isPrivate: profileData?.private || false,
        hasExternalUrl: !!(profileData?.externalUrls && profileData.externalUrls.length > 0),
        businessCategory: profileData?.businessCategoryName || null
      },
      
      // Content analysis
      contentAnalysis: {
        postingFrequency: this.calculatePostingFrequency(profileData),
        hashtagUsage: this.analyzeHashtagUsage(profileData),
        mentionPatterns: this.analyzeMentionPatterns(profileData),
        contentTypes: this.analyzeContentTypes(profileData)
      },
      
      // Timestamp
      analyzedAt: new Date().toISOString()
    };

    return analysis;
  }

  calculateEngagementRate(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0 || !profileData.followersCount) {
      return 0;
    }

    const totalEngagement = profileData.latestPosts.reduce((sum, post) => {
      return sum + (post.likesCount || 0) + (post.commentsCount || 0);
    }, 0);

    const avgEngagement = totalEngagement / profileData.latestPosts.length;
    return Number(((avgEngagement / profileData.followersCount) * 100).toFixed(2));
  }

  calculateFollowersRatio(profileData) {
    if (!profileData?.followsCount || profileData.followsCount === 0) {
      return 0;
    }
    return Number((profileData.followersCount / profileData.followsCount).toFixed(2));
  }

  calculateAverageLikes(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0) {
      return 0;
    }

    const totalLikes = profileData.latestPosts.reduce((sum, post) => {
      return sum + (post.likesCount || 0);
    }, 0);

    return Math.round(totalLikes / profileData.latestPosts.length);
  }

  calculateAverageComments(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0) {
      return 0;
    }

    const totalComments = profileData.latestPosts.reduce((sum, post) => {
      return sum + (post.commentsCount || 0);
    }, 0);

    return Math.round(totalComments / profileData.latestPosts.length);
  }

  calculatePostingFrequency(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length < 2) {
      return 'unknown';
    }

    // Sort posts by timestamp
    const sortedPosts = profileData.latestPosts
      .filter(post => post.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (sortedPosts.length < 2) {
      return 'unknown';
    }

    // Calculate average days between posts
    const firstPost = new Date(sortedPosts[sortedPosts.length - 1].timestamp);
    const lastPost = new Date(sortedPosts[0].timestamp);
    const daysDiff = (lastPost - firstPost) / (1000 * 60 * 60 * 24);
    const avgDaysBetweenPosts = daysDiff / (sortedPosts.length - 1);

    if (avgDaysBetweenPosts < 1) return 'daily';
    if (avgDaysBetweenPosts <= 3) return 'frequent';
    if (avgDaysBetweenPosts <= 7) return 'weekly';
    if (avgDaysBetweenPosts <= 30) return 'monthly';
    return 'infrequent';
  }

  analyzeHashtagUsage(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0) {
      return { count: 0, unique: 0, top: [] };
    }

    const hashtagMap = {};
    let totalHashtags = 0;

    profileData.latestPosts.forEach(post => {
      if (post.hashtags && Array.isArray(post.hashtags)) {
        post.hashtags.forEach(tag => {
          hashtagMap[tag] = (hashtagMap[tag] || 0) + 1;
          totalHashtags++;
        });
      }
    });

    const topHashtags = Object.entries(hashtagMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      count: totalHashtags,
      unique: Object.keys(hashtagMap).length,
      top: topHashtags
    };
  }

  analyzeMentionPatterns(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0) {
      return { count: 0, unique: 0, top: [] };
    }

    const mentionMap = {};
    let totalMentions = 0;

    profileData.latestPosts.forEach(post => {
      if (post.mentions && Array.isArray(post.mentions)) {
        post.mentions.forEach(mention => {
          mentionMap[mention] = (mentionMap[mention] || 0) + 1;
          totalMentions++;
        });
      }
    });

    const topMentions = Object.entries(mentionMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([mention, count]) => ({ mention, count }));

    return {
      count: totalMentions,
      unique: Object.keys(mentionMap).length,
      top: topMentions
    };
  }

  analyzeContentTypes(profileData) {
    if (!profileData?.latestPosts || profileData.latestPosts.length === 0) {
      return { image: 0, video: 0, carousel: 0 };
    }

    const types = { image: 0, video: 0, carousel: 0 };

    profileData.latestPosts.forEach(post => {
      const type = (post.type || '').toLowerCase();
      if (type.includes('video')) {
        types.video++;
      } else if (type.includes('sidecar') || type.includes('carousel')) {
        types.carousel++;
      } else {
        types.image++;
      }
    });

    return types;
  }

  /**
   * Get analysis statistics for a session
   * @param {string} sessionId - The session ID
   * @returns {Promise<Object>} Analysis statistics
   */
  async getAnalysisStats(sessionId) {
    try {
      const stats = await AnalyzedRelatedProfile.getAnalysisStats(sessionId);

      const formattedStats = {
        rootProfiles: { completed: 0, failed: 0 },
        relatedProfiles: { completed: 0, failed: 0 },
        total: { completed: 0, failed: 0 }
      };

      stats.forEach(stat => {
        const source = stat._id.source === 'rootprofiles_scraped_datas' ? 'rootProfiles' : 'relatedProfiles';
        const status = stat._id.status === 'completed' ? 'completed' : 'failed';
        formattedStats[source][status] = stat.count;
        formattedStats.total[status] += stat.count;
      });

      return formattedStats;
    } catch (error) {
      logger.error(`Failed to get analysis stats for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clear duplicate tracking cache
   * Call this periodically or when memory needs to be freed
   */
  clearDuplicateCache() {
    const previousSize = this.processedProfiles.size;
    this.processedProfiles.clear();
    logger.info(`Cleared duplicate tracking cache. Removed ${previousSize} entries.`);
  }

  /**
   * Get AI model status
   * @returns {Object} Status of available AI models
   */
  getAIModelStatus() {
    return aiAnalysisService.getModelStatus();
  }

  /**
   * Clear AI analysis cache
   */
  clearAICache() {
    aiAnalysisService.clearCache();
    logger.info('AI analysis cache cleared');
  }
}

module.exports = new ProfileAnalysisService();