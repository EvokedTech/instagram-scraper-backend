const logger = require('./logger');

class ProfileUrlHelper {
    /**
     * Convert a single username to Instagram profile URL
     * @param {string} username - Instagram username
     * @returns {string} Full Instagram profile URL
     */
    static usernameToUrl(username) {
        if (!username) return null;
        
        // Remove @ symbol if present
        const cleanUsername = username.replace('@', '').toLowerCase().trim();
        
        // Return null for invalid usernames
        if (!cleanUsername || cleanUsername.length === 0) return null;
        
        return `https://www.instagram.com/${cleanUsername}`;
    }

    /**
     * Convert array of usernames to Instagram profile URLs
     * @param {Array<string>} usernames - Array of Instagram usernames
     * @returns {Array<string>} Array of Instagram profile URLs
     */
    static bulkUsernamesToUrls(usernames) {
        if (!Array.isArray(usernames)) return [];
        
        const urls = [];
        const seen = new Set();
        
        for (const username of usernames) {
            const url = this.usernameToUrl(username);
            if (url && !seen.has(url)) {
                seen.add(url);
                urls.push(url);
            }
        }
        
        logger.info(`Converted ${usernames.length} usernames to ${urls.length} unique URLs`);
        return urls;
    }

    /**
     * Extract username from Instagram profile URL
     * @param {string} profileUrl - Instagram profile URL
     * @returns {string|null} Username or null if invalid
     */
    static extractUsername(profileUrl) {
        if (!profileUrl) return null;
        
        const match = profileUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
        return match ? match[1].toLowerCase() : null;
    }

    /**
     * Validate Instagram profile URL
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid Instagram profile URL
     */
    static isValidProfileUrl(url) {
        if (!url) return false;
        
        const pattern = /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?$/;
        return pattern.test(url);
    }

    /**
     * Normalize a single profile URL (ensure HTTPS, remove trailing slash)
     * @param {string} url - URL to normalize
     * @returns {string} Normalized URL
     */
    static normalizeUrl(url) {
        if (!url || !this.isValidProfileUrl(url)) return url;
        
        // Ensure HTTPS and remove trailing slash
        let normalized = url.replace(/^http:/, 'https:');
        if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        return normalized;
    }

    /**
     * Normalize an array of profile URLs (ensure HTTPS, remove trailing slash)
     * @param {Array<string>} urls - Array of URLs to normalize
     * @returns {Array<string>} Array of normalized URLs
     */
    static normalizeUrls(urls) {
        if (!Array.isArray(urls)) return [];
        
        return urls
            .filter(url => this.isValidProfileUrl(url))
            .map(url => this.normalizeUrl(url));
    }

    /**
     * Create a mapping of usernames to profile URLs
     * @param {Array<string>} usernames - Array of usernames
     * @returns {Map<string, string>} Map of username to profile URL
     */
    static createUsernameUrlMap(usernames) {
        const map = new Map();
        
        for (const username of usernames) {
            const cleanUsername = username.replace('@', '').toLowerCase().trim();
            if (cleanUsername) {
                map.set(cleanUsername, this.usernameToUrl(cleanUsername));
            }
        }
        
        return map;
    }

    /**
     * Bulk check and separate existing vs new profile URLs
     * @param {Array<string>} profileUrls - Array of profile URLs to check
     * @param {Array<Object>} existingProfiles - Array of existing profile objects with profileUrl field
     * @returns {Object} Object with exists and notExists arrays
     */
    static separateExistingAndNew(profileUrls, existingProfiles) {
        const existingUrlsSet = new Set(existingProfiles.map(p => p.profileUrl));
        
        const exists = [];
        const notExists = [];
        
        for (const url of profileUrls) {
            if (existingUrlsSet.has(url)) {
                exists.push(url);
            } else {
                notExists.push(url);
            }
        }
        
        return {
            exists,
            notExists,
            stats: {
                total: profileUrls.length,
                existing: exists.length,
                new: notExists.length
            }
        };
    }
}

module.exports = ProfileUrlHelper;