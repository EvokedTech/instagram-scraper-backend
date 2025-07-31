const logger = require('../utils/logger');

// Helper function to convert username/URL to proper Instagram URL
const normalizeInstagramUrl = (input) => {
  input = input.trim();
  
  // If it's already a full URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    // Validate it's an Instagram URL
    const instagramRegex = /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?$/;
    if (!instagramRegex.test(input)) {
      throw new Error(`Invalid Instagram URL: ${input}`);
    }
    // Ensure it uses https
    return input.replace('http://', 'https://');
  }
  
  // If it's just a username
  const usernameRegex = /^[a-zA-Z0-9._]+$/;
  if (usernameRegex.test(input)) {
    return `https://www.instagram.com/${input}/`;
  }
  
  // If it starts with @, remove it and process
  if (input.startsWith('@')) {
    const username = input.substring(1);
    if (usernameRegex.test(username)) {
      return `https://www.instagram.com/${username}/`;
    }
  }
  
  throw new Error(`Invalid Instagram username or URL: ${input}`);
};

// Validation middleware for creating a session
const validateCreateSession = (req, res, next) => {
  try {
    const { name, rootProfiles, description, config } = req.body;
    
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Session name is required and must be a non-empty string'
      });
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
        const normalized = normalizeInstagramUrl(profile);
        normalizedProfiles.push(normalized);
      } catch (error) {
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