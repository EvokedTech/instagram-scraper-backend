const express = require('express');
const router = express.Router();
const aiAnalysisService = require('../services/aiAnalysisService');
const profileAnalysisService = require('../services/profileAnalysisService');
const logger = require('../utils/logger');

/**
 * Get AI model status
 * GET /api/ai-analysis/status
 */
router.get('/status', (req, res) => {
    try {
        const modelStatus = aiAnalysisService.getModelStatus();
        const aiStatus = profileAnalysisService.getAIModelStatus();

        res.json({
            success: true,
            models: modelStatus,
            summary: {
                availableModels: modelStatus.filter(m => m.available).length,
                totalModels: modelStatus.length,
                primaryModel: modelStatus[0]?.name || 'none',
                firstFallback: modelStatus[1]?.name || 'none',
                secondFallback: modelStatus[2]?.name || 'none',
                fallbackChain: modelStatus.map(m => m.name)
            }
        });
    } catch (error) {
        logger.error('Failed to get AI model status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Clear AI analysis cache
 * POST /api/ai-analysis/clear-cache
 */
router.post('/clear-cache', (req, res) => {
    try {
        aiAnalysisService.clearCache();
        profileAnalysisService.clearAICache();

        res.json({
            success: true,
            message: 'AI analysis cache cleared successfully'
        });
    } catch (error) {
        logger.error('Failed to clear AI cache:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Clear duplicate tracking cache
 * POST /api/ai-analysis/clear-duplicates
 */
router.post('/clear-duplicates', (req, res) => {
    try {
        profileAnalysisService.clearDuplicateCache();

        res.json({
            success: true,
            message: 'Duplicate tracking cache cleared successfully'
        });
    } catch (error) {
        logger.error('Failed to clear duplicate cache:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Test AI analysis with sample data
 * POST /api/ai-analysis/test
 */
router.post('/test', async (req, res) => {
    try {
        const { profileData, forceRefresh = false } = req.body;

        // Use test data if not provided
        const testData = profileData || {
            username: 'test_user',
            fullName: 'Test User',
            biography: 'Test profile for AI analysis',
            followersCount: 10000,
            followingCount: 500,
            postsCount: 100,
            isVerified: false,
            isBusinessAccount: false
        };

        const result = await aiAnalysisService.analyzeProfile(testData, {
            forceRefresh
        });

        res.json({
            success: true,
            result: {
                analysis: result.analysis,
                modelUsed: result.modelUsed,
                fromCache: result.fromCache,
                processingTime: result.processingTime
            }
        });
    } catch (error) {
        logger.error('AI analysis test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'All AI models may be unavailable or rate limited'
        });
    }
});

/**
 * Analyze a specific profile with AI
 * POST /api/ai-analysis/analyze-profile
 */
router.post('/analyze-profile', async (req, res) => {
    try {
        const { username, profileData, forceRefresh = false } = req.body;

        if (!profileData) {
            return res.status(400).json({
                success: false,
                error: 'Profile data is required'
            });
        }

        const result = await aiAnalysisService.analyzeProfile(profileData, {
            forceRefresh
        });

        res.json({
            success: true,
            username: username || profileData.username,
            analysis: result.analysis,
            modelUsed: result.modelUsed,
            fromCache: result.fromCache,
            processingTime: `${result.processingTime}ms`
        });
    } catch (error) {
        logger.error(`Failed to analyze profile:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;