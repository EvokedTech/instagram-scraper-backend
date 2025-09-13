const axios = require('axios');
const logger = require('../utils/logger');

class AIAnalysisService {
    constructor() {
        this.models = [
            {
                name: 'deepseek-r1',
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                apiKey: process.env.DEEPSEEK_API_KEY,
                model: 'deepseek-chat',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
                },
                maxTokens: 4000,
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
                maxTokens: 4000,
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
                maxTokens: 4000,
                temperature: 0.7
            }
        ];

        // Track usage for rate limiting
        this.usageTracker = new Map();

        // Deduplication cache
        this.analysisCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour cache
    }

    /**
     * Generate cache key for deduplication
     */
    generateCacheKey(profileData) {
        const username = profileData.username || profileData.handle || '';
        const followerCount = profileData.followersCount || profileData.follower_count || 0;
        const postCount = profileData.postsCount || profileData.media_count || 0;
        return `${username.toLowerCase()}_${followerCount}_${postCount}`;
    }

    /**
     * Check if analysis exists in cache
     */
    checkCache(profileData) {
        const cacheKey = this.generateCacheKey(profileData);
        const cached = this.analysisCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            logger.info(`Cache hit for profile: ${cacheKey}`);
            return cached.analysis;
        }

        return null;
    }

    /**
     * Store analysis in cache
     */
    cacheAnalysis(profileData, analysis) {
        const cacheKey = this.generateCacheKey(profileData);
        this.analysisCache.set(cacheKey, {
            analysis,
            timestamp: Date.now()
        });

        // Clean old cache entries
        this.cleanCache();
    }

    /**
     * Clean expired cache entries
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.analysisCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.analysisCache.delete(key);
            }
        }
    }

    /**
     * Analyze profile with fallback support
     */
    async analyzeProfile(profileData, options = {}) {
        const startTime = Date.now();

        // Check cache first for deduplication
        const cachedAnalysis = this.checkCache(profileData);
        if (cachedAnalysis && !options.forceRefresh) {
            logger.info(`Returning cached analysis for ${profileData.username}`);
            return {
                ...cachedAnalysis,
                fromCache: true,
                processingTime: Date.now() - startTime
            };
        }

        // Prepare the analysis prompt
        const prompt = this.generateAnalysisPrompt(profileData);

        let lastError = null;
        let modelUsed = null;

        // Try each model in order
        for (const modelConfig of this.models) {
            try {
                logger.info(`Attempting analysis with ${modelConfig.name}`);

                const result = await this.callModel(modelConfig, prompt);

                if (result && result.analysis) {
                    modelUsed = modelConfig.name;

                    // Cache the successful analysis
                    this.cacheAnalysis(profileData, result);

                    logger.info(`Successfully analyzed with ${modelConfig.name}`);

                    return {
                        ...result,
                        modelUsed,
                        fromCache: false,
                        processingTime: Date.now() - startTime
                    };
                }
            } catch (error) {
                lastError = error;
                logger.error(`Failed with ${modelConfig.name}: ${error.message}`);

                // Check if it's a rate limit or quota error
                if (this.isQuotaError(error)) {
                    logger.warn(`${modelConfig.name} quota exceeded, trying next model`);
                } else if (this.isRateLimitError(error)) {
                    logger.warn(`${modelConfig.name} rate limited, trying next model`);
                }

                // Continue to next model
                continue;
            }
        }

        // All models failed
        throw new Error(`All AI models failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Call a specific AI model
     */
    async callModel(modelConfig, prompt) {
        try {
            const requestBody = {
                model: modelConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Instagram profile analyzer. Analyze the provided profile data and return insights in JSON format.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: modelConfig.temperature,
                max_tokens: modelConfig.maxTokens,
                stream: false
            };

            const response = await axios.post(
                modelConfig.endpoint,
                requestBody,
                {
                    headers: modelConfig.headers,
                    timeout: 30000 // 30 second timeout
                }
            );

            if (response.data && response.data.choices && response.data.choices[0]) {
                const content = response.data.choices[0].message.content;

                // Try to parse JSON from the response
                let analysis;
                try {
                    // Extract JSON from the response if it's wrapped in markdown
                    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
                    if (jsonMatch) {
                        analysis = JSON.parse(jsonMatch[1]);
                    } else {
                        analysis = JSON.parse(content);
                    }
                } catch (parseError) {
                    // If JSON parsing fails, create structured response from text
                    analysis = this.parseTextResponse(content);
                }

                return {
                    analysis,
                    rawResponse: content,
                    model: modelConfig.name,
                    usage: response.data.usage || null
                };
            }

            throw new Error('Invalid response structure from AI model');
        } catch (error) {
            logger.error(`Error calling ${modelConfig.name}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Generate analysis prompt
     */
    generateAnalysisPrompt(profileData) {
        return `Analyze this Instagram profile and provide detailed insights:

Profile Data:
- Username: ${profileData.username || 'N/A'}
- Full Name: ${profileData.fullName || 'N/A'}
- Biography: ${profileData.biography || 'N/A'}
- Followers: ${profileData.followersCount || 0}
- Following: ${profileData.followingCount || 0}
- Posts: ${profileData.postsCount || 0}
- Is Verified: ${profileData.isVerified || false}
- Is Business: ${profileData.isBusinessAccount || false}
- Category: ${profileData.categoryName || 'N/A'}
- External URL: ${profileData.externalUrl || 'N/A'}

Please provide analysis in the following JSON format:
{
    "profileType": "personal/business/influencer/brand/other",
    "engagementRate": "percentage estimate",
    "audienceQuality": "high/medium/low",
    "contentStrategy": "description of content strategy",
    "growthPotential": "high/medium/low",
    "authenticity": {
        "score": 1-10,
        "indicators": ["list of authenticity indicators"]
    },
    "recommendations": ["list of recommendations"],
    "keyInsights": ["list of key insights"],
    "estimatedValue": {
        "tier": "nano/micro/mid/macro/mega",
        "monthlyValue": "estimated monetary value range"
    },
    "risks": ["potential risks or red flags"],
    "opportunities": ["growth or collaboration opportunities"]
}`;
    }

    /**
     * Parse text response into structured format
     */
    parseTextResponse(text) {
        // Basic parsing logic for non-JSON responses
        return {
            profileType: this.extractValue(text, /profile\s*type[:\s]*([\w]+)/i) || 'unknown',
            engagementRate: this.extractValue(text, /engagement\s*rate[:\s]*([\d.]+%?)/i) || 'N/A',
            audienceQuality: this.extractValue(text, /audience\s*quality[:\s]*(high|medium|low)/i) || 'unknown',
            contentStrategy: this.extractValue(text, /content\s*strategy[:\s]*([^.]+)/i) || 'N/A',
            growthPotential: this.extractValue(text, /growth\s*potential[:\s]*(high|medium|low)/i) || 'unknown',
            authenticity: {
                score: parseInt(this.extractValue(text, /authenticity[:\s]*(\d+)/i) || '5'),
                indicators: []
            },
            recommendations: this.extractList(text, /recommendations?[:\s]*([^]+?)(?=\n\n|\z)/i),
            keyInsights: this.extractList(text, /insights?[:\s]*([^]+?)(?=\n\n|\z)/i),
            estimatedValue: {
                tier: this.extractValue(text, /tier[:\s]*(nano|micro|mid|macro|mega)/i) || 'unknown',
                monthlyValue: this.extractValue(text, /value[:\s]*\$?([\d,]+-[\d,]+)/i) || 'N/A'
            },
            risks: this.extractList(text, /risks?[:\s]*([^]+?)(?=\n\n|\z)/i),
            opportunities: this.extractList(text, /opportunities[:\s]*([^]+?)(?=\n\n|\z)/i)
        };
    }

    /**
     * Extract value from text using regex
     */
    extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Extract list from text
     */
    extractList(text, regex) {
        const match = text.match(regex);
        if (!match) return [];

        const listText = match[1];
        return listText
            .split(/[\n•\-\*]/)
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .slice(0, 5); // Limit to 5 items
    }

    /**
     * Check if error is quota related
     */
    isQuotaError(error) {
        const errorMessage = error.response?.data?.error?.message || error.message || '';
        return errorMessage.toLowerCase().includes('quota') ||
               errorMessage.toLowerCase().includes('limit exceeded') ||
               errorMessage.toLowerCase().includes('insufficient') ||
               error.response?.status === 429;
    }

    /**
     * Check if error is rate limit related
     */
    isRateLimitError(error) {
        return error.response?.status === 429 ||
               (error.response?.data?.error?.message || '').toLowerCase().includes('rate limit');
    }

    /**
     * Get current model status
     */
    getModelStatus() {
        const status = [];
        for (const model of this.models) {
            const usage = this.usageTracker.get(model.name) || { calls: 0, errors: 0 };
            status.push({
                name: model.name,
                available: usage.errors < 5, // Consider unavailable after 5 consecutive errors
                calls: usage.calls,
                errors: usage.errors
            });
        }
        return status;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.analysisCache.clear();
        logger.info('Analysis cache cleared');
    }
}

module.exports = new AIAnalysisService();