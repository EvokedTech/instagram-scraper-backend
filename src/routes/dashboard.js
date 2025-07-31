const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Get all sessions with stats for dashboard
router.get('/sessions', dashboardController.getAllSessionsWithStats);

// Get detailed session monitoring data
router.get('/session/:id', dashboardController.getSessionMonitoring);

// Get system-wide analytics
router.get('/system', dashboardController.getSystemAnalytics);

// Get paginated profile lists by depth for a session
router.get('/session/:id/profiles', dashboardController.getSessionProfilesByDepth);

// Get database-wide profile statistics and recent profiles
router.get('/profiles', dashboardController.getDatabaseProfiles);

module.exports = router;