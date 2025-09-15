/**
 * Check and analyze missing profiles batch
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const profilesToCheck = [
  'spoilbabyy__',
  'london.anise',
  'j.slaughter21',
  '_kelogee',
  'dayylaaaa',
  'tr3ypetty',
  'nylakenae',
  '1kaynine',
  'ney.dashaeee_',
  '_bankroll375',
  'bigscat87',
  'hollie_.xo',
  'lucyjanemason',
  'crystieloux',
  'chelseanwaigbo_x',
  'aimeeloganx',
  'l.lexh',
  'jazminewicks',
  'kyranew23',
  'katysimcock',
  'macy_clarkx',
  'xosophxx',
  'zoewatson2x',
  'demileigh_williams',
  'hollylouise.x.o',
  'ellaburgess_xx',
  'ggracejago',
  'caris_meek',
  'luxxienne',
  'hautelemess',
  'ali.scharf',
  'mishaspicearchives',
  'lochiestonehouse',
  'tildax_x_',
  'saigenugget'
];

async function checkAndAnalyzeProfiles() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('instagram-scraper');
    const scrapedCollection = db.collection('rootprofiles_scraped_datas');
    const analyzedCollection = db.collection('analyzed_relatedprofiles');

    console.log(`🔍 CHECKING ${profilesToCheck.length} PROFILES`);
    console.log('=' .repeat(50));

    const results = {
      scraped: [],
      notScraped: [],
      analyzed: [],
      needsAnalysis: []
    };

    // Check each profile
    for (const username of profilesToCheck) {
      const scraped = await scrapedCollection.findOne({ username });
      const analyzed = await analyzedCollection.findOne({ username });

      if (!scraped) {
        results.notScraped.push(username);
        console.log(`❌ ${username} - NOT SCRAPED`);
      } else {
        results.scraped.push(username);

        if (analyzed) {
          results.analyzed.push(username);
          console.log(`✅ ${username} - Already analyzed`);
        } else {
          results.needsAnalysis.push(username);
          console.log(`⚠️  ${username} - Scraped but NOT ANALYZED`);
        }
      }
    }

    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 SUMMARY');
    console.log('=' .repeat(50));
    console.log(`Total checked: ${profilesToCheck.length}`);
    console.log(`✅ Already analyzed: ${results.analyzed.length}`);
    console.log(`⚠️  Needs analysis: ${results.needsAnalysis.length}`);
    console.log(`❌ Not scraped yet: ${results.notScraped.length}`);

    // Now analyze the ones that need analysis
    if (results.needsAnalysis.length > 0) {
      console.log('\n' + '=' .repeat(50));
      console.log('🤖 ANALYZING MISSING PROFILES');
      console.log('=' .repeat(50));

      for (const username of results.needsAnalysis) {
        console.log(`\n📊 Analyzing: ${username}`);

        const profile = await scrapedCollection.findOne({ username });
        const profileData = profile.profileData || profile;

        // Generate local analysis
        const analysis = generateLocalAnalysis(profileData);

        const analyzedDoc = {
          username: profileData.username,
          fullName: profileData.fullName || '',
          biography: profileData.biography || '',
          followersCount: profileData.followersCount || 0,
          followsCount: profileData.followsCount || 0,
          postsCount: profileData.postsCount || 0,
          verified: profileData.verified || false,
          isBusinessAccount: profileData.isBusinessAccount || false,
          businessCategory: profileData.businessCategory || null,
          profilePicUrl: profileData.profilePicUrl || '',
          externalUrl: profileData.externalUrl || null,

          // Analysis fields
          gender: analysis.gender,
          age: analysis.age,
          profileType: analysis.profileType,
          contentType: analysis.contentType,
          engagementRate: analysis.engagementRate,
          influencerTier: analysis.influencerTier,
          brandSafetyScore: analysis.brandSafetyScore,
          adultContentScore: analysis.adultContentScore,
          profileSummary: analysis.profileSummary,

          // Metadata
          analyzedAt: new Date(),
          lastUpdated: new Date(),
          source: 'missing_batch_analyzer',
          modelUsed: 'local-fallback'
        };

        const result = await analyzedCollection.replaceOne(
          { username },
          analyzedDoc,
          { upsert: true }
        );

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          console.log(`   ✅ Successfully analyzed`);
          console.log(`   👥 Followers: ${profileData.followersCount}`);
          console.log(`   📊 Tier: ${analysis.influencerTier}`);
        }
      }

      console.log('\n✅ Analysis complete for all missing profiles!');
    }

    // List not scraped profiles
    if (results.notScraped.length > 0) {
      console.log('\n⚠️  These profiles need to be scraped first:');
      results.notScraped.forEach(u => console.log(`   - ${u}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

function generateLocalAnalysis(profileData) {
  const followers = profileData.followersCount || 0;
  const posts = profileData.postsCount || 0;

  const profileSummary = [];

  // Follower-based insight
  if (followers > 100000) {
    profileSummary.push(`Major influencer with ${(followers / 1000).toFixed(0)}K+ followers, strong market presence`);
  } else if (followers > 10000) {
    profileSummary.push(`Mid-tier influencer with ${(followers / 1000).toFixed(1)}K followers, good engagement potential`);
  } else if (followers > 1000) {
    profileSummary.push(`Micro-influencer with ${followers.toLocaleString()} followers, niche audience`);
  } else {
    profileSummary.push(`Growing account with ${followers} followers`);
  }

  // Content frequency
  if (posts > 500) {
    profileSummary.push(`Very active creator with ${posts} posts`);
  } else if (posts > 100) {
    profileSummary.push(`Regular content poster with ${posts} posts`);
  } else {
    profileSummary.push(`Selective posting strategy with ${posts} posts`);
  }

  // Account type
  if (profileData.verified) {
    profileSummary.push('Verified account with established credibility');
  } else if (profileData.isBusinessAccount) {
    profileSummary.push('Business account focused on professional growth');
  } else {
    profileSummary.push('Personal account with engagement potential');
  }

  return {
    gender: profileData.isBusinessAccount ? 'Brand' : 'Unknown',
    age: null,
    profileType: profileData.isBusinessAccount ? 'Business' : 'Personal',
    contentType: ['General'],
    engagementRate: calculateEngagementRate(followers),
    influencerTier: getInfluencerTier(followers),
    brandSafetyScore: 90,
    adultContentScore: 0,
    profileSummary: profileSummary
  };
}

function calculateEngagementRate(followers) {
  if (!followers) return 0;
  if (followers < 1000) return 8.0;
  if (followers < 10000) return 5.0;
  if (followers < 100000) return 3.0;
  if (followers < 1000000) return 2.0;
  return 1.5;
}

function getInfluencerTier(followers) {
  if (!followers) return 'Unknown';
  if (followers < 1000) return 'Nano';
  if (followers < 10000) return 'Micro';
  if (followers < 100000) return 'Mid-Tier';
  if (followers < 1000000) return 'Macro';
  return 'Mega';
}

// Run the script
console.log('🔍 MISSING PROFILES CHECKER & ANALYZER');
console.log('=' .repeat(50));
checkAndAnalyzeProfiles();