/**
 * Webhook configuration
 *
 * This determines where analysis webhooks are sent.
 * By default, uses the internal webhook handler with the new AI service.
 */

const logger = require('../utils/logger');

// Determine the webhook URL based on environment
function getWebhookUrl() {
    // If USE_EXTERNAL_ANALYSIS is explicitly set to true, use the external analysis backend
    if (process.env.USE_EXTERNAL_ANALYSIS === 'true' && process.env.ANALYSIS_BACKEND_URL) {
        logger.info(`Using external analysis backend: ${process.env.ANALYSIS_BACKEND_URL}`);
        return `${process.env.ANALYSIS_BACKEND_URL}/api/analyze/webhook`;
    }

    // Otherwise, ALWAYS use the internal webhook handler (recommended)
    // This ensures we use internal analysis even if ANALYSIS_BACKEND_URL is set
    const port = process.env.PORT || 5002;
    const internalUrl = process.env.INTERNAL_WEBHOOK_URL ||
                       `http://localhost:${port}/api/analyze/webhook`;

    logger.info(`Using internal analysis webhook: ${internalUrl}`);
    return internalUrl;
}

module.exports = {
    // Make webhookUrl a getter so it's evaluated at runtime, not at module load time
    get webhookUrl() {
        return getWebhookUrl();
    },
    get useInternalAnalysis() {
        return process.env.USE_EXTERNAL_ANALYSIS !== 'true';
    }
};