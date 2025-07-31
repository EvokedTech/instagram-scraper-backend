const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function createAndStartSession() {
  try {
    console.log('🚀 Creating session for @abelpirela\n');

    // Create unique session name with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionData = {
      name: `Abel Pirela Dashboard Test - ${timestamp}`,
      description: 'Testing real-time dashboard features',
      rootProfiles: ['https://www.instagram.com/abelpirela'],
      config: {
        maxDepth: 2,
        maxProfilesPerDepth: 5,
        analysisEnabled: true
      }
    };

    console.log('📋 Session Configuration:');
    console.log(`   Profile: @abelpirela`);
    console.log(`   Max Depth: ${sessionData.config.maxDepth}`);
    console.log(`   Profiles per Depth: ${sessionData.config.maxProfilesPerDepth}`);
    console.log(`   Expected Max Profiles: ${1 + 5 + (5 * 5)} = 31\n`);

    // Create session
    console.log('📝 Creating session...');
    const createResponse = await axios.post(`${API_URL}/sessions`, sessionData);
    const session = createResponse.data.data || createResponse.data;
    
    console.log('✅ Session created successfully!');
    console.log(`   ID: ${session._id || session.id}`);
    console.log(`   Name: ${session.name}\n`);

    const sessionId = session._id || session.id;

    // Start processing
    console.log('▶️  Starting session processing...');
    try {
      await axios.post(`${API_URL}/sessions/${sessionId}/queue-process`);
      console.log('✅ Session is now processing!\n');
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        console.log('✅ Session processing started (connection closed by server)\n');
      } else {
        throw error;
      }
    }

    // Display dashboard URLs
    console.log('🌐 VIEW YOUR SESSION IN REAL-TIME:');
    console.log('=====================================\n');
    
    console.log('1️⃣  Dashboard Overview:');
    console.log(`   http://localhost:3000/dashboard\n`);
    
    console.log('2️⃣  Session Details (Real-time monitoring):');
    console.log(`   http://localhost:3000/dashboard/sessions/${sessionId}\n`);
    
    console.log('📊 FEATURES TO OBSERVE:');
    console.log('   • Real-time progress bar updates');
    console.log('   • Depth-by-depth progress cards');
    console.log('   • Live profile status changes (pending → scraping → scraped)');
    console.log('   • Processing metrics (profiles/min, ETA, success rate)');
    console.log('   • Current batch processing info');
    console.log('   • WebSocket connection indicator (green "Live" badge)');
    console.log('   • Queue status updates\n');

    console.log('🔍 MONITORING TIPS:');
    console.log('   • Open browser DevTools → Network → WS to see WebSocket messages');
    console.log('   • Watch the progress percentage increase in real-time');
    console.log('   • Click on depth cards to filter profiles by depth');
    console.log('   • Use the search box to find specific profiles\n');

    // Check session status
    console.log('📈 Checking initial status...');
    const statusResponse = await axios.get(`${API_URL}/sessions/${sessionId}`);
    const currentStatus = statusResponse.data.data || statusResponse.data;
    console.log(`   Status: ${currentStatus.status || currentStatus.session?.status}`);
    console.log(`   Progress: ${currentStatus.progressPercentage || currentStatus.session?.progressPercentage || 0}%\n`);

    console.log('✨ Session is running! Open the URLs above to watch it in action.');

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error('\nMake sure:');
    console.error('1. Backend is running (npm start in backend folder)');
    console.error('2. Redis is running (redis-server)');
    console.error('3. MongoDB is running');
    process.exit(1);
  }
}

// Run the script
createAndStartSession();