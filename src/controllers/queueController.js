const { queueManager } = require('../queues/queueManager');
const logger = require('../utils/logger');

const queueController = {
  // Get all queues status
  async getAllQueuesStatus(req, res, next) {
    try {
      const statuses = await queueManager.getAllQueuesStatus();
      
      res.status(200).json({
        success: true,
        data: statuses
      });
    } catch (error) {
      logger.error('Error fetching queues status:', error);
      next(error);
    }
  },

  // Get specific queue status
  async getQueueStatus(req, res, next) {
    try {
      const { queueName } = req.params;
      
      const status = await queueManager.getQueueStatus(queueName);
      
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error fetching queue status:', error);
      next(error);
    }
  },

  // Get jobs from a queue
  async getQueueJobs(req, res, next) {
    try {
      const { queueName } = req.params;
      const { state = 'waiting', start = 0, end = 20 } = req.query;
      
      const jobs = await queueManager.getJobs(
        queueName, 
        state, 
        parseInt(start), 
        parseInt(end)
      );
      
      res.status(200).json({
        success: true,
        data: jobs,
        pagination: {
          start: parseInt(start),
          end: parseInt(end),
          state
        }
      });
    } catch (error) {
      logger.error('Error fetching queue jobs:', error);
      next(error);
    }
  },

  // Get specific job details
  async getJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      
      const job = await queueManager.getJob(queueName, jobId);
      
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: job
      });
    } catch (error) {
      logger.error('Error fetching job:', error);
      next(error);
    }
  },

  // Pause a queue
  async pauseQueue(req, res, next) {
    try {
      const { queueName } = req.params;
      
      await queueManager.pauseQueue(queueName);
      
      res.status(200).json({
        success: true,
        message: `Queue ${queueName} paused successfully`
      });
    } catch (error) {
      logger.error('Error pausing queue:', error);
      next(error);
    }
  },

  // Resume a queue
  async resumeQueue(req, res, next) {
    try {
      const { queueName } = req.params;
      
      await queueManager.resumeQueue(queueName);
      
      res.status(200).json({
        success: true,
        message: `Queue ${queueName} resumed successfully`
      });
    } catch (error) {
      logger.error('Error resuming queue:', error);
      next(error);
    }
  },

  // Clean queue
  async cleanQueue(req, res, next) {
    try {
      const { queueName } = req.params;
      const { grace = 0, status = 'completed' } = req.body;
      
      const jobsRemoved = await queueManager.cleanQueue(
        queueName, 
        parseInt(grace), 
        status
      );
      
      res.status(200).json({
        success: true,
        message: `Cleaned ${jobsRemoved} ${status} jobs from ${queueName}`,
        data: {
          jobsRemoved,
          queue: queueName,
          status
        }
      });
    } catch (error) {
      logger.error('Error cleaning queue:', error);
      next(error);
    }
  },

  // Empty queue
  async emptyQueue(req, res, next) {
    try {
      const { queueName } = req.params;
      
      await queueManager.emptyQueue(queueName);
      
      res.status(200).json({
        success: true,
        message: `Queue ${queueName} emptied successfully`
      });
    } catch (error) {
      logger.error('Error emptying queue:', error);
      next(error);
    }
  },

  // Retry a failed job
  async retryJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      
      await queueManager.retryJob(queueName, jobId);
      
      res.status(200).json({
        success: true,
        message: `Job ${jobId} retried successfully`
      });
    } catch (error) {
      logger.error('Error retrying job:', error);
      next(error);
    }
  },

  // Remove a job
  async removeJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      
      await queueManager.removeJob(queueName, jobId);
      
      res.status(200).json({
        success: true,
        message: `Job ${jobId} removed successfully`
      });
    } catch (error) {
      logger.error('Error removing job:', error);
      next(error);
    }
  },

  // Add job to queue (for testing)
  async addJob(req, res, next) {
    try {
      const { queueName } = req.params;
      const { data, options = {} } = req.body;
      
      const job = await queueManager.addJob(queueName, data, options);
      
      res.status(201).json({
        success: true,
        message: `Job added to ${queueName} successfully`,
        data: {
          jobId: job.id,
          queue: queueName
        }
      });
    } catch (error) {
      logger.error('Error adding job:', error);
      next(error);
    }
  },

  // Get queue metrics
  async getQueueMetrics(req, res, next) {
    try {
      const { queueName } = req.params;
      const queue = queueManager.getQueue(queueName);
      
      if (!queue) {
        return res.status(404).json({
          success: false,
          error: 'Queue not found'
        });
      }

      const [
        completedCount,
        failedCount,
        delayedCount,
        activeCount,
        waitingCount,
        pausedStatus
      ] = await Promise.all([
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getActiveCount(),
        queue.getWaitingCount(),
        queue.isPaused()
      ]);

      const metrics = {
        counts: {
          completed: completedCount,
          failed: failedCount,
          delayed: delayedCount,
          active: activeCount,
          waiting: waitingCount,
          total: completedCount + failedCount + delayedCount + activeCount + waitingCount
        },
        status: {
          isPaused: pausedStatus,
          isActive: !pausedStatus && activeCount > 0
        },
        rates: {
          completionRate: completedCount > 0 ? 
            (completedCount / (completedCount + failedCount) * 100).toFixed(2) : 0,
          failureRate: failedCount > 0 ? 
            (failedCount / (completedCount + failedCount) * 100).toFixed(2) : 0
        }
      };

      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Error fetching queue metrics:', error);
      next(error);
    }
  }
};

module.exports = queueController;