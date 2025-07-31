const axios = require('axios');
const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5000';
const API_URL = `${BACKEND_URL}/api`;

// Test session configuration
const testSession = {
  name: 'Dashboard Test - Abel Pirela',
  description: 'Testing real-time dashboard with Abel Pirela profile',
  rootProfiles: [
    'https://www.instagram.com/abelpirela'
  ],
  config: {
    maxDepth: 2,
    maxProfilesPerDepth: 5,
    analysisEnabled: true
  }
};

// Connect to WebSocket
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
});

// Event tracking
const events = {
  sessionProgress: [],
  profileUpdates: [],
  depthCompleted: [],
  queueUpdates: [],
  errors: []
};

console.log('🚀 Starting Real-time Dashboard Test with Abel Pirela Profile\n');
console.log('📊 Configuration:');
console.log(`   - Profile: ${testSession.rootProfiles[0]}`);
console.log(`   - Max Depth: ${testSession.config.maxDepth}`);
console.log(`   - Profiles per Depth: ${testSession.config.maxProfilesPerDepth}\n`);

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ WebSocket connected successfully\n');
  socket.emit('subscribe:system');
});

socket.on('disconnect', (reason) => {
  console.log('❌ WebSocket disconnected:', reason);
});

// Session events
socket.on('session:progress', (data) => {
  events.sessionProgress.push(data);
  console.log(`📊 Progress: ${data.progress}% | Scraped: ${data.scrapedProfiles}/${data.totalProfiles} | Depth: ${data.currentDepth}`);
});

socket.on('session:statusChanged', (data) => {
  console.log(`🔄 Session Status: ${data.status}`);
});

socket.on('session:depthCompleted', (data) => {
  events.depthCompleted.push(data);
  console.log(`✅ Depth ${data.depth} completed! Profiles scraped: ${data.profilesScraped}`);
});

// Profile events
socket.on('profile:scraped', (data) => {
  events.profileUpdates.push(data);
  console.log(`✅ Scraped: @${data.username} (depth ${data.depth})`);
});

socket.on('profile:failed', (data) => {
  events.errors.push(data);
  console.log(`❌ Failed: @${data.username} - ${data.error}`);
});

socket.on('profile:statusUpdate', (data) => {
  if (data.status === 'scraping') {
    console.log(`🔄 Scraping: @${data.username} (depth ${data.depth})`);
  }
});

// Queue events
socket.on('queue:statusUpdate', (data) => {
  events.queueUpdates.push(data);
  if (data.active > 0 || data.waiting > 0) {
    console.log(`📦 Queue [${data.type}]: ${data.active} active, ${data.waiting} waiting`);
  }
});

// Batch processing events
socket.on('batch:processing', (data) => {
  console.log(`🔄 Batch Processing: ${data.processedCount}/${data.totalCount} at depth ${data.depth}`);
});

// Error events
socket.on('system:error', (data) => {
  events.errors.push(data);
  console.log(`❌ System Error: ${data.error}`);
});

async function createAndStartSession() {
  try {
    // Wait for socket connection
    await new Promise(resolve => {
      if (socket.connected) resolve();
      else socket.on('connect', resolve);
    });

    console.log('\n📝 Creating session...');
    
    // Create session
    const createResponse = await axios.post(`${API_URL}/sessions`, testSession);
    const session = createResponse.data;
    console.log(`✅ Session created: ${session._id}`);
    console.log(`   Name: ${session.name}`);
    console.log(`   Root Profile: ${session.rootProfiles[0]}\n`);

    // Subscribe to session events
    socket.emit('subscribe:session', session._id);

    // Start the session
    console.log('▶️  Starting session...');
    await axios.post(`${API_URL}/sessions/${session._id}/start`);
    console.log('✅ Session started successfully!\n');

    // Open dashboard in browser
    console.log('🌐 Dashboard URLs:');
    console.log(`   Overview: http://localhost:3000/dashboard`);
    console.log(`   Session Details: http://localhost:3000/dashboard/sessions/${session._id}\n`);

    // Monitor the session
    console.log('📊 Monitoring session progress...\n');
    
    let lastProgress = 0;
    const monitoringInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`${API_URL}/sessions/${session._id}`);
        const currentSession = statusResponse.data;
        
        if (currentSession.progressPercentage > lastProgress) {
          lastProgress = currentSession.progressPercentage;
        }

        if (currentSession.status === 'completed') {
          clearInterval(monitoringInterval);
          await showFinalResults(session._id);
        } else if (currentSession.status === 'failed') {
          clearInterval(monitoringInterval);
          console.log('\n❌ Session failed!');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error checking session status:', error.message);
      }
    }, 5000);

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function showFinalResults(sessionId) {
  console.log('\n\n🎉 Session Completed!\n');
  console.log('📊 Final Results:');
  console.log('================\n');

  try {
    // Get final session data
    const sessionResponse = await axios.get(`${API_URL}/sessions/${sessionId}`);
    const session = sessionResponse.data;
    
    console.log(`Session: ${session.name}`);
    console.log(`Status: ${session.status}`);
    console.log(`Duration: ${session.duration || 'N/A'}`);
    console.log(`Progress: ${session.progressPercentage}%`);
    console.log(`Total Profiles Scraped: ${session.stats.scrapedProfiles}\n`);

    // Get detailed monitoring data
    const monitoringResponse = await axios.get(`${API_URL}/dashboard/session/${sessionId}`);
    const { depthStats, processingMetrics } = monitoringResponse.data;

    console.log('📊 Depth Breakdown:');
    depthStats.forEach(depth => {
      console.log(`   Depth ${depth.depth}: ${depth.scraped}/${depth.total} scraped (${depth.failed} failed)`);
    });

    console.log('\n⚡ Performance Metrics:');
    console.log(`   Processing Rate: ${processingMetrics.processingRate} profiles/min`);
    console.log(`   Success Rate: ${processingMetrics.successRate}%`);
    console.log(`   API Credits Used: ${processingMetrics.apiCreditsUsed}`);

    console.log('\n📊 Event Summary:');
    console.log(`   Progress Updates: ${events.sessionProgress.length}`);
    console.log(`   Profile Updates: ${events.profileUpdates.length}`);
    console.log(`   Queue Updates: ${events.queueUpdates.length}`);
    console.log(`   Errors: ${events.errors.length}`);

    console.log('\n✅ Test completed successfully!');
    console.log(`\n🌐 View full details at: http://localhost:3000/dashboard/sessions/${sessionId}`);
    
  } catch (error) {
    console.error('Error fetching final results:', error.message);
  }

  socket.disconnect();
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted by user');
  socket.disconnect();
  process.exit(0);
});

// Start the test
createAndStartSession();