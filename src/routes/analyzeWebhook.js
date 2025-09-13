const express = require('express');
const router = express.Router();
const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const aiAnalysisService = require('../services/aiAnalysisService');
const logger = require('../utils/logger');

/**
 * Webhook endpoint for analyzing profiles
 * This replaces the external analysis backend
 */
router.post('/webhook', async (req, res) => {
    try {
        const { event, username, profileId, sessionId } = req.body;

        logger.info(`📨 Webhook received: ${event} for ${username}`);

        if (event !== 'new_profile_scraped') {
            return res.json({
                success: true,
                message: 'Event ignored',
                event
            });
        }

        logger.info(`🔍 Starting analysis for: ${username}`);

        // Find the profile in either collection
        let profile = await RootProfileScraped.findOne({
            username: username.toLowerCase()
        }).sort({ createdAt: -1 });

        if (!profile) {
            profile = await RelatedProfileScraped.findOne({
                username: username.toLowerCase()
            }).sort({ createdAt: -1 });
        }

        if (!profile) {
            logger.error(`Profile not found: ${username}`);
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        // Get profile data
        const profileData = profile.profileData || {
            username: profile.username,
            fullName: profile.fullName || '',
            biography: profile.biography || profile.bio || '',
            followersCount: profile.followersCount || profile.followers || 0,
            followingCount: profile.followingCount || profile.following || 0,
            postsCount: profile.postsCount || profile.posts || 0,
            isVerified: profile.isVerified || false,
            isBusinessAccount: profile.isBusinessAccount || false,
            categoryName: profile.categoryName || '',
            externalUrl: profile.externalUrl || '',
            profilePicUrl: profile.profilePicUrl || ''
        };

        logger.info(`📊 Found profile data for ${username}`);
        logger.info(`  Followers: ${profileData.followersCount}`);
        logger.info(`  Posts: ${profileData.postsCount}`);

        // Perform AI analysis using the new service with fallback
        logger.info(`🤖 Generating AI analysis...`);

        try {
            const analysisResult = await aiAnalysisService.analyzeProfile(profileData, {
                forceRefresh: true
            });

            if (analysisResult.success) {
                logger.info(`✅ AI analysis successful for ${username}`);
                logger.info(`  Model used: ${analysisResult.modelUsed}`);
                logger.info(`  Processing time: ${analysisResult.processingTime}ms`);

                // You can save the analysis to a collection here if needed
                // For now, just return success

                return res.json({
                    success: true,
                    message: 'Analysis completed',
                    username,
                    modelUsed: analysisResult.modelUsed,
                    analysis: analysisResult.analysis
                });
            } else {
                throw new Error('Analysis failed');
            }
        } catch (analysisError) {
            logger.error(`❌ AI analysis failed for ${username}:`, analysisError.message);

            // Still return success to acknowledge webhook receipt
            return res.json({
                success: true,
                message: 'Analysis failed but webhook processed',
                username,
                error: analysisError.message
            });
        }

    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Test endpoint to verify the webhook is working
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Analyze webhook endpoint is working',
        availableModels: ['grok', 'deepseek-r1', 'mistral'],
        endpoint: '/api/analyze/webhook'
    });
});

module.exports = router;