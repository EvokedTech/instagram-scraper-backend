/**
 * Re-analyze specific profiles with enhanced AI analysis
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const profilesToReanalyze = ["weber_ovaa"];

class ProfileReanalyzer {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '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';
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = 'qwen/qwen-2.5-72b-instruct';
    console.log('🔑 Using API Key:', this.apiKey.substring(0, 20) + '...');
    console.log('🤖 Using Model:', this.model);
  }

  async analyzeProfile(profileData) {
    try {
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

        Please provide a detailed profile summary including:
        1. What type of content they create
        2. Their target audience
        3. Engagement insights
        4. Professional assessment

        Respond in JSON format with these exact fields:
        {
          "gender": "Male/Female/Brand/Unknown",
          "age": number or null,
          "profileType": "Influencer/Business/Personal/Creator",
          "contentType": ["array", "of", "content", "types"],
          "engagementRate": number,
          "influencerTier": "Nano/Micro/Mid-Tier/Macro/Mega",
          "brandSafetyScore": number (0-100),
          "adultContentScore": number (0-100),
          "profileSummary": [
            "First key insight about the profile",
            "Second key insight about their content",
            "Third insight about their audience or engagement"
          ]
        }
      `;

      console.log(`   📡 Calling OpenRouter API for ${profileData.username}...`);

      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Instagram profile analyzer. Provide detailed, structured analysis based on the profile data. Always include meaningful profileSummary with at least 3 insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      };

      console.log('   📤 Request URL:', this.apiUrl);
      console.log('   📤 Request Model:', requestBody.model);

      const response = await axios.post(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://instagram-analyzer.com',
            'X-Title': 'Instagram Profile Analyzer'
          },
          timeout: 30000
        }
      );

      console.log(`   ✅ API Response received for ${profileData.username}`);

      const text = response.data.choices[0].message.content;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Ensure profileSummary exists and is meaningful
        if (!parsed.profileSummary || parsed.profileSummary.length === 0) {
          parsed.profileSummary = this.generateProfileSummary(profileData);
        }

        return parsed;
      }

      // Fallback if parsing fails
      return this.generateFallbackAnalysis(profileData);

    } catch (error) {
      console.error(`   ❌ Error analyzing ${profileData.username}:`, error.message);
      if (error.response) {
        console.error(`   📊 Response Status: ${error.response.status}`);
        console.error(`   📊 Response Data:`, JSON.stringify(error.response.data, null, 2));
        if (error.response?.status === 402) {
          console.error('   💰 OpenRouter API: Insufficient credits or payment required');
        }
      } else if (error.request) {
        console.error('   🌐 No response received from OpenRouter API');
        console.error('   🌐 Request details:', error.request._header);
      } else {
        console.error('   🚫 Error setting up request:', error.message);
      }
      return this.generateFallbackAnalysis(profileData);
    }
  }

  generateProfileSummary(profileData) {
    const summaries = [];

    // Follower insight
    if (profileData.followersCount > 100000) {
      summaries.push(`Major influencer with ${(profileData.followersCount / 1000).toFixed(0)}K+ followers, indicating strong audience reach`);
    } else if (profileData.followersCount > 10000) {
      summaries.push(`Mid-tier influencer with ${(profileData.followersCount / 1000).toFixed(1)}K followers, suitable for targeted campaigns`);
    } else if (profileData.followersCount > 1000) {
      summaries.push(`Micro-influencer with ${profileData.followersCount.toLocaleString()} followers, ideal for niche engagement`);
    } else {
      summaries.push(`Growing account with ${profileData.followersCount || 0} followers, building their community`);
    }

    // Content frequency insight
    if (profileData.postsCount > 1000) {
      summaries.push(`Highly active content creator with ${profileData.postsCount.toLocaleString()} posts, demonstrating consistent engagement`);
    } else if (profileData.postsCount > 100) {
      summaries.push(`Regular poster with ${profileData.postsCount} posts, maintaining steady content flow`);
    } else {
      summaries.push(`Selective content strategy with ${profileData.postsCount || 0} posts`);
    }

    // Account type insight
    if (profileData.verified) {
      summaries.push('Verified account with established credibility and authenticity');
    } else if (profileData.isBusinessAccount) {
      summaries.push('Business account focused on professional growth and engagement');
    } else if (profileData.biography && profileData.biography.length > 50) {
      summaries.push('Detailed bio suggests professional approach to content creation');
    } else {
      summaries.push('Personal account with potential for growth and engagement');
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
}

async function reanalyzeProfiles() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  const analyzer = new ProfileReanalyzer();

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('instagram-scraper');
    const scrapedCollection = db.collection('rootprofiles_scraped_datas');
    const analyzedCollection = db.collection('analyzed_relatedprofiles');

    console.log(`\n🔄 RE-ANALYZING ${profilesToReanalyze.length} PROFILES`);
    console.log('=' .repeat(50));

    let successCount = 0;
    let failCount = 0;

    for (const username of profilesToReanalyze) {
      try {
        console.log(`\n📊 Processing: ${username}`);

        // Get scraped profile data
        const scrapedProfile = await scrapedCollection.findOne({ username });

        if (!scrapedProfile) {
          console.log(`   ❌ Not found in scraped collection`);
          failCount++;
          continue;
        }

        const profileData = scrapedProfile.profileData || scrapedProfile;

        // Generate new analysis with proper profile summary
        console.log(`   🤖 Generating AI analysis...`);
        const aiAnalysis = await analyzer.analyzeProfile(profileData);

        // Check if profile summary was generated
        if (aiAnalysis.profileSummary && aiAnalysis.profileSummary.length > 0) {
          console.log(`   ✅ Profile summary generated: ${aiAnalysis.profileSummary.length} insights`);
        } else {
          console.log(`   ⚠️  No profile summary generated, using fallback`);
          aiAnalysis.profileSummary = analyzer.generateProfileSummary(profileData);
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
          source: 'reanalysis_script',
          aiModel: 'qwen/qwen-2.5-72b-instruct'
        };

        // Update or insert the analysis
        const result = await analyzedCollection.replaceOne(
          { username },
          analysisDoc,
          { upsert: true }
        );

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          console.log(`   ✅ Successfully updated: ${username}`);
          console.log(`   📝 Summary preview: "${aiAnalysis.profileSummary[0]}..."`);
          successCount++;
        } else {
          console.log(`   ⚠️  No changes made for: ${username}`);
        }

        // Rate limiting - wait 2 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`   ❌ Error processing ${username}: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '=' .repeat(50));
    console.log('✅ RE-ANALYSIS COMPLETE');
    console.log('=' .repeat(50));
    console.log(`Successfully re-analyzed: ${successCount}/${profilesToReanalyze.length}`);
    console.log(`Failed: ${failCount}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
console.log('🔄 PROFILE RE-ANALYZER');
console.log('=' .repeat(50));
console.log('Re-analyzing profiles with enhanced summaries...');
reanalyzeProfiles();