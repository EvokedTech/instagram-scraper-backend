const Bull = require('bull');
const { getBullQueueOptions } = require('../config/redisClients');
const logger = require('../utils/logger');

// Get shared queue options
const defaultQueueOptions = getBullQueueOptions();

// Check if Redis is disabled or not configured
const redisDisabled = !defaultQueueOptions;

// Create queues only if Redis is configured
const queues = defaultQueueOptions ? {
  rootProfileQueue: new Bull('root-profile-scraping', defaultQueueOptions),
  relatedProfileQueue: new Bull('related-profile-scraping', defaultQueueOptions),
  relatedProfileBatchQueue: new Bull('related-profile-batch', defaultQueueOptions),
  depthProcessingQueue: new Bull('depth-processing', defaultQueueOptions),
  analysisQueue: new Bull('profile-analysis', defaultQueueOptions)
} : {
  // Dummy queues when Redis is not available
  rootProfileQueue: null,
  relatedProfileQueue: null,
  relatedProfileBatchQueue: null,
  depthProcessingQueue: null,
  analysisQueue: null
};

// Queue event handlers
Object.entries(queues).forEach(([queueName, queue]) => {
  if (!queue) return; // Skip if queue is null
  
  // Increase max listeners for queue to prevent warnings
  if (queue.setMaxListeners) {
    queue.setMaxListeners(15);
  }
  
  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed in ${queueName}`, {
      jobId: job.id,
      queue: queueName,
      processingTime: Date.now() - job.timestamp
    });
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed in ${queueName}`, {
      jobId: job.id,
      queue: queueName,
      error: err.message,
      attempts: job.attemptsMade
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled in ${queueName}`, {
      jobId: job.id,
      queue: queueName
    });
  });

  queue.on('error', (error) => {
    // Suppress Redis connection errors to avoid log spam
    if (error.code !== 'ECONNREFUSED') {
      logger.error(`Queue error in ${queueName}:`, error);
    }
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} waiting in ${queueName}`);
  });

  queue.on('active', (job) => {
    logger.debug(`Job ${job.id} active in ${queueName}`);
  });
});

// Queue management functions
const queueManager = {
  /**
   * Add a job to a queue
   */
  async addJob(queueName, jobData, options = {}) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobOptions = {
      ...(defaultQueueOptions?.defaultJobOptions || {}),
      ...options
    };

    const job = await queue.add(jobData, jobOptions);
    logger.info(`Job ${job.id} added to ${queueName}`, {
      jobId: job.id,
      queue: queueName,
      priority: jobOptions.priority,
      delay: jobOptions.delay
    });

    return job;
  },

  /**
   * Add multiple jobs to a queue
   */
  async addBulkJobs(queueName, jobsData, options = {}) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobs = jobsData.map(data => ({
      data,
      opts: {
        ...(defaultQueueOptions?.defaultJobOptions || {}),
        ...options
      }
    }));

    const addedJobs = await queue.addBulk(jobs);
    logger.info(`${addedJobs.length} jobs added to ${queueName}`);

    return addedJobs;
  },

  /**
   * Get queue status
   */
  async getQueueStatus(queueName) {
    const queue = queues[queueName];
    if (!queue) {
      // Return empty stats if queue is not available
      return {
        name: queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false
      };
    }

    const [
      waitingCount,
      activeCount,
      completedCount,
      failedCount,
      delayedCount,
      isPaused
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused()
    ]);

    return {
      name: queueName,
      waiting: waitingCount,
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      delayed: delayedCount,
      paused: isPaused
    };
  },

  /**
   * Get all queues status
   */
  async getAllQueuesStatus() {
    const statuses = await Promise.all(
      Object.keys(queues).map(queueName => this.getQueueStatus(queueName))
    );
    return statuses;
  },

  /**
   * Pause a queue
   */
  async pauseQueue(queueName) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
    return true;
  },

  /**
   * Resume a queue
   */
  async resumeQueue(queueName) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
    return true;
  },

  /**
   * Clean queue
   */
  async cleanQueue(queueName, grace = 0, status = 'completed') {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobs = await queue.clean(grace, status);
    logger.info(`Cleaned ${jobs.length} ${status} jobs from ${queueName}`);
    return jobs.length;
  },

  /**
   * Empty a queue
   */
  async emptyQueue(queueName) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.empty();
    logger.info(`Queue ${queueName} emptied`);
    return true;
  },

  /**
   * Get job by ID
   */
  async getJob(queueName, jobId) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    return {
      id: job.id,
      data: job.data,
      opts: job.opts,
      progress: job.progress(),
      state,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      timestamp: job.timestamp
    };
  },

  /**
   * Get jobs by state
   */
  async getJobs(queueName, state = 'waiting', start = 0, end = 20) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    let jobs;
    switch (state) {
      case 'waiting':
        jobs = await queue.getWaiting(start, end);
        break;
      case 'active':
        jobs = await queue.getActive(start, end);
        break;
      case 'completed':
        jobs = await queue.getCompleted(start, end);
        break;
      case 'failed':
        jobs = await queue.getFailed(start, end);
        break;
      case 'delayed':
        jobs = await queue.getDelayed(start, end);
        break;
      default:
        throw new Error(`Invalid job state: ${state}`);
    }

    return jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress(),
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp
    }));
  },

  /**
   * Retry a failed job
   */
  async retryJob(queueName, jobId) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    logger.info(`Job ${jobId} retried in ${queueName}`);
    return true;
  },

  /**
   * Remove a job
   */
  async removeJob(queueName, jobId) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.remove();
    logger.info(`Job ${jobId} removed from ${queueName}`);
    return true;
  },

  /**
   * Get queue instance
   */
  getQueue(queueName) {
    return queues[queueName];
  },

  /**
   * Get queue statistics by depth for a session
   */
  async getQueueStatsByDepth(sessionId) {
    try {
      const depthStats = {};
      
      // Get all jobs from relevant queues
      const queueNames = ['relatedProfileQueue', 'relatedProfileBatchQueue'];
      
      for (const queueName of queueNames) {
        const queue = queues[queueName];
        if (!queue) continue;
        
        // Get all job states
        const [waiting, active, delayed] = await Promise.all([
          queue.getJobs(['waiting']),
          queue.getJobs(['active']),
          queue.getJobs(['delayed'])
        ]);
        
        // Combine all jobs
        const allJobs = [...waiting, ...active, ...delayed];
        
        // Filter by sessionId and group by depth
        allJobs.forEach(job => {
          if (job.data && job.data.sessionId === sessionId) {
            const depth = job.data.depth || 0;
            
            if (!depthStats[depth]) {
              depthStats[depth] = {
                depth,
                inQueue: 0,
                waiting: 0,
                active: 0,
                delayed: 0
              };
            }
            
            depthStats[depth].inQueue++;
            
            // Count by state
            if (waiting.includes(job)) depthStats[depth].waiting++;
            else if (active.includes(job)) depthStats[depth].active++;
            else if (delayed.includes(job)) depthStats[depth].delayed++;
          }
        });
      }
      
      // Convert to array and sort by depth
      return Object.values(depthStats).sort((a, b) => a.depth - b.depth);
    } catch (error) {
      logger.error('Error getting queue stats by depth:', error);
      return [];
    }
  },

  /**
   * Get all queues
   */
  getAllQueues() {
    return queues;
  }
};

module.exports = {
  queues,
  queueManager
};