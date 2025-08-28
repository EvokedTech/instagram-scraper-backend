require('dotenv').config();
const mongoose = require('mongoose');
const RootProfileScraped = require('../models/RootProfileScraped');
const axios = require('axios');

async function verifyFailedProfiles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Getting all failed profiles...\n');
    
    // Get all failed profiles
    const failedProfiles = await RootProfileScraped.find({ 
      status: 'failed' 
    }).select('username profileUrl');
    
    console.log(`Found ${failedProfiles.length} failed profiles. Checking first 10...\n`);
    
    const results = {
      exists: [],
      private: [],
      notFound: [],
      error: []
    };
    
    // Check first 10 profiles
    const profilesToCheck = failedProfiles.slice(0, 10);
    
    for (const profile of profilesToCheck) {
      const username = profile.username;
      console.log(`Checking ${username}...`);
      
      try {
        const response = await axios.get(`https://www.instagram.com/${username}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 5000,
          validateStatus: (status) => status < 500
        });
        
        if (response.status === 404) {
          console.log(`  ❌ DOES NOT EXIST`);
          results.notFound.push(username);
        } else if (response.data.includes('This account is private') || 
                   response.data.includes('"is_private":true')) {
          console.log(`  🔒 PRIVATE`);
          results.private.push(username);
        } else if (response.data.includes(`"username":"${username}"`) ||
                   response.data.includes('edge_followed_by')) {
          console.log(`  ✅ PUBLIC & EXISTS`);
          results.exists.push(username);
        } else {
          console.log(`  ⚠️ UNKNOWN`);
          results.error.push(username);
        }
        
      } catch (error) {
        console.log(`  ⚠️ ERROR: ${error.message}`);
        results.error.push(username);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n========================================');
    console.log('RESULTS:');
    console.log('========================================');
    console.log(`✅ PUBLIC & EXIST: ${results.exists.length}`);
    results.exists.forEach(u => console.log(`  - ${u}`));
    console.log(`\n🔒 PRIVATE: ${results.private.length}`);
    results.private.forEach(u => console.log(`  - ${u}`));
    console.log(`\n❌ NOT FOUND: ${results.notFound.length}`);
    results.notFound.forEach(u => console.log(`  - ${u}`));
    
    if (results.exists.length > 0) {
      console.log('\n🚨 PROBLEM: These profiles EXIST and are PUBLIC but still failed!');
      console.log('This confirms the issue is with Apify configuration.');
      console.log('\nSOLUTION: Retry these with the updated configuration');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyFailedProfiles();