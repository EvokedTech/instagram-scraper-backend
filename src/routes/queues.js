const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

// Get all queues status
router.get('/status', queueController.getAllQueuesStatus);

// Get specific queue status
router.get('/:queueName/status', queueController.getQueueStatus);

// Get queue metrics
router.get('/:queueName/metrics', queueController.getQueueMetrics);

// Get jobs from a queue
router.get('/:queueName/jobs', queueController.getQueueJobs);

// Get specific job details
router.get('/:queueName/jobs/:jobId', queueController.getJob);

// Pause a queue
router.post('/:queueName/pause', queueController.pauseQueue);

// Resume a queue
router.post('/:queueName/resume', queueController.resumeQueue);

// Clean queue
router.post('/:queueName/clean', queueController.cleanQueue);

// Empty queue
router.post('/:queueName/empty', queueController.emptyQueue);

// Retry a failed job
router.post('/:queueName/jobs/:jobId/retry', queueController.retryJob);

// Remove a job
router.delete('/:queueName/jobs/:jobId', queueController.removeJob);

// Add job to queue (for testing)
router.post('/:queueName/jobs', queueController.addJob);

module.exports = router;