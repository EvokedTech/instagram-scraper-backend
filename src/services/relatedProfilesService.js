const mongoose = require('mongoose');
const logger = require('../utils/logger');
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const apifyService = require('./apifyService');
const ProfileUrlHelper = require('../utils/profileUrlHelper');

class RelatedProfilesService {
    constructor() {
        this.batchDelay = 0; // Removed rate limiting delay
        this.maxRelatedPerProfile = parseInt(process.env.MAX_RELATED_PER_PROFILE) || 50;
    }

    /**
     * Extract related profiles from scraped root profiles
     * @param {string} sessionId - Session ID
     * @param {number} maxDepth - Maximum depth for scraping
     * @returns {Object} Extraction results
     */
    async extractRelatedProfiles(sessionId, maxDepth = 2) {
        const startTime = Date.now();
        logger.info(`Starting related profiles extraction for session ${sessionId}`);

        try {
            // Get all scraped root profiles for the session
            const rootProfiles = await RootProfileScraped.find({
                sessionId,
                status: 'scraped',
                'profileData.relatedProfiles': { $exists: true, $ne: [] }
            });

            if (rootProfiles.length === 0) {
                logger.info('No root profiles with related profiles found');
                return {
                    totalExtracted: 0,
                    uniqueProfiles: 0,
                    duplicatesRemoved: 0,
                    alreadyInDatabase: 0,
                    queuedForScraping: 0,
                    profiles: []
                };
            }

            // Extract all related profiles
            const allRelatedProfiles = [];
            const profilesByUsername = new Map();

            for (const rootProfile of rootProfiles) {
                const relatedProfiles = rootProfile.profileData.relatedProfiles || [];
                const limitedProfiles = relatedProfiles.slice(0, this.maxRelatedPerProfile);

                for (const related of limitedProfiles) {
                    if (related.username) {
                        const profileData = {
                            username: related.username.toLowerCase(),
                            fullName: related.full_name || related.fullName || '',
                            isPrivate: related.is_private || related.isPrivate || false,
                            isVerified: related.is_verified || related.isVerified || false,
                            profilePicUrl: related.profile_pic_url || related.profilePicUrl || '',
                            instagramId: related.id || '',
                            parentUsername: rootProfile.username,
                            parentProfileUrl: rootProfile.profileUrl,
                            depth: 1, // Related profiles from root are at depth 1
                            sessionId
                        };

                        // Deduplicate within the batch
                        if (!profilesByUsername.has(profileData.username)) {
                            profilesByUsername.set(profileData.username, profileData);
                            allRelatedProfiles.push(profileData);
                        }
                    }
                }
            }

            const totalExtracted = allRelatedProfiles.length;
            const uniqueProfiles = profilesByUsername.size;
            const duplicatesRemoved = totalExtracted - uniqueProfiles;

            logger.info(`Extracted ${totalExtracted} related profiles, ${uniqueProfiles} unique`);

            // Convert usernames to profile URLs for batch checking
            const usernamesToCheck = Array.from(profilesByUsername.keys());
            const profileUrls = ProfileUrlHelper.bulkUsernamesToUrls(usernamesToCheck);
            
            // Check database for existing profiles using profileUrl
            const existingProfiles = await RelatedProfileScraped.find({
                sessionId,
                profileUrl: { $in: profileUrls }
            }).select('profileUrl username');

            // Separate existing vs new profiles
            const separationResult = ProfileUrlHelper.separateExistingAndNew(profileUrls, existingProfiles);
            const alreadyInDatabase = separationResult.stats.existing;

            // Get usernames for new profile URLs
            const newProfileUrls = new Set(separationResult.notExists);
            const newProfiles = Array.from(profilesByUsername.values())
                .filter(profile => {
                    const profileUrl = ProfileUrlHelper.usernameToUrl(profile.username);
                    return newProfileUrls.has(profileUrl);
                });

            logger.info(`Found ${alreadyInDatabase} profiles already in database, ${newProfiles.length} new profiles to queue`);

            // Queue new profiles for scraping
            const queuedProfiles = await this.queueProfilesForScraping(newProfiles, maxDepth);

            const endTime = Date.now();
            const results = {
                totalExtracted,
                uniqueProfiles,
                duplicatesRemoved,
                alreadyInDatabase,
                queuedForScraping: queuedProfiles.length,
                processingTime: endTime - startTime,
                profiles: queuedProfiles
            };

            logger.info('Related profiles extraction completed', {
                sessionId,
                ...results
            });

            return results;

        } catch (error) {
            logger.error(`Failed to extract related profiles for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Queue profiles for scraping
     * @param {Array} profiles - Array of profile data
     * @param {number} maxDepth - Maximum depth for scraping
     * @returns {Array} Queued profiles
     */
    async queueProfilesForScraping(profiles, maxDepth) {
        const queuedProfiles = [];

        try {
            // Create RelatedProfileScraped documents for new profiles
            for (const profile of profiles) {
                // Only queue if within depth limit
                if (profile.depth <= maxDepth) {
                    const profileUrl = this.convertUsernameToUrl(profile.username);
                    
                    const relatedProfile = new RelatedProfileScraped({
                        sessionId: profile.sessionId,
                        username: profile.username,
                        profileUrl,
                        depth: profile.depth,
                        parentUsername: profile.parentUsername,
                        parentProfileUrl: profile.parentProfileUrl,
                        status: 'pending',
                        profileData: {
                            fullName: profile.fullName,
                            isPrivate: profile.isPrivate,
                            isVerified: profile.isVerified,
                            profilePicUrl: profile.profilePicUrl,
                            instagramId: profile.instagramId
                        }
                    });

                    await relatedProfile.save();
                    queuedProfiles.push({
                        username: profile.username,
                        profileUrl,
                        depth: profile.depth,
                        parentUsername: profile.parentUsername
                    });
                }
            }

            logger.info(`Queued ${queuedProfiles.length} profiles for scraping`);
            return queuedProfiles;

        } catch (error) {
            logger.error('Error queueing profiles for scraping:', error);
            throw error;
        }
    }

    /**
     * Process related profiles in batches
     * @param {string} sessionId - Session ID
     * @param {number} depth - Current depth level
     * @param {Object} options - Processing options
     */
    async processRelatedProfilesBatch(sessionId, depth = 1, options = {}) {
        const batchSize = options.batchSize || 5;
        const maxConcurrent = options.maxConcurrentRequests || 3;

        logger.info(`Processing related profiles at depth ${depth} for session ${sessionId}`);

        try {
            // Get pending related profiles at the specified depth
            const pendingProfiles = await RelatedProfileScraped.find({
                sessionId,
                depth,
                status: 'pending'
            }).limit(batchSize * 10); // Get more than needed for better batching

            if (pendingProfiles.length === 0) {
                logger.info(`No pending profiles at depth ${depth}`);
                return {
                    processed: 0,
                    successful: 0,
                    failed: 0
                };
            }

            const results = {
                processed: 0,
                successful: 0,
                failed: 0
            };

            // Process in batches
            for (let i = 0; i < pendingProfiles.length; i += batchSize) {
                const batch = pendingProfiles.slice(i, i + batchSize);
                
                logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} with ${batch.length} profiles`);

                // Process batch with concurrency control
                const batchPromises = batch.map(profile => 
                    this.scrapeRelatedProfile(profile, sessionId)
                );

                const batchResults = await Promise.allSettled(batchPromises);

                batchResults.forEach((result, index) => {
                    results.processed++;
                    if (result.status === 'fulfilled') {
                        results.successful++;
                    } else {
                        results.failed++;
                        logger.error(`Failed to scrape ${batch[index].username}:`, result.reason);
                    }
                });

                // Delay removed - no rate limiting
            }

            logger.info(`Related profiles batch processing completed`, results);
            return results;

        } catch (error) {
            logger.error(`Failed to process related profiles batch:`, error);
            throw error;
        }
    }

    /**
     * Scrape a single related profile
     */
    async scrapeRelatedProfile(profile, sessionId) {
        try {
            logger.info(`Scraping related profile: ${profile.username}`);

            // Profile is already in 'pending' status, continue with scraping

            // Scrape using Apify
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

            // Update profile with scraped data
            profile.status = 'scraped';
            profile.scrapedAt = new Date();
            await profile.save();

            // Extract related profiles if depth allows
            if (profile.depth < 2 && scrapedData.profileData?.relatedProfiles?.length > 0) {
                await this.extractAndQueueNextLevel(
                    scrapedData.profileData.relatedProfiles,
                    profile,
                    sessionId
                );
            }

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
     * Extract and queue next level of related profiles
     */
    async extractAndQueueNextLevel(relatedProfiles, parentProfile, sessionId) {
        const nextDepth = parentProfile.depth + 1;
        const profiles = [];

        for (const related of relatedProfiles.slice(0, this.maxRelatedPerProfile)) {
            if (related.username) {
                profiles.push({
                    username: related.username.toLowerCase(),
                    fullName: related.full_name || '',
                    isPrivate: related.is_private || false,
                    isVerified: related.is_verified || false,
                    profilePicUrl: related.profile_pic_url || '',
                    instagramId: related.id || '',
                    parentUsername: parentProfile.username,
                    parentProfileUrl: parentProfile.profileUrl,
                    depth: nextDepth,
                    sessionId
                });
            }
        }

        // Convert usernames to URLs and check for existing profiles
        const usernames = profiles.map(p => p.username);
        const profileUrls = ProfileUrlHelper.bulkUsernamesToUrls(usernames);
        
        const existing = await RelatedProfileScraped.find({
            sessionId,
            profileUrl: { $in: profileUrls }
        }).select('profileUrl username');

        // Separate existing vs new profiles
        const separationResult = ProfileUrlHelper.separateExistingAndNew(profileUrls, existing);
        const newProfileUrls = new Set(separationResult.notExists);
        
        const newProfiles = profiles.filter(p => {
            const profileUrl = ProfileUrlHelper.usernameToUrl(p.username);
            return newProfileUrls.has(profileUrl);
        });

        if (newProfiles.length > 0) {
            await this.queueProfilesForScraping(newProfiles, 6); // Max depth of 6
            logger.info(`Queued ${newProfiles.length} profiles at depth ${nextDepth}`);
        }
    }

    /**
     * Convert username to Instagram URL
     * @param {string} username - Instagram username
     * @returns {string} Instagram profile URL
     */
    convertUsernameToUrl(username) {
        return `https://www.instagram.com/${username}`;
    }

    /**
     * Get extraction statistics for a session
     */
    async getExtractionStats(sessionId) {
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

        return stats;
    }

    /**
     * Helper function to delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new RelatedProfilesService();