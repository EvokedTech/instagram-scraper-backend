/**
 * Check if profiles have summaries
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const profilesToCheck = [
  'justyna.e36', 'emme.rxh', 'olciaa_.okk', 'lxna.ofx',
  'michelliii.ktr', 'lisaschafberg', 'weber_ovaa', 'xevelonax',
  'czarnulkaa_003', 'loxixe.tmb', 'nurillo_qurbonov_', 'nurmetbe',
  'malika_rahmonova_officalll', 'maxamadjonov_010', '_komron_0905',
  'shamsidd1n007', 'stroitelstva_remont_samarkand', 'vakhobov.009',
  'blkkstar', 'millieenaro'
];

async function checkProfiles() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('instagram-scraper');
    const collection = db.collection('analyzed_relatedprofiles');

    console.log('📊 CHECKING PROFILE SUMMARIES');
    console.log('=' .repeat(50));

    let withSummary = 0;
    let withoutSummary = 0;
    const missing = [];

    for (const username of profilesToCheck) {
      const profile = await collection.findOne({ username });
      if (profile) {
        if (profile.profileSummary && profile.profileSummary.length > 0) {
          console.log('✅', username.padEnd(30), '- Has summary (' + profile.profileSummary.length + ' insights)');
          withSummary++;
        } else {
          console.log('❌', username.padEnd(30), '- NO SUMMARY');
          withoutSummary++;
          missing.push(username);
        }
      } else {
        console.log('⚠️ ', username.padEnd(30), '- Not found in analyzed collection');
        withoutSummary++;
        missing.push(username);
      }
    }

    console.log('\n' + '=' .repeat(50));
    console.log('SUMMARY:');
    console.log('✅ With summaries:', withSummary + '/' + profilesToCheck.length);
    console.log('❌ Without summaries:', withoutSummary + '/' + profilesToCheck.length);

    if (missing.length > 0) {
      console.log('\n🔍 Profiles needing re-analysis:');
      missing.forEach(username => console.log('  -', username));
    } else {
      console.log('\n🎉 ALL PROFILES ARE UP TO DATE!');
    }

    console.log('=' .repeat(50));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

checkProfiles();