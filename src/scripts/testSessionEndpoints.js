const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test data
const testSessions = [
  {
    name: "Fashion Bloggers Network Analysis",
    description: "Analyzing fashion blogger networks and engagement",
    rootProfiles: [
      "sof_alexa",
      "@fashionblogger123",
      "https://www.instagram.com/style_influencer/",
      "beauty_guru_2024"
    ],
    config: {
      maxDepth: 3,
      maxProfilesPerDepth: 50,
      analysisEnabled: true
    }
  },
  {
    name: "Tech Influencers Study",
    description: "Studying tech influencer connections",
    rootProfiles: [
      "tech_reviewer",
      "gadget_guru",
      "https://instagram.com/coding_wizard/"
    ],
    config: {
      maxDepth: 2,
      maxProfilesPerDepth: 100
    }
  }
];

// Helper function to log responses
const logResponse = (title, response) => {
  console.log(`\n=== ${title} ===`);
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
};

// Helper function to log errors
const logError = (title, error) => {
  console.log(`\n=== ${title} (ERROR) ===`);
  if (error.response) {
    console.log('Status:', error.response.status);
    console.log('Error:', error.response.data);
  } else {
    console.log('Error:', error.message);
  }
};

async function testSessionEndpoints() {
  let createdSessionId = null;
  
  try {
    console.log('Starting Session Endpoint Tests...\n');
    
    // Test 1: Create a session with valid data
    console.log('\n========== TEST 1: Create Valid Session ==========');
    try {
      const response = await axios.post(`${BASE_URL}/sessions`, testSessions[0]);
      logResponse('Create Session Success', response);
      createdSessionId = response.data.data._id;
    } catch (error) {
      logError('Create Session', error);
    }
    
    // Test 2: Try to create duplicate session
    console.log('\n========== TEST 2: Create Duplicate Session ==========');
    try {
      const response = await axios.post(`${BASE_URL}/sessions`, testSessions[0]);
      logResponse('Create Duplicate Session', response);
    } catch (error) {
      logError('Create Duplicate Session', error);
    }
    
    // Test 3: Create session with invalid profiles
    console.log('\n========== TEST 3: Create Session with Invalid Profiles ==========');
    try {
      const invalidSession = {
        name: "Invalid Session Test",
        rootProfiles: [
          "valid_username",
          "invalid@#$%username",
          "http://notinstagram.com/user"
        ]
      };
      const response = await axios.post(`${BASE_URL}/sessions`, invalidSession);
      logResponse('Create Invalid Session', response);
    } catch (error) {
      logError('Create Invalid Session', error);
    }
    
    // Test 4: Get all sessions
    console.log('\n========== TEST 4: Get All Sessions ==========');
    try {
      const response = await axios.get(`${BASE_URL}/sessions`);
      logResponse('Get All Sessions', response);
    } catch (error) {
      logError('Get All Sessions', error);
    }
    
    // Test 5: Get all sessions with pagination
    console.log('\n========== TEST 5: Get Sessions with Pagination ==========');
    try {
      const response = await axios.get(`${BASE_URL}/sessions?limit=5&offset=0&status=pending`);
      logResponse('Get Sessions with Pagination', response);
    } catch (error) {
      logError('Get Sessions with Pagination', error);
    }
    
    // Test 6: Get session by ID
    console.log('\n========== TEST 6: Get Session by ID ==========');
    if (createdSessionId) {
      try {
        const response = await axios.get(`${BASE_URL}/sessions/${createdSessionId}`);
        logResponse('Get Session by ID', response);
      } catch (error) {
        logError('Get Session by ID', error);
      }
    }
    
    // Test 7: Get non-existent session
    console.log('\n========== TEST 7: Get Non-existent Session ==========');
    try {
      const response = await axios.get(`${BASE_URL}/sessions/507f1f77bcf86cd799439011`);
      logResponse('Get Non-existent Session', response);
    } catch (error) {
      logError('Get Non-existent Session', error);
    }
    
    // Test 8: Update session status to running
    console.log('\n========== TEST 8: Start Session (Update to Running) ==========');
    if (createdSessionId) {
      try {
        const response = await axios.put(`${BASE_URL}/sessions/${createdSessionId}/status`, {
          status: 'running'
        });
        logResponse('Start Session', response);
      } catch (error) {
        logError('Start Session', error);
      }
    }
    
    // Test 9: Pause session
    console.log('\n========== TEST 9: Pause Session ==========');
    if (createdSessionId) {
      try {
        const response = await axios.put(`${BASE_URL}/sessions/${createdSessionId}/status`, {
          status: 'paused'
        });
        logResponse('Pause Session', response);
      } catch (error) {
        logError('Pause Session', error);
      }
    }
    
    // Test 10: Invalid status transition
    console.log('\n========== TEST 10: Invalid Status Transition ==========');
    if (createdSessionId) {
      try {
        const response = await axios.put(`${BASE_URL}/sessions/${createdSessionId}/status`, {
          status: 'pending'
        });
        logResponse('Invalid Status Transition', response);
      } catch (error) {
        logError('Invalid Status Transition', error);
      }
    }
    
    // Test 11: Get session statistics
    console.log('\n========== TEST 11: Get Session Statistics ==========');
    if (createdSessionId) {
      try {
        const response = await axios.get(`${BASE_URL}/sessions/${createdSessionId}/stats`);
        logResponse('Get Session Stats', response);
      } catch (error) {
        logError('Get Session Stats', error);
      }
    }
    
    // Test 12: Create another session
    console.log('\n========== TEST 12: Create Another Session ==========');
    try {
      const response = await axios.post(`${BASE_URL}/sessions`, testSessions[1]);
      logResponse('Create Another Session', response);
    } catch (error) {
      logError('Create Another Session', error);
    }
    
    // Test 13: Test input validation - missing name
    console.log('\n========== TEST 13: Create Session without Name ==========');
    try {
      const response = await axios.post(`${BASE_URL}/sessions`, {
        rootProfiles: ["test_user"]
      });
      logResponse('Create Session without Name', response);
    } catch (error) {
      logError('Create Session without Name', error);
    }
    
    // Test 14: Test input validation - empty profiles
    console.log('\n========== TEST 14: Create Session with Empty Profiles ==========');
    try {
      const response = await axios.post(`${BASE_URL}/sessions`, {
        name: "Empty Profiles Test",
        rootProfiles: []
      });
      logResponse('Create Session with Empty Profiles', response);
    } catch (error) {
      logError('Create Session with Empty Profiles', error);
    }
    
    console.log('\n========== All Tests Completed ==========\n');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Check if server is running
axios.get(`${BASE_URL}/health`)
  .then(() => {
    console.log('Server is running. Starting tests...\n');
    testSessionEndpoints();
  })
  .catch(() => {
    console.error('Server is not running. Please start the server first.');
    console.error('Run: npm run dev');
  });