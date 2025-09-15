/**
 * Analyze profiles that failed due to API issues
 * Uses the local MongoDB data and retries with available APIs
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const failedProfiles = [
  'sammy.balls',
  'fuccuuwant',
  'legends_downey',
  'supersklep',
  'zoguelda',
  'lola.ibrahimi',
  'vesadervishaj',
  'ornelaak',
  'erzannaamustafa',
  'ghazaa7',
  'eldafetahu',
  'anibrain_kanal',
  'trinitymooreofficial',
  'josielee1222',
  'jessicagalbraithhh',
  'helenhtaylor',
  'cjl_7x',
  'oldskooleditss',
  'lil.flaca619',
  'lowridergirl214'
];

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';

class FailedProfileAnalyzer {
  constructor() {
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    // Try different models in order
    this.models = [
      'qwen/qwen2.5-vl-72b-instruct',
      'x-ai/grok-3-mini',
      'meta-llama/llama-3.1-8b-instruct:free',  // Free model as backup
      'mistralai/mistral-7b-instruct:free'      // Another free model
    ];
  }

  async analyzeWithAPI(profileData, modelIndex = 0) {
    if (modelIndex >= this.models.length) {
      // All models failed, use local fallback
      return this.generateLocalFallback(profileData);
    }

    const model = this.models[modelIndex];
    console.log(`   🤖 Trying model: ${model}`);

    try {
      const prompt = `
        Analyze this Instagram profile and provide insights:

        Username: @${profileData.username}
        Full Name: ${profileData.fullName || 'Not provided'}
        Biography: ${profileData.biography || 'Not provided'}

        Stats:
        - Followers: ${profileData.followersCount?.toLocaleString() || 0}
        - Following: ${profileData.followsCount?.toLocaleString() || 0}
        - Posts: ${profileData.postsCount?.toLocaleString() || 0}
        - Verified: ${profileData.verified ? 'Yes' : 'No'}
        - Business: ${profileData.isBusinessAccount ? 'Yes' : 'No'}

        Provide analysis in JSON format:
        {
          "gender": "Male/Female/Brand/Unknown",
          "profileType": "Influencer/Business/Personal/Creator",
          "contentType": ["array", "of", "content", "types"],
          "engagementRate": number (0-10),
          "influencerTier": "Nano/Micro/Mid-Tier/Macro/Mega",
          "brandSafetyScore": number (0-100),
          "adultContentScore": number (0-100),
          "profileSummary": ["3 key insights about this profile"]
        }
      `;

      const response = await axios.post(
        this.apiUrl,
        {
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert Instagram profile analyzer. Provide concise, accurate analysis.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 300  // Reduced to save credits
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://instagram-analyzer.com',
            'X-Title': 'Instagram Profile Analyzer'
          },
          timeout: 15000
        }
      );

      const text = response.data.choices[0].message.content;
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.modelUsed = model;
        return parsed;
      }

      throw new Error('Failed to parse response');

    } catch (error) {
      console.error(`   ❌ Model ${model} failed: ${error.message}`);

      // Try next model
      return await this.analyzeWithAPI(profileData, modelIndex + 1);
    }
  }

  generateLocalFallback(profileData) {
    console.log('   📝 Using local fallback analysis');

    const followers = profileData.followersCount || 0;
    const posts = profileData.postsCount || 0;

    const profileSummary = [];

    // Generate insights based on stats
    if (followers > 10000) {
      profileSummary.push(`Influencer with ${(followers / 1000).toFixed(1)}K followers, strong audience reach`);
    } else if (followers > 1000) {
      profileSummary.push(`Micro-influencer with ${followers.toLocaleString()} followers`);
    } else {
      profileSummary.push(`Growing account with ${followers} followers`);
    }

    if (posts > 100) {
      profileSummary.push(`Active content creator with ${posts} posts`);
    } else {
      profileSummary.push(`Selective poster with ${posts} posts`);
    }

    if (profileData.verified) {
      profileSummary.push('Verified account with established credibility');
    } else if (profileData.isBusinessAccount) {
      profileSummary.push('Business account focused on professional growth');
    } else {
      profileSummary.push('Personal account with engagement potential');
    }

    return {
      gender: profileData.isBusinessAccount ? 'Brand' : 'Unknown',
      profileType: profileData.isBusinessAccount ? 'Business' : 'Personal',
      contentType: ['General'],
      engagementRate: this.calculateEngagementRate(followers),
      influencerTier: this.getInfluencerTier(followers),
      brandSafetyScore: 90,
      adultContentScore: 0,
      profileSummary: profileSummary,
      modelUsed: 'local-fallback'
    };
  }

  calculateEngagementRate(followers) {
    if (!followers) return 0;
    if (followers < 1000) return 8.0;
    if (followers < 10000) return 5.0;
    if (followers < 100000) return 3.0;
    if (followers < 1000000) return 2.0;
    return 1.5;
  }

  getInfluencerTier(followers) {
    if (!followers) return 'Unknown';
    if (followers < 1000) return 'Nano';
    if (followers < 10000) return 'Micro';
    if (followers < 100000) return 'Mid-Tier';
    if (followers < 1000000) return 'Macro';
    return 'Mega';
  }

  async processProfile(username, db) {
    try {
      console.log(`\n📊 Processing: ${username}`);

      // Get scraped data
      const scrapedCollection = db.collection('rootprofiles_scraped_datas');
      const profile = await scrapedCollection.findOne({ username });

      if (!profile) {
        console.log(`   ❌ Not found in scraped collection`);
        return { status: 'not_found', username };
      }

      const profileData = profile.profileData || profile;
      console.log(`   ✅ Found profile data`);
      console.log(`   👥 Followers: ${profileData.followersCount || 0}`);
      console.log(`   📸 Posts: ${profileData.postsCount || 0}`);

      // Generate analysis
      const analysis = await this.analyzeWithAPI(profileData);

      // Save to analyzed collection
      const analyzedCollection = db.collection('analyzed_relatedprofiles');

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

        // AI Analysis
        gender: analysis.gender || 'Unknown',
        age: analysis.age || null,
        profileType: analysis.profileType || 'Personal',
        contentType: analysis.contentType || [],
        engagementRate: analysis.engagementRate || 0,
        influencerTier: analysis.influencerTier || 'Unknown',
        brandSafetyScore: analysis.brandSafetyScore || 90,
        adultContentScore: analysis.adultContentScore || 0,
        profileSummary: analysis.profileSummary || [],

        // Metadata
        analyzedAt: new Date(),
        lastUpdated: new Date(),
        source: 'failed_profiles_recovery',
        modelUsed: analysis.modelUsed || 'unknown'
      };

      const result = await analyzedCollection.replaceOne(
        { username },
        analyzedDoc,
        { upsert: true }
      );

      if (result.modifiedCount > 0 || result.upsertedCount > 0) {
        console.log(`   ✅ Successfully analyzed with model: ${analysis.modelUsed}`);
        if (analysis.profileSummary && analysis.profileSummary.length > 0) {
          console.log(`   📝 Summary: "${analysis.profileSummary[0]}"`);
        }
        return { status: 'success', username, model: analysis.modelUsed };
      }

      return { status: 'no_change', username };

    } catch (error) {
      console.error(`   ❌ Error processing ${username}: ${error.message}`);
      return { status: 'failed', username, error: error.message };
    }
  }
}

async function analyzeFailedProfiles() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  const analyzer = new FailedProfileAnalyzer();

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('instagram-scraper');

    console.log(`\n🔄 ANALYZING ${failedProfiles.length} FAILED PROFILES`);
    console.log('=' .repeat(50));

    const results = {
      success: [],
      failed: [],
      notFound: []
    };

    for (const username of failedProfiles) {
      const result = await analyzer.processProfile(username, db);

      switch(result.status) {
        case 'success':
          results.success.push(username);
          break;
        case 'not_found':
          results.notFound.push(username);
          break;
        default:
          results.failed.push(username);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Final report
    console.log('\n' + '=' .repeat(50));
    console.log('✅ ANALYSIS COMPLETE');
    console.log('=' .repeat(50));
    console.log(`✅ Successfully analyzed: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`🔍 Not found: ${results.notFound.length}`);

    if (results.success.length > 0) {
      console.log('\nSuccessfully analyzed:');
      results.success.forEach(u => console.log(`  ✅ ${u}`));
    }

    if (results.notFound.length > 0) {
      console.log('\nNot found in database:');
      results.notFound.forEach(u => console.log(`  ❌ ${u}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
console.log('🔧 FAILED PROFILES ANALYZER');
console.log('=' .repeat(50));
console.log('Retrying analysis for profiles that failed due to API issues');
console.log('Using multiple fallback models including free ones');
console.log('=' .repeat(50));

analyzeFailedProfiles();