const mongoose = require('mongoose');
const RootProfileScraped = require('../src/models/RootProfileScraped');

async function checkProfile() {
    await mongoose.connect('mongodb://localhost:27017/instagram-scraper');
    
    const profile = await RootProfileScraped.findOne({ username: 'soy_loruga' }).sort('-createdAt');
    
    console.log('Profile found:', profile ? 'Yes' : 'No');
    
    if (profile) {
        console.log('Status:', profile.status);
        console.log('Session ID:', profile.sessionId);
        console.log('Has profileData:', !!profile.profileData);
        console.log('Profile URL:', profile.profileUrl);
        
        if (profile.profileData) {
            console.log('Related profiles count:', profile.profileData.relatedProfiles?.length || 0);
            console.log('Scraped at:', profile.scrapedAt);
        }
        
        if (profile.error) {
            console.log('Error:', profile.error.message);
        }
    }
    
    // Check all profiles for this user
    const allProfiles = await RootProfileScraped.find({ username: 'soy_loruga' });
    console.log('\nTotal soy_loruga profiles in database:', allProfiles.length);
    
    allProfiles.forEach((p, i) => {
        console.log(`\nProfile ${i + 1}:`);
        console.log('  Session:', p.sessionId);
        console.log('  Status:', p.status);
        console.log('  Created:', p.createdAt);
    });
    
    await mongoose.disconnect();
}

checkProfile().catch(console.error);