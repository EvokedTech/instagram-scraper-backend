/**
 * Analyze Latest Scraped Profiles
 * Processes the most recent scraped profiles and generates AI analysis
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const ANALYSIS_BACKEND_URL = process.env.ANALYSIS_BACKEND_URL || 'https://web-production-69b69.up.railway.app';
const LIMIT = parseInt(process.env.LIMIT) || 50; // Default to 50 profiles

class LatestProfileAnalyzer {
  constructor() {
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.primaryModel = 'qwen/qwen2.5-vl-72b-instruct';  // Correct model name
    this.fallbackModel = 'x-ai/grok-3-mini';
    this.processedCount = 0;
    this.successCount = 0;
    this.failCount = 0;
  }

  async analyzeWithModel(profileData, model) {
    try {
      console.log(`   🤖 Using model: ${model}`);
      const prompt = `
        Analyze this Instagram profile and provide comprehensive insights:

        Username: @${profileData.username}
        Full Name: ${profileData.fullName || 'Not provided'}
        Biography: ${profileData.biography || 'Not provided'}
        
        Profile Stats:
        - Followers: ${profileData.followersCount?.toLocaleString() || 0}
        - Following: ${profileData.followsCount?.toLocaleString() || 0}
        - Posts: ${profileData.postsCount?.toLocaleString() || 0}
        - Verified: ${profileData.verified ? 'Yes' : 'No'}
        - Business Account: ${profileData.isBusinessAccount ? 'Yes' : 'No'}
        ${profileData.businessCategory ? `- Business Category: ${profileData.businessCategory}` : ''}

        Please provide a detailed analysis in JSON format with these exact fields:
        {
          "gender": "Male/Female/Brand/Unknown",
          "age": number or null,
          "profileType": "Influencer/Business/Personal/Creator",
          "contentType": ["array", "of", "content", "types"],
          "engagementRate": number (0-10),
          "influencerTier": "Nano/Micro/Mid-Tier/Macro/Mega",
          "brandSafetyScore": number (0-100),
          "adultContentScore": number (0-100),
          "profileSummary": [
            "First detailed insight about the profile",
            "Second insight about their content strategy",
            "Third insight about their audience or engagement"
          ]
        }
      `;

      const response = await axios.post(
        this.apiUrl,
        {
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert Instagram profile analyzer. Provide detailed, structured analysis based on the profile data. Always include meaningful profileSummary with at least 3 unique insights.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 400
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://instagram-analyzer.com',
            'X-Title': 'Instagram Profile Analyzer'
          },
          timeout: 30000
        }
      );

      const text = response.data.choices[0].message.content;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Ensure profileSummary exists and is meaningful
        if (!parsed.profileSummary || parsed.profileSummary.length === 0) {
          parsed.profileSummary = this.generateProfileSummary(profileData);
        }

        parsed.modelUsed = model; // Track which model was used
        return parsed;
      }

      // Fallback if parsing fails
      const fallback = this.generateFallbackAnalysis(profileData);
      fallback.modelUsed = model;
      return fallback;
      
    } catch (error) {
      throw error;
    }
  }

  async analyzeWithOpenRouter(profileData) {
    try {
      // Try primary model (Qwen)
      return await this.analyzeWithModel(profileData, this.primaryModel);
    } catch (primaryError) {
      console.error(`   ⚠️ Primary model failed:`, primaryError.message);

      if (primaryError.response?.status === 402) {
        console.log('   💰 Insufficient credits for Qwen, trying Grok fallback...');
      }

      try {
        // Try fallback model (Grok)
        console.log(`   🔄 Switching to fallback model: ${this.fallbackModel}`);
        return await this.analyzeWithModel(profileData, this.fallbackModel);
      } catch (fallbackError) {
        console.error(`   ❌ Fallback model also failed:`, fallbackError.message);
        console.log('   📝 Using local fallback analysis...');
        const fallback = this.generateFallbackAnalysis(profileData);
        fallback.modelUsed = 'local-fallback';
        return fallback;
      }
    }
  }

  generateProfileSummary(profileData) {
    const summaries = [];
    
    // Follower-based insight
    const followers = profileData.followersCount || 0;
    if (followers > 100000) {
      summaries.push(`Major influencer with ${(followers / 1000).toFixed(0)}K+ followers, indicating strong audience reach and engagement potential`);
    } else if (followers > 10000) {
      summaries.push(`Mid-tier influencer with ${(followers / 1000).toFixed(1)}K followers, suitable for targeted brand campaigns`);
    } else if (followers > 1000) {
      summaries.push(`Micro-influencer with ${followers.toLocaleString()} followers, ideal for niche market engagement`);
    } else {
      summaries.push(`Growing account with ${followers} followers, building their community presence`);
    }
    
    // Content frequency insight
    const posts = profileData.postsCount || 0;
    if (posts > 1000) {
      summaries.push(`Highly active content creator with ${posts.toLocaleString()} posts, demonstrating consistent engagement`);
    } else if (posts > 100) {
      summaries.push(`Regular content poster with ${posts} posts, maintaining steady audience interaction`);
    } else {
      summaries.push(`Selective content strategy with ${posts} posts, focusing on quality over quantity`);
    }
    
    // Account type insight
    if (profileData.verified) {
      summaries.push('Verified account with established credibility and authentic presence');
    } else if (profileData.isBusinessAccount) {
      summaries.push('Business account focused on professional growth and customer engagement');
    } else if (profileData.biography && profileData.biography.length > 50) {
      summaries.push('Detailed bio suggests professional approach to content and audience building');
    } else {
      summaries.push('Personal account with potential for growth and engagement development');
    }
    
    return summaries;
  }

  generateFallbackAnalysis(profileData) {
    return {
      gender: 'Unknown',
      age: null,
      profileType: profileData.isBusinessAccount ? 'Business' : 'Personal',
      contentType: ['General'],
      engagementRate: this.calculateEngagementRate(profileData),
      influencerTier: this.getInfluencerTier(profileData.followersCount),
      brandSafetyScore: 90,
      adultContentScore: 0,
      profileSummary: this.generateProfileSummary(profileData)
    };
  }

  calculateEngagementRate(profileData) {
    if (!profileData.followersCount || profileData.followersCount === 0) return 0;
    const followers = profileData.followersCount;
    if (followers < 1000) return 8.0;
    if (followers < 10000) return 5.0;
    if (followers < 100000) return 3.0;
    if (followers < 1000000) return 2.0;
    return 1.5;
  }

  getInfluencerTier(followersCount) {
    if (!followersCount) return 'Unknown';
    if (followersCount < 1000) return 'Nano';
    if (followersCount < 10000) return 'Micro';
    if (followersCount < 100000) return 'Mid-Tier';
    if (followersCount < 1000000) return 'Macro';
    return 'Mega';
  }

  async processProfile(profile, db) {
    try {
      const analyzedCollection = db.collection('analyzed_relatedprofiles');
      
      // Check if already analyzed
      const existing = await analyzedCollection.findOne({ username: profile.username });
      if (existing && existing.profileSummary && existing.profileSummary.length > 0) {
        console.log(`   ⏭️  Skipping ${profile.username} (already analyzed with summary)`);
        return 'skipped';
      }

      const profileData = profile.profileData || profile;
      
      // Generate AI analysis
      console.log(`   🤖 Generating AI analysis...`);
      const aiAnalysis = await this.analyzeWithOpenRouter(profileData);
      
      // Check if profile summary was generated
      if (aiAnalysis.profileSummary && aiAnalysis.profileSummary.length > 0) {
        console.log(`   ✅ Profile summary generated: ${aiAnalysis.profileSummary.length} insights`);
      } else {
        console.log(`   ⚠️  No profile summary generated, using fallback`);
        aiAnalysis.profileSummary = this.generateProfileSummary(profileData);
      }
      
      // Prepare the analysis document
      const analysisDoc = {
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
        
        // AI Analysis fields
        gender: aiAnalysis.gender || 'Unknown',
        age: aiAnalysis.age || null,
        profileType: aiAnalysis.profileType || 'Personal',
        contentType: aiAnalysis.contentType || [],
        engagementRate: aiAnalysis.engagementRate || 0,
        influencerTier: aiAnalysis.influencerTier || 'Unknown',
        brandSafetyScore: aiAnalysis.brandSafetyScore || 90,
        adultContentScore: aiAnalysis.adultContentScore || 0,
        profileSummary: aiAnalysis.profileSummary || [],
        
        // Metadata
        analyzedAt: new Date(),
        lastUpdated: new Date(),
        source: 'latest_profiles_analyzer',
        aiModel: aiAnalysis.modelUsed || 'fallback'
      };
      
      // Update or insert the analysis
      const result = await analyzedCollection.replaceOne(
        { username: profile.username },
        analysisDoc,
        { upsert: true }
      );
      
      if (result.modifiedCount > 0 || result.upsertedCount > 0) {
        console.log(`   ✅ Successfully analyzed: ${profile.username}`);
        console.log(`   📝 Summary preview: "${aiAnalysis.profileSummary[0].substring(0, 80)}..."`);
        return 'success';
      } else {
        console.log(`   ⚠️  No changes made for: ${profile.username}`);
        return 'no_change';
      }
      
    } catch (error) {
      console.error(`   ❌ Error processing ${profile.username}: ${error.message}`);
      return 'failed';
    }
  }
}

async function analyzeLatestProfiles() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  const analyzer = new LatestProfileAnalyzer();
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('instagram-scraper');
    const scrapedCollection = db.collection('rootprofiles_scraped_datas');
    const analyzedCollection = db.collection('analyzed_relatedprofiles');
    
    // Get the latest scraped profiles
    console.log(`\n🔍 Finding latest ${LIMIT} scraped profiles...`);
    const latestProfiles = await scrapedCollection
      .find({ status: 'scraped' })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .toArray();
    
    if (latestProfiles.length === 0) {
      console.log('No scraped profiles found!');
      return;
    }
    
    console.log(`\n📊 ANALYZING ${latestProfiles.length} LATEST PROFILES`);
    console.log('=' .repeat(50));
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < latestProfiles.length; i++) {
      const profile = latestProfiles[i];
      const progress = Math.round(((i + 1) / latestProfiles.length) * 100);
      
      console.log(`\n[${i + 1}/${latestProfiles.length}] (${progress}%) 📊 Processing: ${profile.username}`);
      
      const result = await analyzer.processProfile(profile, db);
      
      switch(result) {
        case 'success':
          successCount++;
          break;
        case 'failed':
          failCount++;
          break;
        case 'skipped':
          skipCount++;
          break;
      }
      
      // Rate limiting - wait 2 seconds between requests
      if (i < latestProfiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Progress update every 10 profiles
      if ((i + 1) % 10 === 0 || i === latestProfiles.length - 1) {
        console.log(`\n📊 Progress Report:`);
        console.log(`   Processed: ${i + 1}/${latestProfiles.length} (${progress}%)`);
        console.log(`   Success: ${successCount}, Failed: ${failCount}, Skipped: ${skipCount}`);
      }
    }
    
    // Final report
    console.log('\n' + '=' .repeat(50));
    console.log('✅ ANALYSIS COMPLETE');
    console.log('=' .repeat(50));
    console.log(`Total processed: ${latestProfiles.length}`);
    console.log(`✅ Successfully analyzed: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped (already analyzed): ${skipCount}`);
    console.log('=' .repeat(50));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
console.log('🔄 LATEST PROFILES ANALYZER');
console.log('=' .repeat(50));
console.log(`Analyzing the latest ${LIMIT} scraped profiles...`);
console.log('Rate limit: 30 profiles per minute (2 second delay)');
console.log('=' .repeat(50));

analyzeLatestProfiles();