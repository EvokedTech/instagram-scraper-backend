const { Server } = require('socket.io');
const logger = require('../utils/logger');
const { setIO } = require('../socket');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedClients = new Map();
        this.sessionRooms = new Map(); // Maps sessionId to room
    }

    /**
     * Initialize Socket.IO server
     * @param {http.Server} server - HTTP server instance
     */
    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                credentials: true
            },
            pingTimeout: 60000, // 60 seconds
            pingInterval: 25000, // 25 seconds
            transports: ['websocket', 'polling'], // Allow both transports
            allowEIO3: true // Allow compatibility with older clients
        });

        // Set the IO instance for other modules to use
        setIO(this.io);

        this.setupEventHandlers();
        logger.info('Socket.IO server initialized');
    }

    /**
     * Setup Socket.IO event handlers
     */
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            logger.info(`New socket connection: ${socket.id}`);
            this.connectedClients.set(socket.id, {
                connectedAt: new Date(),
                sessionSubscriptions: new Set()
            });

            // Join dashboard room for general updates
            socket.join('dashboard');

            // Handle session subscription
            socket.on('subscribe:session', (sessionId) => {
                this.subscribeToSession(socket, sessionId);
            });

            // Handle session unsubscription
            socket.on('unsubscribe:session', (sessionId) => {
                this.unsubscribeFromSession(socket, sessionId);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                logger.info(`Socket disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });

            // Send initial connection success
            socket.emit('connected', {
                message: 'Connected to scraper dashboard',
                timestamp: new Date()
            });
        });
    }

    /**
     * Subscribe socket to session updates
     */
    subscribeToSession(socket, sessionId) {
        const roomName = `session:${sessionId}`;
        socket.join(roomName);
        
        const client = this.connectedClients.get(socket.id);
        if (client) {
            client.sessionSubscriptions.add(sessionId);
        }

        logger.info(`Socket ${socket.id} subscribed to session ${sessionId}`);
        socket.emit('subscribed:session', { sessionId });
    }

    /**
     * Unsubscribe socket from session updates
     */
    unsubscribeFromSession(socket, sessionId) {
        const roomName = `session:${sessionId}`;
        socket.leave(roomName);
        
        const client = this.connectedClients.get(socket.id);
        if (client) {
            client.sessionSubscriptions.delete(sessionId);
        }

        logger.info(`Socket ${socket.id} unsubscribed from session ${sessionId}`);
        socket.emit('unsubscribed:session', { sessionId });
    }

    /**
     * Emit session progress update with throttling
     */
    emitSessionProgress(sessionId, progress) {
        // Throttle progress updates to max 1 per second per session
        const now = Date.now();
        const lastEmit = this.lastProgressEmit?.get(sessionId) || 0;
        
        if (now - lastEmit < 1000) {
            // Schedule deferred emit
            if (!this.deferredProgressEmits) {
                this.deferredProgressEmits = new Map();
            }
            this.deferredProgressEmits.set(sessionId, { progress, timestamp: new Date() });
            
            if (!this.progressEmitTimer) {
                this.progressEmitTimer = setTimeout(() => {
                    this.flushDeferredProgressEmits();
                }, 1000);
            }
            return;
        }
        
        if (!this.lastProgressEmit) {
            this.lastProgressEmit = new Map();
        }
        this.lastProgressEmit.set(sessionId, now);
        
        this.io.to(`session:${sessionId}`).emit('session:progress', {
            sessionId,
            progress,
            timestamp: new Date()
        });
    }
    
    /**
     * Flush deferred progress emits
     */
    flushDeferredProgressEmits() {
        if (!this.deferredProgressEmits || this.deferredProgressEmits.size === 0) {
            this.progressEmitTimer = null;
            return;
        }
        
        for (const [sessionId, data] of this.deferredProgressEmits) {
            this.io.to(`session:${sessionId}`).emit('session:progress', {
                sessionId,
                progress: data.progress,
                timestamp: data.timestamp
            });
        }
        
        this.deferredProgressEmits.clear();
        this.progressEmitTimer = null;
    }

    /**
     * Emit session status change
     */
    emitSessionStatusChange(sessionId, status, previousStatus) {
        this.io.to(`session:${sessionId}`).emit('session:status', {
            sessionId,
            status,
            previousStatus,
            timestamp: new Date()
        });

        // Also emit to dashboard room
        this.io.to('dashboard').emit('dashboard:session:status', {
            sessionId,
            status,
            previousStatus,
            timestamp: new Date()
        });
    }

    /**
     * Emit depth completion event
     */
    emitDepthComplete(sessionId, depth, stats) {
        this.io.to(`session:${sessionId}`).emit('session:depth:complete', {
            sessionId,
            depth,
            stats,
            timestamp: new Date()
        });
    }

    /**
     * Emit depth analysis completion event
     */
    emitDepthAnalysisComplete(sessionId, depth) {
        this.io.to(`session:${sessionId}`).emit('depth:analysis:complete', {
            sessionId,
            depth,
            timestamp: new Date()
        });
    }

    /**
     * Emit depth fully complete event (both scraping and analysis)
     */
    emitDepthFullyComplete(sessionId, depth) {
        this.io.to(`session:${sessionId}`).emit('depth:fully:complete', {
            sessionId,
            depth,
            timestamp: new Date()
        });
    }

    /**
     * Emit session auto-completion event
     */
    emitSessionComplete(sessionId) {
        this.io.to(`session:${sessionId}`).emit('session:auto:completed', {
            sessionId,
            timestamp: new Date()
        });
        
        // Also emit to dashboard
        this.io.to('dashboard').emit('dashboard:session:completed', {
            sessionId,
            timestamp: new Date()
        });
    }

    /**
     * Emit profile scraping status with batching
     */
    emitProfileStatus(sessionId, profileData) {
        // Batch profile status updates
        if (!this.profileStatusBatch) {
            this.profileStatusBatch = new Map();
        }
        
        if (!this.profileStatusBatch.has(sessionId)) {
            this.profileStatusBatch.set(sessionId, []);
        }
        
        this.profileStatusBatch.get(sessionId).push({
            ...profileData,
            timestamp: new Date()
        });
        
        // Emit batched updates every 500ms
        if (!this.profileBatchTimer) {
            this.profileBatchTimer = setTimeout(() => {
                this.flushProfileStatusBatch();
            }, 500);
        }
    }
    
    /**
     * Flush batched profile status updates
     */
    flushProfileStatusBatch() {
        if (!this.profileStatusBatch || this.profileStatusBatch.size === 0) {
            this.profileBatchTimer = null;
            return;
        }
        
        for (const [sessionId, profiles] of this.profileStatusBatch) {
            this.io.to(`session:${sessionId}`).emit('profile:statusBatch', {
                sessionId,
                profiles,
                timestamp: new Date()
            });
        }
        
        this.profileStatusBatch.clear();
        this.profileBatchTimer = null;
    }

    /**
     * Emit queue status update
     */
    emitQueueStatus(queueName, stats) {
        this.io.to('dashboard').emit('queue:status', {
            queueName,
            stats,
            timestamp: new Date()
        });
    }

    /**
     * Emit batch processing update
     */
    emitBatchUpdate(sessionId, batchData) {
        this.io.to(`session:${sessionId}`).emit('batch:update', {
            sessionId,
            ...batchData,
            timestamp: new Date()
        });
    }

    /**
     * Emit system metrics update
     */
    emitSystemMetrics(metrics) {
        this.io.to('dashboard').emit('system:metrics', {
            metrics,
            timestamp: new Date()
        });
    }

    /**
     * Emit error event
     */
    emitError(sessionId, error) {
        if (sessionId) {
            this.io.to(`session:${sessionId}`).emit('session:error', {
                sessionId,
                error: error.message || error,
                timestamp: new Date()
            });
        }
        
        // Also emit to dashboard
        this.io.to('dashboard').emit('dashboard:error', {
            sessionId,
            error: error.message || error,
            timestamp: new Date()
        });
    }

    /**
     * Get connected clients count
     */
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }

    /**
     * Get session subscribers count
     */
    getSessionSubscribersCount(sessionId) {
        const room = this.io.sockets.adapter.rooms.get(`session:${sessionId}`);
        return room ? room.size : 0;
    }
}

// Export singleton instance
module.exports = new SocketService();