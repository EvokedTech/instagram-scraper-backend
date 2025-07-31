const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/instagram-scraper', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const RootProfileScraped = require('../src/models/RootProfileScraped');

async function checkRootProfile() {
    try {
        // Find the most recent soy_loruga profile
        const profiles = await RootProfileScraped.find({
            username: 'soy_loruga'
        }).sort({ createdAt: -1 }).limit(2);
        
        console.log('Recent soy_loruga profiles in database:\n');
        
        for (const profile of profiles) {
            console.log(`Profile ID: ${profile._id}`);
            console.log(`Session ID: ${profile.sessionId}`);
            console.log(`Status: ${profile.status}`);
            console.log(`Created: ${profile.createdAt}`);
            console.log(`Has profile data: ${!!profile.profileData}`);
            
            if (profile.profileData) {
                console.log(`Related profiles count: ${profile.profileData.relatedProfiles?.length || 0}`);
                if (profile.profileData.relatedProfiles?.length > 0) {
                    console.log(`First 5 related: ${profile.profileData.relatedProfiles.slice(0, 5).map(p => p.username || p.userName).join(', ')}`);
                }
            }
            console.log('---\n');
        }
        
        mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        mongoose.disconnect();
    }
}

checkRootProfile();