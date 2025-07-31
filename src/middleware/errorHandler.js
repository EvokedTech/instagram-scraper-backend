const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    error: err
  });

  // Set default error values
  let status = err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate entry';
  } else if (err.name === 'MongoNetworkError') {
    status = 503;
    message = 'Database connection error';
  }

  // Send error response
  try {
    res.status(status).json({
      success: false,
      error: {
        message,
        status,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: err.stack,
          // Avoid circular JSON by only including simple error properties
          details: {
            name: err.name,
            code: err.code,
            syscall: err.syscall
          }
        })
      },
      timestamp: new Date().toISOString()
    });
  } catch (jsonError) {
    // Fallback for circular structure errors
    res.status(status).json({
      success: false,
      error: {
        message,
        status
      },
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = errorHandler;