const express = require('express');
const router = express.Router();
const apifyController = require('../controllers/apifyController');

// Scrape a single profile using Apify
router.post('/scrape/:username', apifyController.scrapeProfile);

// Scrape multiple profiles using Apify
router.post('/scrape-multiple', apifyController.scrapeMultipleProfiles);

module.exports = router;