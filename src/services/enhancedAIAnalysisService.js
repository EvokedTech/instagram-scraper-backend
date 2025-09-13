const axios = require('axios');
const logger = require('../utils/logger');

class EnhancedAIAnalysisService {
    constructor() {
        this.models = [
            {
                name: 'deepseek-r1',
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                apiKey: process.env.DEEPSEEK_API_KEY || 'sk-57fb77112c994135a1b323ef1c0888d0',
                model: 'deepseek-chat',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (process.env.DEEPSEEK_API_KEY || 'sk-57fb77112c994135a1b323ef1c0888d0')
                },
                maxTokens: 8000,
                temperature: 0.7
            },
            {
                name: 'grok',
                endpoint: 'https://api.x.ai/v1/chat/completions',
                apiKey: process.env.GROK_API_KEY,
                model: 'grok-4-latest',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.GROK_API_KEY
                },
                maxTokens: 8000,
                temperature: 0.7
            },
            {
                name: 'mistral',
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                apiKey: process.env.MISTRAL_API_KEY,
                model: 'mistral-large-latest',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY
                },
                maxTokens: 8000,
                temperature: 0.7
            }
        ];

        this.analysisCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
    }

    /**
     * Generate comprehensive analysis prompt
     */
    generateEnhancedPrompt(profileData) {
        return `Analyze this Instagram profile and provide a COMPREHENSIVE analysis in the exact JSON format specified below.

PROFILE DATA:
- Username: ${profileData.username || 'N/A'}
- Full Name: ${profileData.fullName || 'N/A'}
- Biography: ${profileData.biography || profileData.bio || 'N/A'}
- Followers: ${profileData.followersCount || profileData.followers || 0}
- Following: ${profileData.followingCount || profileData.following || 0}
- Posts: ${profileData.postsCount || profileData.posts || 0}
- Verified: ${profileData.isVerified || false}
- Business Account: ${profileData.isBusinessAccount || false}
- Category: ${profileData.categoryName || profileData.businessCategoryName || 'N/A'}
- External URL: ${profileData.externalUrl || 'N/A'}
- Profile URL: https://www.instagram.com/${profileData.username}/

IMPORTANT: Analyze all aspects including gender (infer from name and content), age (estimate), content type, engagement, audience demographics, geographic signals, business suitability, and monetization potential.

Return ONLY valid JSON in this EXACT structure:

{
  "username": "${profileData.username}",
  "fullName": "${profileData.fullName || ''}",
  "profileUrl": "https://www.instagram.com/${profileData.username}/",
  "profilePicUrl": "${profileData.profilePicUrl || ''}",
  "gender": "Male/Female/Non-binary/Unknown",
  "age": <estimated age as number>,
  "profileSummary": [
    "<9 detailed bullet points describing the profile, engagement, content, audience, monetization, etc.>"
  ],
  "adultContentScore": <0-100>,
  "engagementRate": <percentage as decimal>,
  "contentType": ["<array of content types>"],
  "contactInformation": {
    "email": null,
    "phoneNumber": null,
    "businessEmail": null,
    "externalLinks": [{
      "type": "website/landing_page/social",
      "url": "<url>",
      "platform": "<platform name>"
    }],
    "collaborationMethod": "direct/agent/email",
    "mediaKit": <boolean>,
    "rateCardAvailable": <boolean>
  },
  "accountMetrics": {
    "followersCount": ${profileData.followersCount || 0},
    "followingCount": ${profileData.followingCount || 0},
    "postsCount": ${profileData.postsCount || 0},
    "verified": ${profileData.isVerified || false},
    "businessAccount": ${profileData.isBusinessAccount || false},
    "lastActiveDate": "${new Date().toISOString()}",
    "accountAge": "New/Growing/Established",
    "postingConsistency": "consistent/irregular/sporadic",
    "profileCompleteness": <0-100>
  },
  "contentMetrics": {
    "avgLikesPerPost": <number>,
    "avgCommentsPerPost": <number>,
    "avgViewsPerPost": null,
    "postFrequency": "daily/weekly/monthly",
    "primaryHashtags": [],
    "sponsoredContentRate": <0-100>,
    "engagementRate": <decimal>,
    "engagementGrowthTrend": "growing/stable/declining",
    "contentQualityScore": <0-100>,
    "viralPotential": <0-100>,
    "brandMentionFrequency": <number>,
    "hashtagStrategy": "aggressive/moderate/low",
    "captionLength": "short/medium/long",
    "contentFormats": ["photo", "video", "carousel", "reels"],
    "postingTimePatterns": ["morning", "afternoon", "evening", "night"]
  },
  "geographicSignals": [
    {
      "index": 0,
      "location": "<description>",
      "code": "<country code if applicable>",
      "confidence": "high/medium/low"
    }
  ],
  "audienceSignals": {
    "likelyAudienceGender": "Male/Female/Mixed",
    "primaryAgeGroup": "13-17/18-24/25-34/35-44/45-54/55+",
    "networkVerificationRate": "<rate>",
    "engagementQuality": "High/Medium/Low",
    "audienceGenderBreakdown": {
      "male": <percentage>,
      "female": <percentage>,
      "non_binary": <percentage>
    },
    "audienceAgeBreakdown": {
      "13_17": <percentage>,
      "18_24": <percentage>,
      "25_34": <percentage>,
      "35_44": <percentage>,
      "45_54": <percentage>,
      "55_plus": <percentage>
    },
    "audienceGeoBreakdown": [
      {
        "country": "<2-letter code>",
        "percentage": <number>,
        "city": null
      }
    ],
    "estimatedAudienceQualityScore": <0-100>,
    "audienceInterests": ["<array of interests>"],
    "audienceLanguages": ["<array of languages>"],
    "audiencePurchasingPower": "low/medium/high",
    "peakEngagementTimes": ["<time ranges>"]
  },
  "contentAnalysis": {
    "contentType": ["<array of types>"],
    "primaryContentThemes": ["<main themes>"],
    "secondaryContentThemes": ["<secondary themes>"],
    "contentTone": "<description of tone>",
    "languagesUsed": ["<languages>"],
    "visualStyle": "<style description>",
    "adultContentScore": <0-100>,
    "brandSafetyScore": <0-100>,
    "adultContentType": "none/suggestive/explicit",
    "adultPlatformPresence": [],
    "controversyRisk": "low/medium/high",
    "nicheExpertise": ["<areas of expertise>"],
    "contentCategories": ["<categories>"]
  },
  "businessCategorySuitability": {
    "perfectMatch": [
      {
        "category": "<category name>",
        "confidenceScore": <0-100>,
        "reasoning": "<detailed explanation>",
        "audienceAlignment": "high/medium/low",
        "contentAlignment": "high/medium/low",
        "historicalEvidence": <boolean>
      }
    ],
    "highlyCompatible": [
      {
        "category": "<category>",
        "confidenceScore": <0-100>,
        "reasoning": "<explanation>",
        "requiredAdaptations": ["<list of adaptations>"]
      }
    ],
    "moderatelyCompatible": [
      {
        "category": "<category>",
        "confidenceScore": <0-100>,
        "reasoning": "<explanation>",
        "successFactors": ["<factors>"],
        "risks": ["<risks>"]
      }
    ],
    "requiresConsideration": [
      {
        "category": "<category>",
        "confidenceScore": <0-100>,
        "specificConsiderations": ["<considerations>"],
        "minimumRequirements": ["<requirements>"]
      }
    ],
    "notRecommended": [
      {
        "category": "<category>",
        "reasoning": "<explanation>",
        "conflictAreas": ["<areas>"]
      }
    ],
    "brandCollaborationHistory": [],
    "monetizationIndicators": [
      {
        "type": "<type>",
        "evidence": "<description>",
        "frequency": "frequent/occasional/rare",
        "categories": ["<categories>"],
        "adultContentMonetization": <boolean>,
        "subscriptionModelUsage": <boolean>,
        "fanFundingPlatforms": []
      }
    ]
  },
  "professionalReadiness": {
    "businessSetupScore": <0-100>,
    "contentCreatorToolsUsage": ["<tools>"],
    "brandCollaborationExperience": "none/beginner/intermediate/expert",
    "mediaKitQuality": "none/basic/professional",
    "responseTimeEstimate": "fast/moderate/slow",
    "multiPlatformPresence": ["<platforms>"]
  },
  "summaryStats": {
    "totalGeographicSignals": <number>,
    "totalContentTypes": <number>,
    "influencerTier": "nano/micro/mid-tier/macro/mega",
    "engagementTier": "low/medium/high/exceptional",
    "brandSafetyLevel": "low/medium/high",
    "audienceQualityTier": "low/medium/high",
    "commercialReadiness": "not-ready/developing/ready/professional",
    "nicheInfluence": "broad/focused/niche",
    "growthTrajectory": "declining/stable/growing/explosive",
    "platformOptimization": "poor/fair/good/excellent",
    "audienceAlignment": "poor/fair/good/excellent",
    "contentConsistency": "inconsistent/somewhat-consistent/consistent"
  }
}`;
    }

    /**
     * Calculate engagement rate
     */
    calculateEngagementRate(profileData) {
        const followers = profileData.followersCount || profileData.followers || 0;
        if (followers === 0) return 0;

        // Estimate based on typical Instagram metrics
        const avgLikes = followers * 0.03; // 3% average
        const avgComments = followers * 0.001; // 0.1% average
        const engagement = ((avgLikes + avgComments) / followers) * 100;
        return Math.round(engagement * 100) / 100;
    }

    /**
     * Determine influencer tier
     */
    getInfluencerTier(followers) {
        if (followers < 1000) return 'nano';
        if (followers < 10000) return 'nano';
        if (followers < 100000) return 'micro';
        if (followers < 1000000) return 'mid-tier';
        if (followers < 10000000) return 'macro';
        return 'mega';
    }

    /**
     * Perform enhanced analysis
     */
    async analyzeProfileEnhanced(profileData, options = {}) {
        const startTime = Date.now();

        try {
            logger.info(`Starting enhanced analysis for ${profileData.username}`);

            // Generate enhanced prompt
            const prompt = this.generateEnhancedPrompt(profileData);

            let lastError = null;
            let modelUsed = null;

            // Try each model
            for (const modelConfig of this.models) {
                try {
                    logger.info(`Attempting enhanced analysis with ${modelConfig.name}`);

                    const response = await axios.post(
                        modelConfig.endpoint,
                        {
                            model: modelConfig.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an expert Instagram profile analyst. Provide detailed, accurate analysis in the exact JSON format requested. Be specific and comprehensive.'
                                },
                                {
                                    role: 'user',
                                    content: prompt
                                }
                            ],
                            temperature: modelConfig.temperature,
                            max_tokens: modelConfig.maxTokens,
                            stream: false
                        },
                        {
                            headers: modelConfig.headers,
                            timeout: 60000 // 60 second timeout for complex analysis
                        }
                    );

                    if (response.data && response.data.choices && response.data.choices[0]) {
                        const content = response.data.choices[0].message.content;

                        // Parse JSON response
                        let analysis;
                        try {
                            const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
                            if (jsonMatch) {
                                analysis = JSON.parse(jsonMatch[1]);
                            } else {
                                analysis = JSON.parse(content);
                            }
                        } catch (parseError) {
                            logger.error('Failed to parse AI response as JSON, using fallback');
                            analysis = this.generateFallbackAnalysis(profileData);
                        }

                        modelUsed = modelConfig.name;
                        logger.info(`Enhanced analysis successful with ${modelConfig.name}`);

                        return {
                            ...analysis,
                            _aiMetadata: {
                                modelUsed,
                                processingTime: Date.now() - startTime,
                                analyzedAt: new Date()
                            }
                        };
                    }
                } catch (error) {
                    lastError = error;
                    logger.error(`Failed with ${modelConfig.name}: ${error.message}`);
                    continue;
                }
            }

            // All models failed, use fallback
            logger.warn('All AI models failed, using fallback analysis');
            return this.generateFallbackAnalysis(profileData);

        } catch (error) {
            logger.error('Enhanced analysis failed:', error);
            return this.generateFallbackAnalysis(profileData);
        }
    }

    /**
     * Generate fallback analysis when AI fails
     */
    generateFallbackAnalysis(profileData) {
        const followers = profileData.followersCount || 0;
        const engagementRate = this.calculateEngagementRate(profileData);
        const tier = this.getInfluencerTier(followers);

        return {
            username: profileData.username,
            fullName: profileData.fullName || '',
            profileUrl: `https://www.instagram.com/${profileData.username}/`,
            profilePicUrl: profileData.profilePicUrl || '',
            gender: 'Unknown',
            age: 25,
            profileSummary: [
                `${tier} influencer with ${followers.toLocaleString()} followers.`,
                `Engagement rate estimated at ${engagementRate}%.`,
                `Account has ${profileData.postsCount || 0} posts.`,
                `${profileData.isVerified ? 'Verified' : 'Non-verified'} account.`,
                `${profileData.isBusinessAccount ? 'Business' : 'Personal'} account type.`,
                `Following ${profileData.followingCount || 0} accounts.`,
                `Profile analysis generated using fallback method.`,
                `Manual review recommended for accurate assessment.`,
                `Data extracted from Instagram public profile.`
            ],
            adultContentScore: 0,
            engagementRate: engagementRate,
            contentType: ['Unknown'],
            contactInformation: {
                email: null,
                phoneNumber: null,
                businessEmail: null,
                externalLinks: profileData.externalUrl ? [{
                    type: 'website',
                    url: profileData.externalUrl,
                    platform: 'external'
                }] : [],
                collaborationMethod: 'direct',
                mediaKit: false,
                rateCardAvailable: false
            },
            accountMetrics: {
                followersCount: followers,
                followingCount: profileData.followingCount || 0,
                postsCount: profileData.postsCount || 0,
                verified: profileData.isVerified || false,
                businessAccount: profileData.isBusinessAccount || false,
                lastActiveDate: new Date().toISOString(),
                accountAge: 'Unknown',
                postingConsistency: 'unknown',
                profileCompleteness: 50
            },
            contentMetrics: {
                avgLikesPerPost: Math.round(followers * 0.03),
                avgCommentsPerPost: Math.round(followers * 0.001),
                avgViewsPerPost: null,
                postFrequency: 'unknown',
                primaryHashtags: [],
                sponsoredContentRate: 0,
                engagementRate: engagementRate,
                engagementGrowthTrend: 'stable',
                contentQualityScore: 50,
                viralPotential: 50,
                brandMentionFrequency: 0,
                hashtagStrategy: 'unknown',
                captionLength: 'unknown',
                contentFormats: ['photo'],
                postingTimePatterns: ['unknown']
            },
            geographicSignals: [],
            audienceSignals: {
                likelyAudienceGender: 'Mixed',
                primaryAgeGroup: '25-34',
                networkVerificationRate: engagementRate.toString(),
                engagementQuality: 'Medium',
                audienceGenderBreakdown: {
                    male: 50,
                    female: 50,
                    non_binary: 0
                },
                audienceAgeBreakdown: {
                    '13_17': 5,
                    '18_24': 25,
                    '25_34': 35,
                    '35_44': 20,
                    '45_54': 10,
                    '55_plus': 5
                },
                audienceGeoBreakdown: [],
                estimatedAudienceQualityScore: 50,
                audienceInterests: [],
                audienceLanguages: ['English'],
                audiencePurchasingPower: 'medium',
                peakEngagementTimes: []
            },
            contentAnalysis: {
                contentType: ['Unknown'],
                primaryContentThemes: [],
                secondaryContentThemes: [],
                contentTone: 'unknown',
                languagesUsed: [],
                visualStyle: 'unknown',
                adultContentScore: 0,
                brandSafetyScore: 80,
                adultContentType: 'none',
                adultPlatformPresence: [],
                controversyRisk: 'low',
                nicheExpertise: [],
                contentCategories: []
            },
            businessCategorySuitability: {
                perfectMatch: [],
                highlyCompatible: [],
                moderatelyCompatible: [],
                requiresConsideration: [],
                notRecommended: [],
                brandCollaborationHistory: [],
                monetizationIndicators: []
            },
            professionalReadiness: {
                businessSetupScore: 50,
                contentCreatorToolsUsage: [],
                brandCollaborationExperience: 'unknown',
                mediaKitQuality: 'none',
                responseTimeEstimate: 'unknown',
                multiPlatformPresence: ['Instagram']
            },
            summaryStats: {
                totalGeographicSignals: 0,
                totalContentTypes: 1,
                influencerTier: tier,
                engagementTier: engagementRate > 3 ? 'high' : engagementRate > 1 ? 'medium' : 'low',
                brandSafetyLevel: 'medium',
                audienceQualityTier: 'medium',
                commercialReadiness: 'developing',
                nicheInfluence: 'unknown',
                growthTrajectory: 'stable',
                platformOptimization: 'fair',
                audienceAlignment: 'fair',
                contentConsistency: 'unknown'
            }
        };
    }
}

module.exports = new EnhancedAIAnalysisService();