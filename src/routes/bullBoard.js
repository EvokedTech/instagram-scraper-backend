const { router, setQueues, BullAdapter } = require('bull-board');
const { queues } = require('../queues/queueManager');

// Set up Bull Board with all queues
setQueues(
  Object.values(queues).map(queue => new BullAdapter(queue))
);

module.exports = { router };