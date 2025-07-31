const logger = require('../utils/logger');
const apifyService = require('./apifyService');
const relatedProfilesService = require('./relatedProfilesService');
const depthProcessingService = require('./depthProcessingService');
const depthProgressService = require('./depthProgressService');
const RootProfileScraped = require('../models/RootProfileScraped');
const Session = require('../models/Session');

class BatchProcessingService {
    constructor() {
        this.defaultBatchSize = parseInt(process.env.BATCH_SIZE) || 5;
        this.batchDelay = 0; // Removed rate limiting delay
        this.maxConcurrentRequests = parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 3;
    }

    /**
     * Process multiple root profiles in batches
     * @param {string} sessionId - Session ID
     * @param {Array} profileUrls - Array of Instagram profile URLs
     * @param {Object} options - Processing options
     */
    async processRootProfilesBatch(sessionId, profileUrls, options = {}) {
        const startTime = Date.now();
        const batchSize = options.batchSize || this.defaultBatchSize;
        
        logger.info(`Starting batch processing for session ${sessionId}`, {
            totalProfiles: profileUrls.length,
            batchSize,
            maxConcurrentRequests: this.maxConcurrentRequests
        });

        const session = await Session.findById(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Initialize session statistics
        await session.updateStats({
            totalProfiles: profileUrls.length,
            scrapedProfiles: 0,
            currentDepth: 0
        });

        // Initialize depth 0 progress
        await depthProgressService.initializeDepthProgress(sessionId, 0);

        const results = {
            successful: [],
            failed: [],
            skipped: [],
            totalProcessed: 0,
            totalTime: 0
        };

        try {
            // Process profiles in batches
            for (let i = 0; i < profileUrls.length; i += batchSize) {
                const batchStartTime = Date.now();
                const batch = profileUrls.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(profileUrls.length / batchSize);

                logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
                    sessionId,
                    batchSize: batch.length,
                    progress: `${i}/${profileUrls.length}`
                });

                // Check for existing profiles in database
                const { toProcess, skipped } = await this.checkExistingProfiles(sessionId, batch);
                results.skipped.push(...skipped);

                let batchResults = { successful: [], failed: [] };
                if (toProcess.length > 0) {
                    // Process batch with concurrency control
                    batchResults = await this.processBatchWithConcurrency(
                        sessionId,
                        toProcess,
                        this.maxConcurrentRequests
                    );

                    results.successful.push(...batchResults.successful);
                    results.failed.push(...batchResults.failed);
                }

                // Update session progress
                const processedCount = results.successful.length + results.failed.length + results.skipped.length;
                await session.incrementScrapedProfiles(toProcess.length);

                const batchTime = Date.now() - batchStartTime;
                logger.info(`Batch ${batchNumber} completed`, {
                    sessionId,
                    batchTime: `${batchTime}ms`,
                    successful: batchResults.successful.length,
                    failed: batchResults.failed.length,
                    skipped: skipped.length,
                    totalProgress: `${processedCount}/${profileUrls.length}`
                });

                // Delay removed - no rate limiting
            }

            // Update final session status
            results.totalTime = Date.now() - startTime;
            results.totalProcessed = results.successful.length + results.failed.length + results.skipped.length;

            // Extract related profiles from successfully scraped root profiles
            if (results.successful.length > 0 && options.extractRelated !== false) {
                logger.info('Starting related profiles extraction...');
                try {
                    const extractionResults = await relatedProfilesService.extractRelatedProfiles(
                        sessionId,
                        session.config.maxDepth || 2
                    );
                    
                    results.relatedProfiles = extractionResults;
                    logger.info('Related profiles extraction completed', extractionResults);
                    
                    // Start recursive depth processing if enabled
                    if (options.processDepths !== false && extractionResults.queuedForScraping > 0) {
                        logger.info('Starting recursive depth processing...');
                        
                        // Process depths asynchronously in background
                        depthProcessingService.processAllDepths(sessionId, {
                            maxDepth: session.config.maxDepth,
                            maxProfilesPerDepth: session.config.maxProfilesPerDepth
                        }).then(depthResults => {
                            logger.info('Depth processing completed', depthResults);
                        }).catch(error => {
                            logger.error('Depth processing failed:', error);
                        });
                        
                        results.depthProcessing = {
                            status: 'started',
                            message: 'Recursive depth processing started in background'
                        };
                    }
                } catch (extractionError) {
                    logger.error('Failed to extract related profiles:', extractionError);
                    results.relatedProfiles = { error: extractionError.message };
                }
            }

            // Update depth 0 progress to mark scraping as complete
            await depthProgressService.updateScrapingProgress(sessionId, 0);
            
            // Mark depth 0 as having no analysis needed
            await session.updateDepthProgress(0, {
                isAnalysisComplete: true,
                completedAt: new Date()
            });
            
            // Check if this completes the session (only if maxDepth is 0)
            if (session.config.maxDepth === 0) {
                await depthProgressService.checkDepthCompletion(sessionId, 0);
            }

            logger.info(`Batch processing completed for session ${sessionId}`, {
                totalTime: `${results.totalTime}ms`,
                successful: results.successful.length,
                failed: results.failed.length,
                skipped: results.skipped.length,
                totalProcessed: results.totalProcessed,
                relatedProfilesQueued: results.relatedProfiles?.queuedForScraping || 0
            });

            return results;

        } catch (error) {
            logger.error(`Batch processing failed for session ${sessionId}`, error);
            await session.fail(error.message);
            throw error;
        }
    }

    /**
     * Check which profiles already exist in the database
     */
    async checkExistingProfiles(sessionId, profileUrls) {
        const toProcess = [];
        const skipped = [];

        for (const profileUrl of profileUrls) {
            const username = this.extractUsernameFromUrl(profileUrl);
            
            try {
                const existingProfile = await RootProfileScraped.findOne({
                    sessionId,
                    username: username.toLowerCase(),
                    status: { $in: ['scraped', 'analyzed'] }
                });

                if (existingProfile) {
                    logger.info(`Skipping already scraped profile: ${username}`);
                    skipped.push({
                        url: profileUrl,
                        username,
                        reason: 'already_scraped',
                        scrapedAt: existingProfile.scrapedAt
                    });
                } else {
                    toProcess.push(profileUrl);
                }
            } catch (error) {
                logger.error(`Error checking existing profile ${username}:`, error);
                toProcess.push(profileUrl); // Process it anyway
            }
        }

        return { toProcess, skipped };
    }

    /**
     * Process a batch with concurrency control
     */
    async processBatchWithConcurrency(sessionId, profileUrls, maxConcurrent) {
        const results = {
            successful: [],
            failed: []
        };

        try {
            // Use batch scraping for up to 10 profiles at a time
            const batchSize = 10;
            
            for (let i = 0; i < profileUrls.length; i += batchSize) {
                const batch = profileUrls.slice(i, i + batchSize);
                
                logger.info(`Processing batch of ${batch.length} profiles using batch scraping`);
                
                // Use the new batch scraping method
                const batchResults = await apifyService.scrapeBatch(
                    batch,
                    true, // These are root profiles
                    sessionId
                );

                // Process successful results
                for (const successResult of batchResults.successful) {
                    results.successful.push({
                        url: successResult.url,
                        profile: successResult.profile,
                        timestamp: new Date()
                    });
                }

                // Process failed results
                for (const failedResult of batchResults.failed) {
                    results.failed.push({
                        url: failedResult.url,
                        error: failedResult.error,
                        timestamp: new Date()
                    });
                }
            }
        } catch (error) {
            logger.error('Batch processing with new method failed, falling back to individual processing:', error);
            
            // Fallback to original chunk-based processing
            const chunks = [];
            for (let i = 0; i < profileUrls.length; i += maxConcurrent) {
                chunks.push(profileUrls.slice(i, i + maxConcurrent));
            }

            for (const chunk of chunks) {
                const chunkPromises = chunk.map(profileUrl => 
                    this.processProfileWithRetry(sessionId, profileUrl)
                );

                const chunkResults = await Promise.allSettled(chunkPromises);

                chunkResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.successful.push({
                            url: chunk[index],
                            profile: result.value,
                            timestamp: new Date()
                        });
                    } else {
                        results.failed.push({
                            url: chunk[index],
                            error: result.reason.message || 'Unknown error',
                            timestamp: new Date()
                        });
                    }
                });
            }
        }

        return results;
    }

    /**
     * Process a single profile with retry logic
     */
    async processProfileWithRetry(sessionId, profileUrl, maxRetries = 2) {
        const username = this.extractUsernameFromUrl(profileUrl);
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`Processing profile ${username} (attempt ${attempt + 1}/${maxRetries + 1})`);
                
                // First, create or update the profile record
                let rootProfile = await RootProfileScraped.findOne({
                    sessionId,
                    username: username.toLowerCase()
                });

                if (!rootProfile) {
                    rootProfile = new RootProfileScraped({
                        sessionId,
                        username: username.toLowerCase(),
                        profileUrl,
                        depth: 0,
                        status: 'pending'
                    });
                    await rootProfile.save();
                }

                // Scrape the profile using Apify
                const scrapedProfile = await apifyService.scrapeProfile(
                    profileUrl,
                    true,
                    sessionId
                );

                logger.info(`Successfully processed profile: ${username}`);
                return scrapedProfile;

            } catch (error) {
                lastError = error;
                logger.warn(`Attempt ${attempt + 1} failed for profile ${username}:`, error.message);
                
                // Retry delay removed - no rate limiting
            }
        }

        // Mark profile as failed
        try {
            const failedProfile = await RootProfileScraped.findOne({
                sessionId,
                username: username.toLowerCase()
            });
            
            if (failedProfile) {
                await failedProfile.markAsFailed(lastError);
            }
        } catch (dbError) {
            logger.error(`Failed to update profile status for ${username}:`, dbError);
        }

        throw lastError;
    }

    /**
     * Extract username from Instagram URL
     */
    extractUsernameFromUrl(url) {
        const match = url.match(/instagram\.com\/([^\/\?]+)/);
        return match ? match[1] : '';
    }

    /**
     * Helper function to delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get batch processing status for a session
     */
    async getBatchStatus(sessionId) {
        const stats = await RootProfileScraped.getSessionStats(sessionId);
        const session = await Session.findById(sessionId);

        const statusMap = {};
        stats.forEach(stat => {
            statusMap[stat._id] = stat.count;
        });

        return {
            sessionId,
            sessionStatus: session?.status,
            profiles: {
                total: session?.stats.totalProfiles || 0,
                scraped: statusMap.scraped || 0,
                analyzed: statusMap.analyzed || 0,
                failed: statusMap.failed || 0,
                pending: statusMap.pending || 0
            },
            progress: session?.progressPercentage || 0,
            duration: session?.duration,
            startedAt: session?.stats.startedAt,
            completedAt: session?.stats.completedAt
        };
    }
}

module.exports = new BatchProcessingService();