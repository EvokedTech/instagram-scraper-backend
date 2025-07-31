const Session = require('../models/Session');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const RootProfileScraped = require('../models/RootProfileScraped');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const socketService = require('./socketService');

class DepthProgressService {
    /**
     * Initialize depth progress for a session
     */
    async initializeDepthProgress(sessionId, depth = 0) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Initialize depth 0 (root profiles)
            if (depth === 0) {
                const rootProfileCount = session.rootProfiles.length;
                await session.updateDepthProgress(0, {
                    totalProfiles: rootProfileCount,
                    scrapedProfiles: 0,
                    analyzedProfiles: 0,
                    isScrapingComplete: false,
                    isAnalysisComplete: false,
                    startedAt: new Date()
                });

                logger.info(`Initialized depth 0 progress for session ${sessionId}`, {
                    totalProfiles: rootProfileCount
                });
            }

            return session;
        } catch (error) {
            logger.error(`Failed to initialize depth progress for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Update scraping progress for a depth
     */
    async updateScrapingProgress(sessionId, depth) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Get current stats for the depth
            const stats = await this.getDepthStats(sessionId, depth);
            
            // Update depth progress
            await session.updateDepthProgress(depth, {
                scrapedProfiles: stats.scraped,
                isScrapingComplete: stats.scraped >= stats.total && stats.pending === 0
            });

            // Update overall scraped count
            session.stats.scrapedProfiles = await this.getTotalScrapedProfiles(sessionId);
            await session.save();

            // Emit progress update
            socketService.emitSessionProgress(sessionId, {
                depth,
                scrapedProfiles: stats.scraped,
                totalProfiles: stats.total,
                isScrapingComplete: stats.scraped >= stats.total && stats.pending === 0
            });

            // Check if depth scraping is complete
            if (stats.scraped >= stats.total && stats.pending === 0) {
                await this.checkDepthCompletion(sessionId, depth);
            }

            return session;
        } catch (error) {
            logger.error(`Failed to update scraping progress for session ${sessionId}, depth ${depth}:`, error);
            throw error;
        }
    }

    /**
     * Update analysis progress for a depth
     */
    async updateAnalysisProgress(sessionId, depth) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Get analysis stats for the depth
            const stats = await this.getDepthAnalysisStats(sessionId, depth);
            
            // Update depth progress
            await session.updateDepthProgress(depth, {
                analyzedProfiles: stats.analyzed,
                isAnalysisComplete: stats.analyzed >= stats.total && stats.pending === 0
            });

            // Update overall analyzed count
            session.stats.analyzedProfiles = await this.getTotalAnalyzedProfiles(sessionId);
            await session.save();

            // Emit progress update
            socketService.emitSessionProgress(sessionId, {
                depth,
                analyzedProfiles: stats.analyzed,
                totalProfiles: stats.total,
                isAnalysisComplete: stats.analyzed >= stats.total && stats.pending === 0
            });

            // Check if depth is fully complete
            if (stats.analyzed >= stats.total && stats.pending === 0) {
                await this.checkDepthCompletion(sessionId, depth);
            }

            return session;
        } catch (error) {
            logger.error(`Failed to update analysis progress for session ${sessionId}, depth ${depth}:`, error);
            throw error;
        }
    }

    /**
     * Check if a depth is fully complete (scraped and analyzed)
     */
    async checkDepthCompletion(sessionId, depth) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            const depthProgress = session.depthProgress.find(dp => dp.depth === depth);
            if (!depthProgress) {
                return false;
            }

            // Check if both scraping and analysis are complete
            if (depthProgress.isScrapingComplete && depthProgress.isAnalysisComplete) {
                // Mark depth as completed
                await session.updateDepthProgress(depth, {
                    completedAt: new Date()
                });

                logger.info(`Depth ${depth} fully completed for session ${sessionId}`);

                // Emit depth completion event
                socketService.emitDepthFullyComplete(sessionId, depth);

                // Check if session should be completed
                const sessionCompleted = await session.checkAndCompleteSession();
                if (sessionCompleted) {
                    logger.info(`Session ${sessionId} auto-completed after depth ${depth}`);
                    socketService.emitSessionComplete(sessionId);
                }

                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Failed to check depth completion for session ${sessionId}, depth ${depth}:`, error);
            throw error;
        }
    }

    /**
     * Get scraping statistics for a specific depth
     */
    async getDepthStats(sessionId, depth) {
        if (depth === 0) {
            // For root profiles
            const rootStats = await RootProfileScraped.aggregate([
                { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const stats = {
                total: 0,
                scraped: 0,
                pending: 0,
                failed: 0
            };

            rootStats.forEach(stat => {
                stats.total += stat.count;
                if (stat._id === 'scraped') stats.scraped = stat.count;
                else if (stat._id === 'pending') stats.pending = stat.count;
                else if (stat._id === 'failed') stats.failed = stat.count;
            });

            return stats;
        } else {
            // For related profiles at specific depth
            const depthStats = await RelatedProfileScraped.aggregate([
                { 
                    $match: { 
                        sessionId: new mongoose.Types.ObjectId(sessionId),
                        depth: depth
                    } 
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const stats = {
                total: 0,
                scraped: 0,
                pending: 0,
                failed: 0
            };

            depthStats.forEach(stat => {
                stats.total += stat.count;
                if (stat._id === 'scraped') stats.scraped = stat.count;
                else if (stat._id === 'pending') stats.pending = stat.count;
                else if (stat._id === 'failed') stats.failed = stat.count;
            });

            return stats;
        }
    }

    /**
     * Get analysis statistics for a specific depth
     */
    async getDepthAnalysisStats(sessionId, depth) {
        if (depth === 0) {
            // Root profiles don't get analyzed
            return {
                total: 0,
                analyzed: 0,
                pending: 0
            };
        }

        const analysisStats = await RelatedProfileScraped.aggregate([
            { 
                $match: { 
                    sessionId: new mongoose.Types.ObjectId(sessionId),
                    depth: depth,
                    status: 'scraped' // Only scraped profiles can be analyzed
                } 
            },
            {
                $group: {
                    _id: '$n8nProcessed',
                    count: { $sum: 1 }
                }
            }
        ]);

        let total = 0;
        let analyzed = 0;

        analysisStats.forEach(stat => {
            total += stat.count;
            if (stat._id === true) analyzed = stat.count;
        });

        return {
            total,
            analyzed,
            pending: total - analyzed
        };
    }

    /**
     * Get total scraped profiles across all depths
     */
    async getTotalScrapedProfiles(sessionId) {
        const [rootCount, relatedCount] = await Promise.all([
            RootProfileScraped.countDocuments({ 
                sessionId: new mongoose.Types.ObjectId(sessionId), 
                status: 'scraped' 
            }),
            RelatedProfileScraped.countDocuments({ 
                sessionId: new mongoose.Types.ObjectId(sessionId), 
                status: 'scraped' 
            })
        ]);

        return rootCount + relatedCount;
    }

    /**
     * Get total analyzed profiles across all depths
     */
    async getTotalAnalyzedProfiles(sessionId) {
        // Only related profiles are analyzed
        return await RelatedProfileScraped.countDocuments({ 
            sessionId: new mongoose.Types.ObjectId(sessionId), 
            n8nProcessed: true 
        });
    }

    /**
     * Get detailed progress for all depths
     */
    async getDetailedProgress(sessionId) {
        const session = await Session.findById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const depthDetails = [];

        // Get progress for each depth up to maxDepth
        for (let depth = 0; depth <= session.config.maxDepth; depth++) {
            const scrapingStats = await this.getDepthStats(sessionId, depth);
            const analysisStats = await this.getDepthAnalysisStats(sessionId, depth);
            
            const depthProgress = session.depthProgress.find(dp => dp.depth === depth) || {
                depth,
                totalProfiles: scrapingStats.total,
                scrapedProfiles: scrapingStats.scraped,
                analyzedProfiles: analysisStats.analyzed,
                isScrapingComplete: false,
                isAnalysisComplete: false
            };

            depthDetails.push({
                depth,
                totalProfiles: scrapingStats.total,
                scrapedProfiles: scrapingStats.scraped,
                analyzedProfiles: analysisStats.analyzed,
                pendingScraping: scrapingStats.pending,
                pendingAnalysis: analysisStats.pending,
                failedProfiles: scrapingStats.failed,
                isScrapingComplete: depthProgress.isScrapingComplete,
                isAnalysisComplete: depthProgress.isAnalysisComplete,
                isFullyComplete: depthProgress.isScrapingComplete && depthProgress.isAnalysisComplete,
                startedAt: depthProgress.startedAt,
                completedAt: depthProgress.completedAt
            });
        }

        return {
            sessionId,
            currentDepth: session.stats.currentDepth,
            maxDepth: session.config.maxDepth,
            overallProgress: session.progressPercentage,
            totalProfiles: session.stats.totalProfiles,
            scrapedProfiles: session.stats.scrapedProfiles,
            analyzedProfiles: session.stats.analyzedProfiles,
            depthDetails
        };
    }
}

module.exports = new DepthProgressService();