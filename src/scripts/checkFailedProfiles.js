const profileCheckService = require('../services/profileCheckService');
const axios = require('axios');

const failedProfiles = [
  'o2.erikk',
  'aalantx',
  'yoboykenek',
  '_benterry',
  '_.jxssicax',
  'conniegrace',
  'hannahtoolex',
  'elliemaerice',
  'ameliesaupe',
  'bellaaellis',
  'rubyoliviab',
  'anaisfxo',
  'fallonoconnnor',
  'nelavey',
  'victoriachessa',
  'eliejadeexx',
  'lanaartusa',
  'fabianaesposito',
  'melodi.mzd',
  'nikii.andrc',
  'summahmackay',
  'moniquee__e',
  'viktorija.chloe',
  'bellamai_x'
];

async function checkProfiles() {
  console.log('Checking failed profiles to understand why they failed...\n');
  
  const results = {
    exists: [],
    doesNotExist: [],
    private: [],
    public: [],
    error: []
  };
  
  for (const username of failedProfiles) {
    console.log(`Checking ${username}...`);
    
    try {
      // First, simple check if URL is accessible
      const url = `https://www.instagram.com/${username}/`;
      
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 5000,
          maxRedirects: 5
        });
        
        const html = response.data;
        
        // Check if profile exists
        if (html.includes('Sorry, this page isn\'t available') || 
            html.includes('The link you followed may be broken')) {
          console.log(`  ❌ ${username} - DOES NOT EXIST`);
          results.doesNotExist.push(username);
        }
        // Check if private
        else if (html.includes('This account is private') || 
                 html.includes('This Account is Private') ||
                 html.includes('"is_private":true')) {
          console.log(`  🔒 ${username} - PRIVATE ACCOUNT`);
          results.private.push(username);
          results.exists.push(username);
        }
        // Public profile
        else if (html.includes(`"username":"${username}"`) || 
                 html.includes(`@${username}`) ||
                 html.includes('follower_count') ||
                 html.includes('edge_followed_by')) {
          console.log(`  ✅ ${username} - PUBLIC & EXISTS`);
          results.public.push(username);
          results.exists.push(username);
        }
        else {
          console.log(`  ⚠️ ${username} - UNKNOWN STATUS`);
          results.error.push(username);
        }
        
      } catch (error) {
        if (error.response) {
          if (error.response.status === 404) {
            console.log(`  ❌ ${username} - DOES NOT EXIST (404)`);
            results.doesNotExist.push(username);
          } else if (error.response.status === 302 || error.response.status === 301) {
            console.log(`  ⚠️ ${username} - REDIRECTED (might not exist)`);
            results.doesNotExist.push(username);
          } else {
            console.log(`  ⚠️ ${username} - HTTP ERROR: ${error.response.status}`);
            results.error.push(username);
          }
        } else {
          console.log(`  ⚠️ ${username} - ERROR: ${error.message}`);
          results.error.push(username);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`  ⚠️ ${username} - UNEXPECTED ERROR: ${error.message}`);
      results.error.push(username);
    }
  }
  
  console.log('\n========================================');
  console.log('SUMMARY OF FAILED PROFILES:');
  console.log('========================================');
  console.log(`\n✅ PUBLIC PROFILES (${results.public.length}): Should have worked!`);
  results.public.forEach(u => console.log(`  - ${u}`));
  
  console.log(`\n🔒 PRIVATE PROFILES (${results.private.length}): Expected to fail`);
  results.private.forEach(u => console.log(`  - ${u}`));
  
  console.log(`\n❌ NON-EXISTENT PROFILES (${results.doesNotExist.length}): Username doesn't exist`);
  results.doesNotExist.forEach(u => console.log(`  - ${u}`));
  
  console.log(`\n⚠️ ERROR CHECKING (${results.error.length}): Could not verify`);
  results.error.forEach(u => console.log(`  - ${u}`));
  
  console.log('\n========================================');
  console.log('ANALYSIS:');
  console.log('========================================');
  
  if (results.public.length > 0) {
    console.log('\n🚨 PROBLEM DETECTED: Some profiles are PUBLIC but still failed!');
    console.log('Possible reasons:');
    console.log('1. Apify actor might be getting rate-limited by Instagram');
    console.log('2. The usernames might contain special characters that need encoding');
    console.log('3. Bulk processing might be causing timeouts');
    console.log('4. Instagram might be showing different content to Apify vs direct access');
    console.log('\nRECOMMENDATIONS:');
    console.log('- Process these profiles one at a time with longer delays');
    console.log('- Increase timeout settings in Apify');
    console.log('- Try a different Apify actor or proxy configuration');
  }
  
  if (results.doesNotExist.length > 0) {
    console.log('\n❌ These usernames do not exist on Instagram - no point retrying them');
  }
  
  if (results.private.length > 0) {
    console.log('\n🔒 These are private accounts - they will always fail with Apify');
  }
}

checkProfiles().catch(console.error);