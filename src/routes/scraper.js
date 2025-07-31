const express = require('express');
const router = express.Router();
const scraperController = require('../controllers/scraperController');

// Scrape a profile
router.post('/scrape/:username', scraperController.scrapeProfile);

// Get profile from database
router.get('/profile/:username', scraperController.getProfile);

// Get all profiles
router.get('/profiles', scraperController.getAllProfiles);

// Get recently scraped profiles
router.get('/profiles/recent', scraperController.getRecentlyScraped);

module.exports = router;