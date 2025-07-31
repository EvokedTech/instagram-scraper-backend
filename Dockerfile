# Use lightweight Alpine image
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Remove puppeteer from dependencies before install to speed up build
RUN sed -i '/"puppeteer":/d' package.json

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Add non-root user for security
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /usr/src/app
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/index.js"]