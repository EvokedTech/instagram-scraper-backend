const axios = require('axios');
const logger = require('../utils/logger');

class QwenFormatAnalysisService {
    constructor() {
        this.models = [
            {
                name: 'grok',
                endpoint: 'https://api.x.ai/v1/chat/completions',
                apiKey: process.env.GROK_API_KEY,
                model: 'grok-4-latest',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.GROK_API_KEY
                },
                maxTokens: 12000,
                temperature: 0.3
            },
            {
                name: 'deepseek-r1',
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                apiKey: process.env.DEEPSEEK_API_KEY,
                model: 'deepseek-chat',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
                },
                maxTokens: 12000,
                temperature: 0.3  // Lower temperature for more consistent format
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
                maxTokens: 12000,
                temperature: 0.3
            }
        ];
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
${parentProfile ? `Parent Profile: ${parentProfile}` : ''}

IMPORTANT INSTRUCTIONS:
1. Infer gender from name and content (Male/Female/Non-binary/Unknown)
2. Estimate age based on content and style (number between 18-65)
3. Create EXACTLY 9 detailed bullet points for profileSummary
4. Calculate adultContentScore (0-100) based on content type
5. Provide specific engagement rate as decimal (e.g., 1.87)
6. List 5 specific content types
7. Fill ALL fields - use null only where specified
8. Be specific with numbers, percentages, and estimates
9. Infer geographic signals from language, name, and content
10. Estimate audience demographics realistically

Return ONLY this JSON structure (no explanations, no markdown):

{
  "parentUsername": ${parentProfile ? `"${parentProfile}"` : 'null'},
  "parentProfileUrl": ${parentProfile ? `"https://www.instagram.com/${parentProfile}"` : 'null'},
  "username": "${profileData.username}",
  "fullName": "${profileData.fullName || ''}",
  "profileUrl": "https://www.instagram.com/${profileData.username}",
  "profilePicUrl": "${profileData.profilePicUrl || ''}",
  "gender": "Male|Female|Non-binary|Unknown",
  "age": <number 18-65>,
  "profileSummary": [
    "${metrics.tier === 'mega' ? 'Mega' : metrics.tier === 'macro' ? 'Macro' : metrics.tier === 'mid-tier' ? 'Mid-tier' : metrics.tier === 'micro' ? 'Micro' : 'Nano'}-tier influencer with exactly ${profileData.followersCount?.toLocaleString() || 0} followers.",
    "Content focuses on [SPECIFIC THEMES based on bio/category].",
    "Exhibits a [high/medium/low] engagement rate of ${metrics.engagementRate.toFixed(2)}%, calculated from an average of ${metrics.avgLikesPerPost.toLocaleString()} likes and ${metrics.avgCommentsPerPost} comments per post.",
    "Strong geographic focus on [INFER FROM NAME/LANGUAGE], likely in [REGIONS].",
    "The account is a ${profileData.isVerified ? 'verified' : 'non-verified'}, ${profileData.isBusinessAccount ? 'business-enabled' : 'personal'} Instagram profile.",
    "Audience is estimated to be predominantly [GENDER] ([%]) in the [AGE] age range, with interests in [TOPICS].",
    "Content performance is [stable/growing/declining] with [occasional/frequent/rare] high-performing posts, indicating [viral potential assessment].",
    "Monetization is [strongly indicated/possible/unlikely] through [SPECIFIC METHODS]. Shows [evidence of monetization].",
    "Contact is facilitated [METHOD]; [CONTACT INFO AVAILABILITY]."
  ],
  "adultContentScore": <0-100>,
  "engagementRate": ${metrics.engagementRate.toFixed(2)},
  "contentType": [
    "Type1",
    "Type2",
    "Type3",
    "Type4",
    "Type5"
  ],
  "contactInformation": {
    "email": null,
    "phoneNumber": null,
    "businessEmail": null,
    "externalLinks": [
      {
        "type": "website|landing_page|social",
        "url": "${profileData.externalUrl || ''}",
        "platform": "platform_name"
      }
    ],
    "collaborationMethod": "direct|agent|email",
    "mediaKit": false,
    "rateCardAvailable": false
  },
  "accountMetrics": {
    "followersCount": ${profileData.followersCount || 0},
    "followingCount": ${profileData.followingCount || 0},
    "postsCount": ${profileData.postsCount || 0},
    "verified": ${profileData.isVerified || false},
    "businessAccount": ${profileData.isBusinessAccount || false},
    "lastActiveDate": "${new Date().toISOString()}",
    "accountAge": "New|Growing|Established",
    "postingConsistency": "consistent|irregular|sporadic",
    "profileCompleteness": <0-100>
  },
  "contentMetrics": {
    "avgLikesPerPost": ${metrics.avgLikesPerPost},
    "avgCommentsPerPost": ${metrics.avgCommentsPerPost},
    "avgViewsPerPost": null,
    "postFrequency": "daily|weekly|monthly",
    "primaryHashtags": [],
    "sponsoredContentRate": <0-100>,
    "engagementRate": ${metrics.engagementRate.toFixed(2)},
    "engagementGrowthTrend": "growing|stable|declining",
    "contentQualityScore": <0-100>,
    "viralPotential": <0-100>,
    "brandMentionFrequency": <number>,
    "hashtagStrategy": "aggressive|moderate|low",
    "captionLength": "short|medium|long",
    "contentFormats": ["photo", "video", "carousel", "reels"],
    "postingTimePatterns": ["morning", "afternoon", "evening", "night"]
  },
  "geographicSignals": [
    {
      "index": 0,
      "location": "Language/cultural indicator description",
      "code": "XX",
      "confidence": "high|medium|low"
    },
    {
      "index": 1,
      "location": "Name origin indicator",
      "code": "XX",
      "confidence": "high|medium|low"
    },
    {
      "index": 2,
      "location": "Inferred audience location",
      "code": "XX",
      "confidence": "high|medium|low"
    }
  ],
  "audienceSignals": {
    "likelyAudienceGender": "Male|Female|Mixed",
    "primaryAgeGroup": "13-17|18-24|25-34|35-44|45-54|55+",
    "networkVerificationRate": "${metrics.engagementRate.toFixed(2)}",
    "engagementQuality": "High|Medium|Low",
    "audienceGenderBreakdown": {
      "male": <percentage>,
      "female": <percentage>,
      "non_binary": 0
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
        "country": "XX",
        "percentage": <number>,
        "city": null
      },
      {
        "country": "XX",
        "percentage": <number>,
        "city": null
      },
      {
        "country": "XX",
        "percentage": <number>,
        "city": null
      }
    ],
    "estimatedAudienceQualityScore": <0-100>,
    "audienceInterests": [
      "Interest1",
      "Interest2",
      "Interest3",
      "Interest4",
      "Interest5"
    ],
    "audienceLanguages": ["Language1", "Language2"],
    "audiencePurchasingPower": "low|medium|high",
    "peakEngagementTimes": ["time_range"]
  },
  "contentAnalysis": {
    "contentType": ["Type1", "Type2", "Type3", "Type4", "Type5"],
    "primaryContentThemes": [
      "Theme1",
      "Theme2",
      "Theme3"
    ],
    "secondaryContentThemes": [
      "Theme1",
      "Theme2",
      "Theme3"
    ],
    "contentTone": "professional/casual/humorous/serious/mixed",
    "languagesUsed": ["Language1"],
    "visualStyle": "bright/dark/minimalist/colorful/professional",
    "adultContentScore": <0-100>,
    "brandSafetyScore": <0-100>,
    "adultContentType": "none|suggestive|explicit",
    "adultPlatformPresence": [],
    "controversyRisk": "low|medium|high",
    "nicheExpertise": ["Expertise1", "Expertise2"],
    "contentCategories": ["Category1", "Category2", "Category3", "Category4"]
  },
  "businessCategorySuitability": {
    "perfectMatch": [
      {
        "category": "Fashion|Beauty|Technology|Food|Travel|Fitness|Other",
        "confidenceScore": <0-100>,
        "reasoning": "Detailed explanation of why this category is a perfect match",
        "audienceAlignment": "high|medium|low",
        "contentAlignment": "high|medium|low",
        "historicalEvidence": true|false
      }
    ],
    "highlyCompatible": [
      {
        "category": "Category",
        "confidenceScore": <0-100>,
        "reasoning": "Explanation",
        "requiredAdaptations": ["Adaptation1", "Adaptation2"]
      }
    ],
    "moderatelyCompatible": [
      {
        "category": "Category",
        "confidenceScore": <0-100>,
        "reasoning": "Explanation",
        "successFactors": ["Factor1", "Factor2"],
        "risks": ["Risk1", "Risk2"]
      }
    ],
    "requiresConsideration": [
      {
        "category": "Category",
        "confidenceScore": <0-100>,
        "specificConsiderations": ["Consideration1", "Consideration2"],
        "minimumRequirements": ["Requirement1", "Requirement2"]
      }
    ],
    "notRecommended": [
      {
        "category": "Category",
        "reasoning": "Explanation",
        "conflictAreas": ["Area1", "Area2"]
      }
    ],
    "brandCollaborationHistory": [],
    "monetizationIndicators": [
      {
        "type": "sponsored_content",
        "evidence": "Description of evidence",
        "frequency": "occasional",
        "categories": ["Fashion", "Beauty"],
        "adultContentMonetization": false,
        "subscriptionModelUsage": false,
        "fanFundingPlatforms": []
      }
    ]
  },
  "professionalReadiness": {
    "businessSetupScore": <0-100>,
    "contentCreatorToolsUsage": ["Tool1", "Tool2"],
    "brandCollaborationExperience": "none|beginner|intermediate|expert",
    "mediaKitQuality": "none|basic|professional",
    "responseTimeEstimate": "fast|moderate|slow",
    "multiPlatformPresence": ["Instagram", "Platform2"]
  },
  "summaryStats": {
    "totalGeographicSignals": 3,
    "totalContentTypes": 5,
    "influencerTier": "${metrics.tier}",
    "engagementTier": "${metrics.engagementRate > 5 ? 'exceptional' : metrics.engagementRate > 3 ? 'high' : metrics.engagementRate > 1 ? 'medium' : 'low'}",
    "brandSafetyLevel": "low|medium|high",
    "audienceQualityTier": "low|medium|high",
    "commercialReadiness": "not-ready|developing|ready|professional",
    "nicheInfluence": "broad|focused|niche",
    "growthTrajectory": "declining|stable|growing|explosive",
    "platformOptimization": "poor|fair|good|excellent",
    "audienceAlignment": "poor|fair|good|excellent",
    "contentConsistency": "inconsistent|somewhat-consistent|consistent"
  },
  "currentStatus": {
    "value": "Default",
    "color": "#6B7280",
    "isCustom": false,
    "updatedAt": "${new Date().toISOString()}"
  },
  "updatedAt": "${new Date().toISOString()}"
}`;
    }

    /**
     * Analyze profile in Qwen format
     */
    async analyzeInQwenFormat(profileData, parentProfile = null) {
        const startTime = Date.now();

        try {
            logger.info(`Starting Qwen-format analysis for ${profileData.username}`);

            const prompt = this.generateQwenFormatPrompt(profileData, parentProfile);

            let lastError = null;
            let modelUsed = null;

            // Try each model
            for (const modelConfig of this.models) {
                try {
                    logger.info(`Attempting Qwen-format analysis with ${modelConfig.name}`);

                    const response = await axios.post(
                        modelConfig.endpoint,
                        {
                            model: modelConfig.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an Instagram profile analysis expert. Return ONLY valid JSON in the exact format requested. Be precise with all numbers and percentages. Make realistic estimates based on the profile data provided.'
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
                            timeout: 90000 // 90 second timeout
                        }
                    );

                    if (response.data && response.data.choices && response.data.choices[0]) {
                        const content = response.data.choices[0].message.content;

                        // Parse JSON response
                        let analysis;
                        try {
                            // Remove any markdown formatting
                            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                            analysis = JSON.parse(cleanContent);

                            // Validate and fix monetizationIndicators if needed
                            if (analysis.businessCategorySuitability?.monetizationIndicators) {
                                const indicators = analysis.businessCategorySuitability.monetizationIndicators;

                                // Ensure it's an array
                                if (!Array.isArray(indicators)) {
                                    analysis.businessCategorySuitability.monetizationIndicators = [];
                                } else {
                                    // Validate each indicator
                                    analysis.businessCategorySuitability.monetizationIndicators = indicators.map(ind => {
                                        // Ensure all required fields exist with proper types
                                        return {
                                            type: String(ind.type || 'none'),
                                            evidence: String(ind.evidence || ''),
                                            frequency: String(ind.frequency || 'none'),
                                            categories: Array.isArray(ind.categories) ? ind.categories : [],
                                            adultContentMonetization: Boolean(ind.adultContentMonetization),
                                            subscriptionModelUsage: Boolean(ind.subscriptionModelUsage),
                                            fanFundingPlatforms: Array.isArray(ind.fanFundingPlatforms) ? ind.fanFundingPlatforms : []
                                        };
                                    });
                                }
                            }
                        } catch (parseError) {
                            logger.error('Failed to parse AI response as JSON');
                            throw parseError;
                        }

                        modelUsed = modelConfig.name;
                        logger.info(`Qwen-format analysis successful with ${modelConfig.name}`);

                        // Add metadata
                        analysis._aiMetadata = {
                            modelUsed,
                            processingTime: Date.now() - startTime,
                            analyzedAt: new Date()
                        };

                        return analysis;
                    }
                } catch (error) {
                    lastError = error;
                    logger.error(`Failed with ${modelConfig.name}: ${error.message}`);
                    continue;
                }
            }

            throw new Error(`All models failed: ${lastError?.message}`);

        } catch (error) {
            logger.error('Qwen-format analysis failed:', error);
            throw error;
        }
    }
}

module.exports = new QwenFormatAnalysisService();