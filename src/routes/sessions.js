const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const {
  validateCreateSession,
  validateUpdateStatus,
  validateSessionId
} = require('../middleware/sessionValidation');

// Create a new session
router.post(
  '/',
  validateCreateSession,
  sessionController.createSession
);

// Get all sessions
router.get(
  '/',
  sessionController.getAllSessions
);

// Get session by ID
router.get(
  '/:id',
  validateSessionId,
  sessionController.getSessionById
);

// Update session status
router.put(
  '/:id/status',
  validateSessionId,
  validateUpdateStatus,
  sessionController.updateSessionStatus
);

// Get session statistics
router.get(
  '/:id/stats',
  validateSessionId,
  sessionController.getSessionStats
);

// Delete session (soft delete)
router.delete(
  '/:id',
  validateSessionId,
  sessionController.deleteSession
);

// Start batch processing for session
router.post(
  '/:id/batch-process',
  validateSessionId,
  sessionController.startBatchProcessing
);

// Get batch processing status
router.get(
  '/:id/batch-status',
  validateSessionId,
  sessionController.getBatchProcessingStatus
);

// Extract related profiles
router.post(
  '/:id/extract-related',
  validateSessionId,
  sessionController.extractRelatedProfiles
);

// Get related profiles statistics
router.get(
  '/:id/related-stats',
  validateSessionId,
  sessionController.getRelatedProfilesStats
);

// Start depth processing
router.post(
  '/:id/depth-process',
  validateSessionId,
  sessionController.startDepthProcessing
);

// Get depth processing status
router.get(
  '/:id/depth-status',
  validateSessionId,
  sessionController.getDepthProcessingStatus
);

// Start queued batch processing
router.post(
  '/:id/queue-process',
  validateSessionId,
  sessionController.startQueuedBatchProcessing
);

// Pause session
router.post(
  '/:id/pause',
  validateSessionId,
  sessionController.pauseSession
);

// Resume session
router.post(
  '/:id/resume',
  validateSessionId,
  sessionController.resumeSession
);

// Stop session and clear all queues
router.post(
  '/:id/stop',
  validateSessionId,
  sessionController.stopSession
);

// Get session queue statistics
router.get(
  '/:id/queue-stats',
  validateSessionId,
  sessionController.getSessionQueueStats
);

// Pause session queue processing
router.post(
  '/:id/queue-pause',
  validateSessionId,
  sessionController.pauseSessionQueue
);

// Resume session queue processing
router.post(
  '/:id/queue-resume',
  validateSessionId,
  sessionController.resumeSessionQueue
);

// Check session completion
router.post(
  '/:id/check-completion',
  validateSessionId,
  sessionController.checkCompletion
);

module.exports = router;