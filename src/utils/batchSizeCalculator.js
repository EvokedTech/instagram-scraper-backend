/**
 * Calculate batch size based on depth level
 * @param {number} depth - Current depth level
 * @returns {number} Batch size for the given depth
 */
function getBatchSizeForDepth(depth) {
  if (depth === 0) return 20;  // Root profiles
  if (depth === 1) return 20;  // Depth 1
  if (depth === 2) return 50;  // Depth 2
  return 100;                   // Depth 3 and beyond
}

/**
 * Calculate Apify batch size based on depth
 * For API calls, we may want smaller batches to avoid timeouts
 * @param {number} depth - Current depth level
 * @returns {number} Apify batch size
 */
function getApifyBatchSizeForDepth(depth) {
  if (depth === 0) return 10;  // Root profiles
  if (depth === 1) return 10;  // Depth 1
  if (depth === 2) return 20;  // Depth 2
  return 30;                   // Depth 3 and beyond
}

module.exports = {
  getBatchSizeForDepth,
  getApifyBatchSizeForDepth
};