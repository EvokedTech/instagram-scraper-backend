let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (error) {
  console.log('Puppeteer not available, using Apify service only');
}
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const Profile = require('../models/Profile');

class InstagramScraperService {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
    this.puppeteerAvailable = !!puppeteer;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    if (!this.puppeteerAvailable) {
      logger.warn('Puppeteer not available, skipping browser initialization');
      this.isInitialized = true;
      return;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      this.isInitialized = true;
      logger.info('Puppeteer browser initialized');
    } catch (error) {
      logger.error('Failed to initialize Puppeteer:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.isInitialized = false;
      logger.info('Puppeteer browser closed');
    }
  }

  async scrapeProfile(username) {
    logger.info(`Starting to scrape profile: ${username}`);
    
    if (!this.puppeteerAvailable) {
      throw new Error('Puppeteer not available. Please use Apify service for scraping.');
    }
    
    try {
      // Initialize browser if needed
      if (!this.isInitialized) {
        await this.initialize();
      }

      const page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1366, height: 768 });

      // Navigate to Instagram profile
      const url = `https://www.instagram.com/${username}`;
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for content to load
      await page.waitForSelector('header', { timeout: 10000 });

      // Extract profile data
      const profileData = await page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };

        const getMetaContent = (property) => {
          const meta = document.querySelector(`meta[property="${property}"]`);
          return meta ? meta.getAttribute('content') : '';
        };

        // Basic profile info
        const data = {
          fullName: getTextContent('header section div span'),
          bio: getMetaContent('og:description'),
          profilePicUrl: document.querySelector('header img')?.src || '',
          isVerified: !!document.querySelector('header svg[aria-label="Verified"]'),
          isPrivate: !!document.querySelector('h2:contains("This Account is Private")'),
        };

        // Get follower, following, and post counts
        const statsElements = document.querySelectorAll('header section ul li');
        if (statsElements.length >= 3) {
          data.postCount = parseInt(statsElements[0]?.textContent.replace(/[^0-9]/g, '') || '0');
          data.followerCount = parseInt(statsElements[1]?.textContent.replace(/[^0-9]/g, '') || '0');
          data.followingCount = parseInt(statsElements[2]?.textContent.replace(/[^0-9]/g, '') || '0');
        }

        return data;
      });

      await page.close();

      // Save or update profile in database
      const profile = await Profile.findOneAndUpdate(
        { username: username.toLowerCase() },
        {
          ...profileData,
          username: username.toLowerCase(),
          lastScraped: new Date()
        },
        { upsert: true, new: true }
      );

      await profile.updateScrapeStatus(true);
      
      logger.info(`Successfully scraped profile: ${username}`);
      return profile;

    } catch (error) {
      logger.error(`Failed to scrape profile ${username}:`, error);
      
      // Update scrape status with error
      const profile = await Profile.findByUsername(username);
      if (profile) {
        await profile.updateScrapeStatus(false, error.message);
      }
      
      throw error;
    }
  }

  async scrapePosts(username, limit = 12) {
    // This is a placeholder for post scraping functionality
    // Instagram's dynamic loading makes this more complex
    logger.info(`Scraping posts for ${username} is not yet implemented`);
    return [];
  }
}

// Export singleton instance
module.exports = new InstagramScraperService();