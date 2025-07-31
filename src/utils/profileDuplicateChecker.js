const RootProfileScraped = require('../models/RootProfileScraped');
const RelatedProfileScraped = require('../models/RelatedProfileScraped');
const ProfileUrlHelper = require('./profileUrlHelper');
const logger = require('./logger');

class ProfileDuplicateChecker {
    /**
     * Check if profiles already exist in the database
     * @param {string} sessionId - Session ID (optional - if null, checks across all sessions)
     * @param {Array<string>} usernames - Array of usernames to check
     * @returns {Object} Object with exists and new arrays
     */
    static async checkProfilesByUsername(sessionId, usernames) {
        try {
            // Convert usernames to lowercase
            const normalizedUsernames = usernames.map(u => u.toLowerCase());
            
            // Build query - if sessionId is null, check across all sessions
            const query = {
                username: { $in: normalizedUsernames },
                status: 'scraped'
            };
            if (sessionId) {
                query.sessionId = sessionId;
            }
            
            // Check in both collections
            const [rootProfiles, relatedProfiles] = await Promise.all([
                RootProfileScraped.find(query).select('username'),
                RelatedProfileScraped.find(query).select('username')
            ]);
            
            // Create a set of existing usernames
            const existingUsernames = new Set();
            
            rootProfiles.forEach(p => existingUsernames.add(p.username));
            relatedProfiles.forEach(p => existingUsernames.add(p.username));
            
            // Separate existing and new usernames
            const exists = [];
            const newUsernames = [];
            
            normalizedUsernames.forEach(username => {
                if (existingUsernames.has(username)) {
                    exists.push(username);
                } else {
                    newUsernames.push(username);
                }
            });
            
            logger.info(`Profile duplicate check completed`, {
                sessionId,
                total: usernames.length,
                existing: exists.length,
                new: newUsernames.length
            });
            
            return {
                exists,
                new: newUsernames,
                stats: {
                    total: usernames.length,
                    existing: exists.length,
                    new: newUsernames.length
                }
            };
        } catch (error) {
            logger.error('Error checking profile duplicates:', error);
            throw error;
        }
    }
    
    /**
     * Check if profiles already exist by URL
     * @param {string} sessionId - Session ID
     * @param {Array<string>} profileUrls - Array of profile URLs to check
     * @returns {Object} Object with exists and new arrays
     */
    static async checkProfilesByUrl(sessionId, profileUrls) {
        try {
            // Normalize URLs
            const normalizedUrls = profileUrls.map(url => ProfileUrlHelper.normalizeUrl(url));
            
            // Check in both collections
            const [rootProfiles, relatedProfiles] = await Promise.all([
                RootProfileScraped.find({
                    sessionId,
                    profileUrl: { $in: normalizedUrls }
                }).select('profileUrl'),
                
                RelatedProfileScraped.find({
                    sessionId,
                    profileUrl: { $in: normalizedUrls }
                }).select('profileUrl')
            ]);
            
            // Create a set of existing URLs
            const existingUrls = new Set();
            
            rootProfiles.forEach(p => existingUrls.add(p.profileUrl));
            relatedProfiles.forEach(p => existingUrls.add(p.profileUrl));
            
            // Separate existing and new URLs
            const exists = [];
            const newUrls = [];
            
            normalizedUrls.forEach(url => {
                if (existingUrls.has(url)) {
                    exists.push(url);
                } else {
                    newUrls.push(url);
                }
            });
            
            return {
                exists,
                new: newUrls,
                stats: {
                    total: profileUrls.length,
                    existing: exists.length,
                    new: newUrls.length
                }
            };
        } catch (error) {
            logger.error('Error checking profile duplicates by URL:', error);
            throw error;
        }
    }
    
    /**
     * Check scraped profiles (with status 'scraped')
     * @param {string} sessionId - Session ID
     * @param {Array<string>} usernames - Array of usernames to check
     * @returns {Object} Object with scraped and unscraped usernames
     */
    static async checkScrapedProfiles(sessionId, usernames) {
        try {
            const normalizedUsernames = usernames.map(u => u.toLowerCase());
            
            // Check for scraped profiles in both collections
            const [rootProfiles, relatedProfiles] = await Promise.all([
                RootProfileScraped.find({
                    sessionId,
                    username: { $in: normalizedUsernames },
                    status: 'scraped'
                }).select('username'),
                
                RelatedProfileScraped.find({
                    sessionId,
                    username: { $in: normalizedUsernames },
                    status: 'scraped'
                }).select('username')
            ]);
            
            // Create a set of scraped usernames
            const scrapedUsernames = new Set();
            
            rootProfiles.forEach(p => scrapedUsernames.add(p.username));
            relatedProfiles.forEach(p => scrapedUsernames.add(p.username));
            
            // Separate scraped and unscraped
            const scraped = [];
            const unscraped = [];
            
            normalizedUsernames.forEach(username => {
                if (scrapedUsernames.has(username)) {
                    scraped.push(username);
                } else {
                    unscraped.push(username);
                }
            });
            
            return {
                scraped,
                unscraped,
                stats: {
                    total: usernames.length,
                    scraped: scraped.length,
                    unscraped: unscraped.length
                }
            };
        } catch (error) {
            logger.error('Error checking scraped profiles:', error);
            throw error;
        }
    }
    
    /**
     * Batch check profiles from related profiles array
     * @param {string} sessionId - Session ID (optional - if null, checks across all sessions)
     * @param {Array} relatedProfiles - Array of related profile objects
     * @returns {Object} Filtered profiles that don't exist
     */
    static async filterNewProfiles(sessionId, relatedProfiles) {
        try {
            // Extract usernames
            const usernames = relatedProfiles
                .map(p => (p.username || p.userName || '').toLowerCase())
                .filter(u => u);
            
            if (usernames.length === 0) {
                return {
                    profiles: [],
                    stats: { total: 0, existing: 0, new: 0 }
                };
            }
            
            // Check which profiles already exist
            const checkResult = await this.checkProfilesByUsername(sessionId, usernames);
            const existingSet = new Set(checkResult.exists);
            
            // Filter to only new profiles
            const newProfiles = relatedProfiles.filter(p => {
                const username = (p.username || p.userName || '').toLowerCase();
                return username && !existingSet.has(username);
            });
            
            return {
                profiles: newProfiles,
                stats: checkResult.stats
            };
        } catch (error) {
            logger.error('Error filtering new profiles:', error);
            throw error;
        }
    }
}

module.exports = ProfileDuplicateChecker;