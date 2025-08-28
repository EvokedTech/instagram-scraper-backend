const logger = require('../utils/logger');

// Helper function to convert username/URL to proper Instagram URL
const normalizeInstagramUrl = (input) => {
  if (!input || typeof input !== 'string') {
    throw new Error(`Invalid input: ${input}`);
  }
  
  input = input.trim();
  
  // If it looks like it was incorrectly split (just "https:" or "http:")
  if (input === 'https:' || input === 'http:') {
    throw new Error(`Invalid Instagram username: ${input}`);
  }
  
  // If it's already a full Instagram URL (with or without protocol)
  if (input.includes('instagram.com/')) {
    // Extract username from Instagram URL
    const match = input.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
    if (!match || !match[1]) {
      throw new Error(`Invalid Instagram URL: ${input}`);
    }
    const username = match[1];
    // Return clean URL
    return `https://www.instagram.com/${username}/`;
  }
  
  // If it starts with @, remove it
  if (input.startsWith('@')) {
    input = input.substring(1);
  }
  
  // Remove any protocol prefixes that might remain
  input = input.replace(/^https?:\/\//, '');
  input = input.replace(/^www\./, '');
  
  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9._]+$/;
  if (!usernameRegex.test(input)) {
    throw new Error(`Invalid Instagram username: ${input}`);
  }
  
  return `https://www.instagram.com/${input}/`;
};

// Validation middleware for creating a session
const validateCreateSession = (req, res, next) => {
  try {
    let { name, rootProfiles, description, config } = req.body;
    
    // Log the incoming request for debugging
    logger.info('Session creation request received:', {
      name,
      rootProfilesType: typeof rootProfiles,
      rootProfilesLength: Array.isArray(rootProfiles) ? rootProfiles.length : (typeof rootProfiles === 'string' ? rootProfiles.length : 0),
      hasConfig: !!config
    });
    
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Session name is required and must be a non-empty string'
      });
    }
    
    // Handle case where rootProfiles might be a string (from frontend)
    if (typeof rootProfiles === 'string') {
      logger.info('Converting string rootProfiles to array');
      logger.info('Original string length:', rootProfiles.length);
      
      // Extract all Instagram URLs and usernames
      let extractedProfiles = [];
      
      // First try to extract full Instagram URLs
      const urlPattern = /(https?:\/\/)?(www\.)?instagram\.com\/[a-zA-Z0-9._]+/g;
      const urlMatches = rootProfiles.match(urlPattern);
      
      if (urlMatches && urlMatches.length > 0) {
        // Found Instagram URLs
        extractedProfiles = urlMatches;
        logger.info(`Extracted ${urlMatches.length} Instagram URLs`);
      } else {
        // No URLs found, try to parse as usernames
        // Split by newlines, spaces, or commas
        const profiles = rootProfiles
          .split(/[\n\r\s,]+/)
          .map(p => p.trim())
          .filter(p => p && p.length > 0 && p !== 'https:' && p !== 'http:');
        
        extractedProfiles = profiles;
        logger.info(`Extracted ${profiles.length} profiles as usernames`);
      }
      
      rootProfiles = extractedProfiles;
      req.body.rootProfiles = rootProfiles; // Update the request body
      logger.info(`Final array with ${rootProfiles.length} profiles:`, rootProfiles.slice(0, 5)); // Log first 5 for debugging
    }
    
    if (!rootProfiles || !Array.isArray(rootProfiles) || rootProfiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one root profile is required'
      });
    }
    
    // Normalize and validate root profiles
    const normalizedProfiles = [];
    const errors = [];
    
    rootProfiles.forEach((profile, index) => {
      try {
        logger.info(`Normalizing profile ${index + 1}: "${profile}"`);
        const normalized = normalizeInstagramUrl(profile);
        normalizedProfiles.push(normalized);
        logger.info(`Successfully normalized to: ${normalized}`);
      } catch (error) {
        logger.error(`Failed to normalize profile ${index + 1}: "${profile}" - ${error.message}`);
        errors.push(`Profile ${index + 1}: ${error.message}`);
      }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profiles detected',
        details: errors
      });
    }
    
    // Validate config if provided
    if (config) {
      if (config.maxDepth !== undefined) {
        const maxDepth = parseInt(config.maxDepth);
        if (isNaN(maxDepth) || maxDepth < 1 || maxDepth > 6) {
          return res.status(400).json({
            success: false,
            error: 'maxDepth must be a number between 1 and 6'
          });
        }
        config.maxDepth = maxDepth;
      }
      
      if (config.maxProfilesPerDepth !== undefined && config.maxProfilesPerDepth !== null) {
        const maxProfiles = parseInt(config.maxProfilesPerDepth);
        if (isNaN(maxProfiles) || maxProfiles < 1 || maxProfiles > 1000000) {
          return res.status(400).json({
            success: false,
            error: 'maxProfilesPerDepth must be a number between 1 and 1000000 or null for unlimited'
          });
        }
        config.maxProfilesPerDepth = maxProfiles;
      }
      
      if (config.analysisEnabled !== undefined && typeof config.analysisEnabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'analysisEnabled must be a boolean'
        });
      }
    }
    
    // Attach normalized data to request
    req.body.rootProfiles = normalizedProfiles;
    req.body.name = name.trim();
    req.body.description = description ? description.trim() : '';
    
    logger.info(`Session validation passed for: ${req.body.name}`);
    next();
  } catch (error) {
    logger.error('Session validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation'
    });
  }
};

// Validation middleware for updating session status
const validateUpdateStatus = (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['running', 'paused', 'completed', 'failed'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Additional validation based on current status will be done in controller
    next();
  } catch (error) {
    logger.error('Status validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation'
    });
  }
};

// Validation middleware for session ID
const validateSessionId = (req, res, next) => {
  const { id } = req.params;
  
  logger.info(`Validating session ID: ${id}`);
  
  // Check if it's a valid MongoDB ObjectId
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    logger.error(`Invalid session ID format: ${id}`);
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format'
    });
  }
  
  next();
};

module.exports = {
  validateCreateSession,
  validateUpdateStatus,
  validateSessionId,
  normalizeInstagramUrl
};