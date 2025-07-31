const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const API_URL = `${BACKEND_URL}/api`;

// Test session data
const testSession = {
  name: 'Real-time Dashboard Test',
  description: 'Testing real-time dashboard functionality',
  rootProfiles: [
    'https://www.instagram.com/cristiano/',
    'https://www.instagram.com/leomessi/'
  ],
  config: {
    maxDepth: 2,
    maxProfilesPerDepth: 50,
    analysisEnabled: true
  }
};

// Connect to WebSocket
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
});

// Track events received
const eventsReceived = {
  connection: false,
  sessionProgress: 0,
  profileUpdates: 0,
  queueUpdates: 0,
  systemMetrics: 0,
  errors: 0
};

console.log('🚀 Starting Real-time Dashboard Test...\n');

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ WebSocket connected successfully');
  eventsReceived.connection = true;
  
  // Subscribe to system events
  socket.emit('subscribe:system');
  console.log('📡 Subscribed to system events');
});

socket.on('disconnect', (reason) => {
  console.log('❌ WebSocket disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
  eventsReceived.errors++;
});

// Session events
socket.on('session:progress', (data) => {
  eventsReceived.sessionProgress++;
  console.log(`📊 Session Progress: ${data.progress}% (${data.scrapedProfiles}/${data.totalProfiles})`);
});

socket.on('session:statusChanged', (data) => {
  console.log(`🔄 Session Status Changed: ${data.status}`);
});

socket.on('session:depthCompleted', (data) => {
  console.log(`✅ Depth ${data.depth} completed for session ${data.sessionId}`);
});

// Profile events
socket.on('profile:scraped', (data) => {
  eventsReceived.profileUpdates++;
  console.log(`✅ Profile scraped: @${data.username} (depth ${data.depth})`);
});

socket.on('profile:failed', (data) => {
  eventsReceived.profileUpdates++;
  console.log(`❌ Profile failed: @${data.username} - ${data.error}`);
});

socket.on('profile:statusUpdate', (data) => {
  eventsReceived.profileUpdates++;
  console.log(`📝 Profile status update: @${data.username} -> ${data.status}`);
});

// Queue events
socket.on('queue:statusUpdate', (data) => {
  eventsReceived.queueUpdates++;
  console.log(`📦 Queue Update [${data.type}]: ${data.active} active, ${data.waiting} waiting`);
});

// System events
socket.on('system:metrics', (data) => {
  eventsReceived.systemMetrics++;
  console.log(`📈 System Metrics: ${data.totalSessions} sessions, ${data.processingRate}/min`);
});

socket.on('system:notification', (data) => {
  console.log(`🔔 System Notification: ${data.message}`);
});

// Create and start a test session
async function runTest() {
  try {
    // Wait for socket connection
    await new Promise(resolve => {
      if (socket.connected) resolve();
      else socket.on('connect', resolve);
    });

    console.log('\n📝 Creating test session...');
    
    // Create session via API
    const createResponse = await axios.post(`${API_URL}/sessions`, testSession);
    const sessionId = createResponse.data._id;
    console.log(`✅ Session created: ${sessionId}`);

    // Subscribe to session events
    socket.emit('subscribe:session', sessionId);
    console.log(`📡 Subscribed to session ${sessionId} events`);

    // Start the session
    console.log('\n▶️  Starting session...');
    await axios.post(`${API_URL}/sessions/${sessionId}/start`);

    // Monitor for 30 seconds
    console.log('\n🔍 Monitoring real-time events for 30 seconds...\n');
    
    let monitoringTime = 30;
    const interval = setInterval(() => {
      monitoringTime--;
      if (monitoringTime <= 0) {
        clearInterval(interval);
        completeTest(sessionId);
      }
    }, 1000);

  } catch (error) {
    console.error('❌ Test error:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Complete the test and show results
async function completeTest(sessionId) {
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log(`✅ WebSocket Connection: ${eventsReceived.connection ? 'Success' : 'Failed'}`);
  console.log(`📊 Session Progress Events: ${eventsReceived.sessionProgress}`);
  console.log(`👤 Profile Update Events: ${eventsReceived.profileUpdates}`);
  console.log(`📦 Queue Update Events: ${eventsReceived.queueUpdates}`);
  console.log(`📈 System Metrics Events: ${eventsReceived.systemMetrics}`);
  console.log(`❌ Errors: ${eventsReceived.errors}`);

  // Fetch final session status
  try {
    const sessionResponse = await axios.get(`${API_URL}/sessions/${sessionId}`);
    const session = sessionResponse.data;
    console.log('\n📋 Final Session Status:');
    console.log(`  Status: ${session.status}`);
    console.log(`  Progress: ${session.progressPercentage}%`);
    console.log(`  Profiles Scraped: ${session.stats.scrapedProfiles}`);
    console.log(`  Current Depth: ${session.stats.currentDepth}`);

    // Fetch dashboard data
    const dashboardResponse = await axios.get(`${API_URL}/dashboard/session/${sessionId}`);
    const { depthStats } = dashboardResponse.data;
    console.log('\n📊 Depth Statistics:');
    depthStats.forEach(depth => {
      console.log(`  Depth ${depth.depth}: ${depth.scraped}/${depth.total} scraped`);
    });

    // Clean up - stop the session
    console.log('\n🧹 Cleaning up...');
    await axios.post(`${API_URL}/sessions/${sessionId}/stop`);
    console.log('✅ Session stopped');

  } catch (error) {
    console.error('❌ Error fetching final status:', error.message);
  }

  // Disconnect and exit
  socket.disconnect();
  console.log('\n✅ Test completed successfully!');
  
  // Show test summary
  const totalEvents = eventsReceived.sessionProgress + eventsReceived.profileUpdates + 
                     eventsReceived.queueUpdates + eventsReceived.systemMetrics;
  
  if (totalEvents > 0) {
    console.log(`\n🎉 Real-time functionality is working! Received ${totalEvents} events.`);
  } else {
    console.log('\n⚠️  No real-time events received. Please check WebSocket configuration.');
  }
  
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted');
  socket.disconnect();
  process.exit(0);
});

// Run the test
runTest();