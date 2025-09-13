const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const AnalyzedRelatedProfile = require('../models/AnalyzedRelatedProfile');
const { getApifyBatchSizeForDepth } = require('../utils/batchSizeCalculator');
const axios = require('axios');
const aiAnalysisService = require('./aiAnalysisService');

class ApifyService {
    constructor() {
        this.client = new ApifyClient({
            token: process.env.APIFY_API_TOKEN,
        });
        this.actorId = 'shu8hvrXbJbY3Eb9W';
        this.maxRetries = 3;
        this.retryDelay = 0; // Removed rate limiting delay
    }

    async scrapeProfile(profileUrl, isRootProfile = true, sessionId = null, options = {}) {
        const defaultOptions = {
            resultsLimit: 50,
            resultsType: 'details',
            searchLimit: 200,
            searchType: 'user',
            addParentData: false,
            enhanceUserSearchWithFacebookPage: false,
            isUserReelFeedURL: false,
            isUserTaggedFeedURL: false,
            extendOutputFunction: '', // This ensures all available data is collected
            extendScraperFunction: '', // This ensures deeper scraping
            includeContactInfo: true  // Explicitly request contact information including email
        };

        const input = {
            ...defaultOptions,
            ...options,
            directUrls: [profileUrl]
        };

        let attempt = 0;
        let lastError = null;

        while (attempt < this.maxRetries) {
            try {
                logger.info(`Scraping profile: ${profileUrl} (Attempt ${attempt + 1}/${this.maxRetries})`);
                
                const run = await this.client.actor(this.actorId).call(input);
                
                const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
                
                if (!items || items.length === 0) {
                    throw new Error('No data received from Apify');
                }

                const scrapedData = items[0];
                const processedData = this.parseProfileData(scrapedData, profileUrl);

                const savedProfile = await this.saveProfile(processedData, isRootProfile, sessionId, options);

                // Trigger AI analysis after successful scraping
                if (savedProfile && processedData.rawData) {
                    this.triggerAIAnalysis(savedProfile, processedData.rawData, sessionId);
                }

                logger.info(`Successfully scraped and saved profile: ${profileUrl}`);
                return savedProfile;

            } catch (error) {
                lastError = error;
                attempt++;
                
                if (attempt < this.maxRetries) {
                    logger.warn(`Scraping attempt ${attempt} failed for ${profileUrl}, retrying in ${this.retryDelay}ms...`, error);
                    // Retry delay removed - no rate limiting
                } else {
                    logger.error(`All scraping attempts failed for ${profileUrl}`, error);
                }
            }
        }

        throw new Error(`Failed to scrape profile after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    parseProfileData(rawData, profileUrl) {
        try {
            const username = this.extractUsernameFromUrl(profileUrl);
            
            return {
                username: rawData.username || username,
                fullName: rawData.fullName || rawData.full_name || '',
                biography: rawData.biography || rawData.bio || '',
                profilePicUrl: rawData.profilePicUrl || rawData.profile_pic_url || '',
                isVerified: rawData.isVerified || rawData.is_verified || false,
                isPrivate: rawData.isPrivate || rawData.is_private || false,
                postsCount: rawData.postsCount || rawData.media_count || 0,
                followersCount: rawData.followersCount || rawData.follower_count || 0,
                followingCount: rawData.followingCount || rawData.following_count || 0,
                externalUrl: rawData.externalUrl || rawData.external_url || '',
                businessCategoryName: rawData.businessCategoryName || rawData.business_category_name || '',
                categoryEnum: rawData.categoryEnum || rawData.category_enum || '',
                isBusinessAccount: rawData.isBusinessAccount || rawData.is_business_account || false,
                joinedDate: rawData.joinedDate || null,
                profileUrl: profileUrl,
                rawData: rawData,
                scrapedAt: new Date()
            };
        } catch (error) {
            logger.error('Error parsing profile data:', error);
            throw new Error(`Failed to parse profile data: ${error.message}`);
        }
    }

    async saveProfile(profileData, isRootProfile, sessionId = null, options = {}) {
        try {
            if (isRootProfile && !sessionId) {
                throw new Error('sessionId is required for root profiles');
            }
            
            const Model = isRootProfile ? RootProfileScraped : RelatedProfileScraped;
            let savedProfile;
            
            if (isRootProfile) {
                const existingProfile = await Model.findOne({ 
                    username: profileData.username,
                    sessionId: sessionId 
                });
                
                if (existingProfile) {
                    savedProfile = await existingProfile.markAsScraped(profileData.rawData, {
                        apifyRunId: profileData.rawData.id || 'unknown',
                        processingTime: (Date.now() - profileData.scrapedAt.getTime()) / 1000
                    });
                } else {
                    const newProfile = new Model({
                        sessionId: sessionId,
                        username: profileData.username,
                        profileUrl: profileData.profileUrl,
                        depth: 0,
                        status: 'pending'
                    });
                    
                    savedProfile = await newProfile.markAsScraped(profileData.rawData, {
                        apifyRunId: profileData.rawData.id || 'unknown',
                        processingTime: (Date.now() - profileData.scrapedAt.getTime()) / 1000
                    });
                }

                // Trigger analysis webhook for root profiles
                await this.triggerAnalysisWebhook(profileData.username);

                return savedProfile;
            } else {
                // For related profiles, we need additional fields
                if (!options.depth || !options.parentUsername || !options.parentProfileUrl) {
                    throw new Error('Related profiles require depth, parentUsername, and parentProfileUrl');
                }
                
                const existingProfile = await Model.findOne({ 
                    username: profileData.username,
                    sessionId: sessionId 
                });
                
                if (existingProfile) {
                    return await existingProfile.markAsScraped(profileData.rawData, {
                        apifyRunId: profileData.rawData.id || 'unknown',
                        processingTime: (Date.now() - profileData.scrapedAt.getTime()) / 1000,
                        discoveredFrom: options.discoveredFrom || 'relatedProfiles'
                    });
                    logger.info(`Updated existing related profile: ${profileData.username}`);
                } else {
                    const newProfile = new Model({
                        sessionId: sessionId,
                        username: profileData.username,
                        profileUrl: profileData.profileUrl,
                        depth: options.depth,
                        parentUsername: options.parentUsername,
                        parentProfileUrl: options.parentProfileUrl,
                        status: 'pending'
                    });
                    
                    return await newProfile.markAsScraped(profileData.rawData, {
                        apifyRunId: profileData.rawData.id || 'unknown',
                        processingTime: (Date.now() - profileData.scrapedAt.getTime()) / 1000,
                        discoveredFrom: options.discoveredFrom || 'relatedProfiles'
                    });
                    logger.info(`Created new related profile: ${profileData.username}`);
                }
            }
        } catch (error) {
            logger.error('Error saving profile to database:', error);
            throw new Error(`Failed to save profile: ${error.message}`);
        }
    }

    extractUsernameFromUrl(url) {
        const match = url.match(/instagram\.com\/([^\/\?]+)/);
        return match ? match[1] : '';
    }
    
    /**
     * Trigger AI analysis for the scraped profile
     * @param {Object} savedProfile - The saved profile document
     * @param {Object} profileData - The raw profile data from Apify
     * @param {string} sessionId - The session ID
     */
    async triggerAIAnalysis(savedProfile, profileData, sessionId) {
        try {
            logger.info(`Starting AI analysis for profile: ${savedProfile.username}`);

            // Check if analysis already exists
            const existingAnalysis = await AnalyzedRelatedProfile.findOne({
                sourceProfileId: savedProfile._id,
                sessionId: sessionId
            });

            if (existingAnalysis) {
                logger.info(`Analysis already exists for ${savedProfile.username}, skipping`);
                return existingAnalysis;
            }

            // Perform AI analysis
            const aiResult = await aiAnalysisService.analyzeProfile(profileData, {
                forceRefresh: false
            });

            // Prepare analysis data
            const analysisData = {
                ...aiResult.analysis,
                modelUsed: aiResult.modelUsed,
                fromCache: aiResult.fromCache,
                processingTime: aiResult.processingTime,
                analyzedAt: new Date()
            };

            // Save analysis to database
            const analyzedProfile = new AnalyzedRelatedProfile({
                sourceProfileId: savedProfile._id,
                sourceCollection: savedProfile.constructor.modelName,
                sessionId: sessionId,
                username: savedProfile.username,
                profileUrl: savedProfile.profileUrl,
                depth: savedProfile.depth || 0,
                analysisData: analysisData,
                analysisStatus: 'completed'
            });

            await analyzedProfile.save();

            // Update the profile status to analyzed
            if (savedProfile.markAsAnalyzed) {
                await savedProfile.markAsAnalyzed();
            }

            logger.info(`AI analysis completed and saved for ${savedProfile.username} using ${aiResult.modelUsed}`);
            return analyzedProfile;

        } catch (error) {
            logger.error(`AI analysis failed for ${savedProfile.username}:`, error.message);

            // Save failed analysis record
            try {
                const failedAnalysis = new AnalyzedRelatedProfile({
                    sourceProfileId: savedProfile._id,
                    sourceCollection: savedProfile.constructor.modelName,
                    sessionId: sessionId,
                    username: savedProfile.username,
                    profileUrl: savedProfile.profileUrl,
                    depth: savedProfile.depth || 0,
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

            // Don't throw - let scraping continue even if analysis fails
            return null;
        }
    }

    /**
     * Legacy webhook method (kept for backward compatibility)
     * @param {string} username - Instagram username
     */
    async triggerAnalysisWebhook(username) {
        try {
            // Get analysis backend URL from environment or use default
            const analysisBackendUrl = process.env.ANALYSIS_BACKEND_URL || 'http://localhost:5001';
            const webhookUrl = `${analysisBackendUrl}/api/analyze/webhook`;

            logger.info(`Triggering analysis webhook for ${username}`);

            const response = await axios.post(webhookUrl, {
                username: username,
                action: 'new_profile_scraped'
            }, {
                timeout: 5000 // 5 second timeout
            });

            logger.info(`Analysis webhook triggered successfully for ${username}: ${response.data.status}`);

        } catch (error) {
            // Don't throw error - analysis will be caught by backup monitor
            logger.warn(`Failed to trigger analysis webhook for ${username}: ${error.message}`);
            logger.warn('Profile will be analyzed by backup monitor within 5 minutes');
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async scrapeMultipleProfiles(profileUrls, isRootProfile = true, sessionId = null, options = {}) {
        const results = {
            successful: [],
            failed: []
        };

        for (const profileUrl of profileUrls) {
            try {
                const profile = await this.scrapeProfile(profileUrl, isRootProfile, sessionId, options);
                results.successful.push({
                    url: profileUrl,
                    profile: profile
                });
            } catch (error) {
                results.failed.push({
                    url: profileUrl,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Scrape multiple profiles in a single Apify batch
     * @param {Array} profileUrls - Array of Instagram profile URLs
     * @param {boolean} isRootProfile - Whether these are root profiles
     * @param {string} sessionId - Session ID
     * @param {Object} options - Additional options including depth
     * @returns {Object} Results with successful and failed profiles
     */
    async scrapeBatch(profileUrls, isRootProfile = true, sessionId = null, options = {}) {
        // Get appropriate batch size based on depth
        const depth = options.depth || 0;
        const maxBatchSize = getApifyBatchSizeForDepth(depth);
        
        // If we have more URLs than max batch size, process in chunks
        if (profileUrls.length > maxBatchSize) {
            logger.info(`Splitting ${profileUrls.length} profiles into batches of ${maxBatchSize} for depth ${depth}`);
            
            const allResults = {
                successful: [],
                failed: []
            };
            
            // Process in chunks
            for (let i = 0; i < profileUrls.length; i += maxBatchSize) {
                const chunk = profileUrls.slice(i, i + maxBatchSize);
                const chunkResults = await this._scrapeBatchChunk(chunk, isRootProfile, sessionId, options);
                
                allResults.successful.push(...chunkResults.successful);
                allResults.failed.push(...chunkResults.failed);
            }
            
            return allResults;
        }
        
        // Process normally if within batch size
        return this._scrapeBatchChunk(profileUrls, isRootProfile, sessionId, options);
    }
    
    async _scrapeBatchChunk(profileUrls, isRootProfile = true, sessionId = null, options = {}) {
        const defaultOptions = {
            resultsLimit: 50,
            resultsType: 'details',
            searchLimit: 200,
            searchType: 'user',
            addParentData: false,
            enhanceUserSearchWithFacebookPage: false,
            isUserReelFeedURL: false,
            isUserTaggedFeedURL: false,
            extendOutputFunction: '', // This ensures all available data is collected
            extendScraperFunction: '', // This ensures deeper scraping
            includeContactInfo: true  // Explicitly request contact information including email
        };

        const input = {
            ...defaultOptions,
            ...options,
            directUrls: profileUrls // Pass all URLs at once
        };

        let attempt = 0;
        let lastError = null;

        while (attempt < this.maxRetries) {
            try {
                logger.info(`Scraping batch of ${profileUrls.length} profiles (Attempt ${attempt + 1}/${this.maxRetries})`);
                
                const run = await this.client.actor(this.actorId).call(input);
                
                const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
                
                if (!items || items.length === 0) {
                    throw new Error('No data received from Apify');
                }

                const results = {
                    successful: [],
                    failed: []
                };

                // Create a map of URLs to items for quick lookup
                const urlToItem = new Map();
                items.forEach(item => {
                    const username = item.username || this.extractUsernameFromUrl(item.url || '');
                    const url = profileUrls.find(u => u.includes(username));
                    if (url) {
                        urlToItem.set(url, item);
                    }
                });

                // Process each URL
                for (const profileUrl of profileUrls) {
                    try {
                        const scrapedData = urlToItem.get(profileUrl);
                        
                        if (!scrapedData) {
                            throw new Error('No data found for this profile');
                        }

                        // For batch processing, return raw data structure
                        results.successful.push({
                            url: profileUrl,
                            profile: {
                                username: scrapedData.username || this.extractUsernameFromUrl(profileUrl),
                                profileUrl: profileUrl,
                                profileData: scrapedData,
                                scrapedAt: new Date()
                            }
                        });
                    } catch (error) {
                        results.failed.push({
                            url: profileUrl,
                            error: error.message
                        });
                    }
                }

                logger.info(`Batch scraping completed: ${results.successful.length} successful, ${results.failed.length} failed`);
                return results;

            } catch (error) {
                lastError = error;
                attempt++;
                
                if (attempt < this.maxRetries) {
                    logger.warn(`Batch scraping attempt ${attempt} failed, retrying...`, error);
                } else {
                    logger.error(`All batch scraping attempts failed`, error);
                }
            }
        }

        // If all batch attempts fail, fall back to individual scraping
        logger.warn('Batch scraping failed, falling back to individual scraping');
        return this.scrapeMultipleProfiles(profileUrls, isRootProfile, sessionId, options);
    }
}

module.exports = new ApifyService();