const axios = require('axios');
const logger = require('../utils/logger');

class OpenRouterAnalysisService {
    constructor() {
        // OpenRouter configuration for Qwen model
        this.openRouterConfig = {
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
            model: 'qwen/qwen2.5-vl-72b-instruct:free',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': process.env.SITE_URL || 'https://instagram-analyzer.com',
                'X-Title': process.env.SITE_NAME || 'Instagram Profile Analyzer'
            }
        };

        // Cache for deduplication
        this.analysisCache = new Map();
        this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
    }

    /**
     * Calculate estimated metrics based on followers
     */
    calculateMetrics(profileData) {
        const followers = profileData.followersCount || 0;
        const posts = profileData.postsCount || 0;

        // Estimate engagement rate
        let engagementRate = 0;
        if (followers > 0) {
            if (followers < 1000) engagementRate = 8.0;
            else if (followers < 10000) engagementRate = 5.0;
            else if (followers < 100000) engagementRate = 3.7;
            else if (followers < 1000000) engagementRate = 1.87;
            else engagementRate = 1.21;
        }

        // Estimate likes and comments
        const avgLikesPerPost = Math.round(followers * (engagementRate / 100) * 0.95);
        const avgCommentsPerPost = Math.round(followers * (engagementRate / 100) * 0.05);

        // Determine tier
        let tier = 'nano';
        if (followers >= 1000000) tier = 'mega';
        else if (followers >= 100000) tier = 'macro';
        else if (followers >= 50000) tier = 'mid-tier';
        else if (followers >= 10000) tier = 'micro';

        return {
            engagementRate,
            avgLikesPerPost,
            avgCommentsPerPost,
            tier
        };
    }

    /**
     * Generate the EXACT Qwen format prompt
     */
    generateQwenFormatPrompt(profileData, parentProfile = null) {
        const metrics = this.calculateMetrics(profileData);

        return `You are an expert Instagram profile analyzer. Analyze this profile and return ONLY a JSON object in the EXACT format shown below. Be extremely detailed and comprehensive.

PROFILE DATA:
Username: ${profileData.username}
Full Name: ${profileData.fullName || profileData.full_name || ''}
Bio: ${profileData.biography || profileData.bio || ''}
Followers: ${profileData.followersCount || 0}
Following: ${profileData.followingCount || 0}
Posts: ${profileData.postsCount || 0}
Verified: ${profileData.isVerified || false}
Business Account: ${profileData.isBusinessAccount || false}
Category: ${profileData.categoryName || profileData.businessCategoryName || ''}
External URL: ${profileData.externalUrl || ''}

CALCULATED METRICS:
Engagement Rate: ${metrics.engagementRate}%
Average Likes: ${metrics.avgLikesPerPost}
Average Comments: ${metrics.avgCommentsPerPost}
Influencer Tier: ${metrics.tier}

${parentProfile ? `PARENT PROFILE CONTEXT:
Parent Username: ${parentProfile.username}
Parent Category: ${parentProfile.categoryName || 'Not specified'}
Relationship: This profile appeared as a related/suggested profile to ${parentProfile.username}
` : ''}

Return ONLY a JSON object with this EXACT structure (be extremely detailed with 50+ data points):
{
  "profileAnalysis": {
    "username": "exact_username",
    "fullName": "full name",
    "profileType": "creator/business/personal/brand/influencer",
    "verificationStatus": "verified/not_verified",
    "accountCategory": "specific category",
    "primaryNiche": "main niche",
    "subNiches": ["niche1", "niche2"],
    "contentPillars": ["pillar1", "pillar2", "pillar3"],
    "bioAnalysis": {
      "tone": "professional/casual/friendly/inspiring",
      "keywords": ["keyword1", "keyword2"],
      "callToAction": "specific CTA if present",
      "contactInfo": "email/contact if present",
      "emotionalAppeal": "how bio connects emotionally"
    }
  },
  "audienceMetrics": {
    "totalFollowers": ${profileData.followersCount || 0},
    "followingCount": ${profileData.followingCount || 0},
    "followRatio": ${profileData.followersCount && profileData.followingCount ? (profileData.followersCount / profileData.followingCount).toFixed(2) : 0},
    "estimatedReach": ${Math.round((profileData.followersCount || 0) * 0.3)},
    "engagementRate": ${metrics.engagementRate},
    "avgLikesPerPost": ${metrics.avgLikesPerPost},
    "avgCommentsPerPost": ${metrics.avgCommentsPerPost},
    "avgSharesPerPost": ${Math.round(metrics.avgLikesPerPost * 0.05)},
    "avgSavesPerPost": ${Math.round(metrics.avgLikesPerPost * 0.1)},
    "audienceQualityScore": "1-10 score",
    "growthTrend": "rapid/steady/slow/declining"
  },
  "contentAnalysis": {
    "totalPosts": ${profileData.postsCount || 0},
    "postingFrequency": "daily/weekly/irregular",
    "contentTypes": ["photos", "reels", "carousels"],
    "dominantColors": ["color1", "color2"],
    "visualStyle": "minimalist/vibrant/vintage/modern",
    "captionStyle": "short/long/storytelling/informative",
    "hashtagStrategy": "branded/niche/trending/mixed",
    "averageHashtags": 10,
    "contentQuality": "professional/amateur/mixed",
    "brandConsistency": "high/medium/low"
  },
  "audienceDemographics": {
    "estimatedAgeRange": "18-24/25-34/35-44",
    "primaryGender": "male/female/mixed",
    "topLocations": ["location1", "location2"],
    "audienceInterests": ["interest1", "interest2"],
    "audienceLifestyle": "description",
    "economicSegment": "luxury/premium/mass/budget"
  },
  "influencerMetrics": {
    "influencerTier": "${metrics.tier}",
    "authorityScore": "1-10",
    "authenticityScore": "1-10",
    "influenceScore": "1-10",
    "brandSafetyScore": "1-10",
    "controversyRisk": "low/medium/high",
    "fakeFollowerPercentage": "estimated percentage"
  },
  "brandCollaborations": {
    "hasBrandPartnerships": true/false,
    "estimatedPartnerships": "number or range",
    "identifiedBrands": ["brand1", "brand2"],
    "sponsoredContentRatio": "percentage",
    "affiliateMarketing": true/false,
    "productPlacement": true/false
  },
  "monetizationPotential": {
    "estimatedPostValue": "$X - $Y",
    "estimatedStoryValue": "$X - $Y",
    "estimatedReelValue": "$X - $Y",
    "monthlyEarningPotential": "$X - $Y",
    "recommendedPricing": {
      "post": "$X",
      "story": "$X",
      "reel": "$X",
      "campaign": "$X"
    }
  },
  "competitorAnalysis": {
    "similarProfiles": ["profile1", "profile2"],
    "competitiveAdvantages": ["advantage1", "advantage2"],
    "weaknesses": ["weakness1", "weakness2"],
    "marketPosition": "leader/challenger/follower/niche"
  },
  "growthOpportunities": {
    "contentGaps": ["gap1", "gap2"],
    "untappedNiches": ["niche1", "niche2"],
    "collaborationOpportunities": ["opportunity1", "opportunity2"],
    "expansionPotential": ["area1", "area2"],
    "recommendedStrategies": ["strategy1", "strategy2"]
  },
  "engagementPatterns": {
    "bestPostingTimes": ["time1", "time2"],
    "highEngagementContent": ["type1", "type2"],
    "viralPotential": "high/medium/low",
    "communityStrength": "strong/moderate/weak",
    "responseRate": "high/medium/low"
  },
  "professionalAssessment": {
    "industryRelevance": "highly relevant/relevant/somewhat relevant",
    "businessPotential": "excellent/good/moderate/low",
    "investmentRisk": "low/medium/high",
    "longTermViability": "strong/moderate/uncertain",
    "overallRating": "1-10",
    "keyStrengths": ["strength1", "strength2", "strength3"],
    "keyRisks": ["risk1", "risk2"],
    "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
  },
  "metadata": {
    "analysisDate": "${new Date().toISOString()}",
    "dataCompleteness": "complete/partial",
    "confidenceScore": 0.95,
    "analysisVersion": "2.0"
  }
}`;
    }

    /**
     * Clean cache of expired entries
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.analysisCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.analysisCache.delete(key);
            }
        }
    }

    /**
     * Generate cache key for profile
     */
    getCacheKey(profileData) {
        return `${profileData.username}_${profileData.followersCount}_${profileData.postsCount}`;
    }

    /**
     * Analyze profile using OpenRouter API with Qwen model
     */
    async analyzeProfile(profileData, options = {}) {
        const startTime = Date.now();

        try {
            // Check cache first (unless force refresh is requested)
            if (!options.forceRefresh) {
                const cacheKey = this.getCacheKey(profileData);
                const cached = this.analysisCache.get(cacheKey);

                if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
                    logger.info(`Returning cached analysis for ${profileData.username}`);
                    return {
                        success: true,
                        analysis: cached.analysis,
                        fromCache: true,
                        modelUsed: 'qwen/qwen2.5-vl-72b-instruct:free (cached)',
                        processingTime: 0
                    };
                }
            }

            // Clean cache periodically
            if (Math.random() < 0.1) {
                this.cleanCache();
            }

            logger.info(`Attempting analysis with OpenRouter Qwen model for ${profileData.username}`);

            const prompt = this.generateQwenFormatPrompt(profileData, options.parentProfile);

            const requestBody = {
                model: this.openRouterConfig.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 12000,
                response_format: { type: "json_object" }
            };

            const response = await axios.post(
                `${this.openRouterConfig.baseUrl}/chat/completions`,
                requestBody,
                {
                    headers: this.openRouterConfig.headers,
                    timeout: 30000
                }
            );

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                throw new Error('Invalid response from OpenRouter API');
            }

            const content = response.data.choices[0].message.content;
            let analysis;

            try {
                analysis = typeof content === 'string' ? JSON.parse(content) : content;
            } catch (parseError) {
                logger.error('Failed to parse OpenRouter response:', parseError);
                throw new Error('Invalid JSON response from OpenRouter');
            }

            // Cache the successful analysis
            const cacheKey = this.getCacheKey(profileData);
            this.analysisCache.set(cacheKey, {
                analysis,
                timestamp: Date.now()
            });

            const processingTime = Date.now() - startTime;

            logger.info(`OpenRouter Qwen analysis successful for ${profileData.username} (${processingTime}ms)`);

            return {
                success: true,
                analysis,
                fromCache: false,
                modelUsed: 'qwen/qwen2.5-vl-72b-instruct:free',
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;

            if (error.response) {
                logger.error('OpenRouter API error:', {
                    status: error.response.status,
                    data: error.response.data
                });
            } else {
                logger.error('OpenRouter analysis error:', error.message);
            }

            return {
                success: false,
                error: error.message,
                modelUsed: 'qwen/qwen2.5-vl-72b-instruct:free',
                processingTime
            };
        }
    }
}

module.exports = new OpenRouterAnalysisService();