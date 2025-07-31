const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Session = require('../models/Session');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const apifyService = require('./apifyService');
const relatedProfilesService = require('./relatedProfilesService');
const depthProgressService = require('./depthProgressService');

class DepthProcessingService {
    constructor() {
        this.batchSize = parseInt(process.env.DEPTH_BATCH_SIZE) || 10;
        this.batchDelay = 0; // Removed rate limiting delay
        this.maxConcurrent = parseInt(process.env.DEPTH_MAX_CONCURRENT) || 3;
    }

    /**
     * Process all depths recursively for a session
     * @param {string} sessionId - Session ID
     * @param {Object} options - Processing options
     */
    async processAllDepths(sessionId, options = {}) {
        const startTime = Date.now();
        logger.info(`Starting recursive depth processing for session ${sessionId}`);

        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const maxDepth = options.maxDepth || session.config.maxDepth || 2;
            const maxProfilesPerDepth = options.maxProfilesPerDepth || session.config.maxProfilesPerDepth || 100;

            const results = {
                depths: {},
                totalProcessed: 0,
                totalTime: 0,
                currentDepth: 0
            };

            // Update session to running if not already
            if (session.status === 'pending') {
                await session.start();
            }

            // Process each depth level
            for (let depth = 1; depth <= maxDepth; depth++) {
                logger.info(`Processing depth ${depth} of ${maxDepth}`);
                
                // Update current depth in session
                await session.updateStats({ currentDepth: depth });

                const depthResults = await this.processDepthLevel(
                    sessionId,
                    depth,
                    maxProfilesPerDepth,
                    options
                );

                results.depths[depth] = depthResults;
                results.totalProcessed += depthResults.processed;
                results.currentDepth = depth;

                // Check if we should continue to next depth
                if (depthResults.processed === 0) {
                    logger.info(`No profiles to process at depth ${depth}, stopping depth processing`);
                    break;
                }

                // Extract related profiles for next depth if not at max depth
                if (depth < maxDepth && depthResults.successful > 0) {
                    logger.info(`Extracting related profiles for depth ${depth + 1}`);
                    
                    const extractionResults = await this.extractRelatedProfilesForDepth(
                        sessionId,
                        depth,
                        maxProfilesPerDepth
                    );

                    logger.info(`Extracted ${extractionResults.queuedForScraping} profiles for depth ${depth + 1}`);
                    
                    // Initialize depth progress for next depth
                    if (extractionResults.queuedForScraping > 0) {
                        await session.updateDepthProgress(depth + 1, {
                            totalProfiles: extractionResults.queuedForScraping,
                            scrapedProfiles: 0,
                            analyzedProfiles: 0,
                            isScrapingComplete: false,
                            isAnalysisComplete: false,
                            startedAt: new Date()
                        });
                    }
                }
            }

            results.totalTime = Date.now() - startTime;

            // Update final session statistics
            const finalStats = await this.getDepthProcessingStats(sessionId);
            await session.updateStats({
                totalProfiles: finalStats.totalProfiles,
                scrapedProfiles: finalStats.scrapedProfiles,
                currentDepth: results.currentDepth
            });

            logger.info(`Depth processing completed for session ${sessionId}`, {
                totalTime: `${results.totalTime}ms`,
                totalProcessed: results.totalProcessed,
                depthsProcessed: Object.keys(results.depths).length
            });

            return results;

        } catch (error) {
            logger.error(`Depth processing failed for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Process a single depth level
     */
    async processDepthLevel(sessionId, depth, maxProfilesPerDepth, options = {}) {
        const startTime = Date.now();
        logger.info(`Processing profiles at depth ${depth}`);

        try {
            // Get pending profiles at this depth
            let pendingProfiles = await RelatedProfileScraped.find({
                sessionId,
                depth,
                status: 'pending'
            }).limit(maxProfilesPerDepth);

            const totalPending = pendingProfiles.length;
            logger.info(`Found ${totalPending} pending profiles at depth ${depth}`);

            const results = {
                depth,
                processed: 0,
                successful: 0,
                failed: 0,
                processingTime: 0
            };

            // Process in batches
            for (let i = 0; i < pendingProfiles.length; i += this.batchSize) {
                const batch = pendingProfiles.slice(i, i + this.batchSize);
                const batchNumber = Math.floor(i / this.batchSize) + 1;
                const totalBatches = Math.ceil(pendingProfiles.length / this.batchSize);

                logger.info(`Processing batch ${batchNumber}/${totalBatches} at depth ${depth}`);

                // Update session progress
                const session = await Session.findById(sessionId);
                const progress = Math.round(((results.processed + batch.length) / totalPending) * 100);
                await session.updateStats({
                    currentDepth: depth,
                    scrapedProfiles: session.stats.scrapedProfiles + results.processed
                });

                // Process batch
                const batchResults = await this.processBatch(batch, sessionId);
                results.processed += batchResults.processed;
                results.successful += batchResults.successful;
                results.failed += batchResults.failed;

                // Log batch completion
                logger.info(`Batch ${batchNumber} completed`, {
                    depth,
                    successful: batchResults.successful,
                    failed: batchResults.failed,
                    progress: `${results.processed}/${totalPending}`
                });

                // Delay removed - no rate limiting
            }

            results.processingTime = Date.now() - startTime;
            logger.info(`Depth ${depth} processing completed`, results);

            // Update depth progress to mark scraping as complete
            await depthProgressService.updateScrapingProgress(sessionId, depth);

            return results;

        } catch (error) {
            logger.error(`Failed to process depth level ${depth}:`, error);
            throw error;
        }
    }

    /**
     * Process a batch of profiles
     */
    async processBatch(profiles, sessionId) {
        const results = {
            processed: 0,
            successful: 0,
            failed: 0
        };

        try {
            // Extract profile URLs
            const profileUrls = profiles.map(p => p.profileUrl);
            
            // Prepare options for each profile
            const profileOptionsMap = new Map();
            profiles.forEach(profile => {
                profileOptionsMap.set(profile.profileUrl, {
                    depth: profile.depth,
                    parentUsername: profile.parentUsername,
                    parentProfileUrl: profile.parentProfileUrl
                });
            });

            logger.info(`Processing batch of ${profiles.length} profiles using batch scraping`);

            // Use batch scraping for the entire batch
            const batchResults = await apifyService.scrapeBatch(
                profileUrls,
                false, // Not root profiles
                sessionId,
                {} // Base options, individual options will be handled per profile
            );

            // Process successful results
            for (const successResult of batchResults.successful) {
                try {
                    const profile = profiles.find(p => p.profileUrl === successResult.url);
                    if (profile) {
                        profile.status = 'scraped';
                        profile.scrapedAt = new Date();
                        await profile.save();
                        results.successful++;
                    }
                } catch (error) {
                    logger.error(`Failed to update profile status for ${successResult.url}:`, error);
                    results.failed++;
                }
                results.processed++;
            }

            // Process failed results
            for (const failedResult of batchResults.failed) {
                try {
                    const profile = profiles.find(p => p.profileUrl === failedResult.url);
                    if (profile) {
                        profile.status = 'failed';
                        profile.error = {
                            message: failedResult.error,
                            timestamp: new Date()
                        };
                        await profile.save();
                    }
                } catch (error) {
                    logger.error(`Failed to update profile status for ${failedResult.url}:`, error);
                }
                results.failed++;
                results.processed++;
            }

            logger.info(`Batch processing completed: ${results.successful} successful, ${results.failed} failed`);

        } catch (error) {
            logger.error('Batch processing failed, falling back to individual processing:', error);
            
            // Fallback to individual processing if batch fails
            for (const profile of profiles) {
                try {
                    await this.processProfile(profile, sessionId);
                    results.successful++;
                } catch (err) {
                    results.failed++;
                    logger.error(`Failed to process ${profile.username}:`, err);
                }
                results.processed++;
            }
        }

        return results;
    }

    /**
     * Process a single profile
     */
    async processProfile(profile, sessionId) {
        try {
            logger.info(`Processing profile ${profile.username} at depth ${profile.depth}`);

            // Profile is already in 'pending' status, continue with scraping

            // Scrape the profile
            const scrapedData = await apifyService.scrapeProfile(
                profile.profileUrl,
                false, // Not a root profile
                sessionId,
                {
                    depth: profile.depth,
                    parentUsername: profile.parentUsername,
                    parentProfileUrl: profile.parentProfileUrl
                }
            );

            // Update profile status
            profile.status = 'scraped';
            profile.scrapedAt = new Date();
            await profile.save();

            return scrapedData;

        } catch (error) {
            // Mark as failed
            profile.status = 'failed';
            profile.error = {
                message: error.message,
                timestamp: new Date()
            };
            await profile.save();
            throw error;
        }
    }

    /**
     * Extract related profiles for the next depth level
     */
    async extractRelatedProfilesForDepth(sessionId, currentDepth, maxProfilesPerDepth) {
        try {
            // Get successfully scraped profiles at current depth
            const scrapedProfiles = await RelatedProfileScraped.find({
                sessionId,
                depth: currentDepth,
                status: 'scraped',
                'profileData.relatedProfiles': { $exists: true, $ne: [] }
            }).limit(maxProfilesPerDepth);

            const nextDepth = currentDepth + 1;
            const allNewProfiles = [];
            const profilesByUsername = new Map();

            // Extract related profiles from each scraped profile
            for (const profile of scrapedProfiles) {
                const relatedProfiles = profile.profileData?.relatedProfiles || [];
                const limitedProfiles = relatedProfiles.slice(0, 10); // Limit per parent

                for (const related of limitedProfiles) {
                    if (related.username) {
                        const profileData = {
                            username: related.username.toLowerCase(),
                            fullName: related.full_name || '',
                            isPrivate: related.is_private || false,
                            isVerified: related.is_verified || false,
                            profilePicUrl: related.profile_pic_url || '',
                            instagramId: related.id || '',
                            parentUsername: profile.username,
                            parentProfileUrl: profile.profileUrl,
                            depth: nextDepth,
                            sessionId
                        };

                        if (!profilesByUsername.has(profileData.username)) {
                            profilesByUsername.set(profileData.username, profileData);
                            allNewProfiles.push(profileData);
                        }
                    }
                }
            }

            // Check for existing profiles
            const usernames = Array.from(profilesByUsername.keys());
            const existing = await RelatedProfileScraped.find({
                sessionId,
                username: { $in: usernames }
            }).select('username');

            const existingSet = new Set(existing.map(p => p.username));
            const newProfiles = allNewProfiles.filter(p => !existingSet.has(p.username));

            // Limit to maxProfilesPerDepth
            const limitedNewProfiles = newProfiles.slice(0, maxProfilesPerDepth);

            // Queue new profiles
            const queuedProfiles = await relatedProfilesService.queueProfilesForScraping(
                limitedNewProfiles,
                nextDepth + 1 // Max depth check
            );

            return {
                totalExtracted: allNewProfiles.length,
                alreadyInDatabase: existingSet.size,
                queuedForScraping: queuedProfiles.length,
                limitApplied: newProfiles.length > maxProfilesPerDepth
            };

        } catch (error) {
            logger.error(`Failed to extract related profiles for depth ${currentDepth + 1}:`, error);
            throw error;
        }
    }

    /**
     * Get depth processing statistics
     */
    async getDepthProcessingStats(sessionId) {
        const stats = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
            {
                $group: {
                    _id: {
                        depth: '$depth',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: null,
                    totalProfiles: { $sum: '$count' },
                    byDepthStatus: {
                        $push: {
                            depth: '$_id.depth',
                            status: '$_id.status',
                            count: '$count'
                        }
                    }
                }
            }
        ]);

        const result = stats[0] || { totalProfiles: 0, byDepthStatus: [] };
        
        // Calculate scraped profiles
        const scrapedProfiles = result.byDepthStatus
            .filter(item => item.status === 'scraped')
            .reduce((sum, item) => sum + item.count, 0);

        return {
            totalProfiles: result.totalProfiles,
            scrapedProfiles,
            byDepthStatus: result.byDepthStatus
        };
    }

    /**
     * Get current depth processing status
     */
    async getDepthStatus(sessionId) {
        const session = await Session.findById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const depthStats = await RelatedProfileScraped.aggregate([
            { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
            {
                $group: {
                    _id: {
                        depth: '$depth',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.depth',
                    statuses: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    },
                    total: { $sum: '$count' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        return {
            sessionId,
            sessionStatus: session.status,
            currentDepth: session.stats.currentDepth || 0,
            maxDepth: session.config.maxDepth,
            maxProfilesPerDepth: session.config.maxProfilesPerDepth,
            depthStatistics: depthStats,
            progress: session.progressPercentage
        };
    }

    /**
     * Helper function to delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new DepthProcessingService();