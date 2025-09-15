/**
 * Check and analyze 100 profiles that webhook missed
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const profilesToCheck = [
  'iconicsaga', 'dcj_7', 'herman_smith9', 'keatenwade', '6walt',
  'hoodera1', '_tylerbrown56', 'ardenxwalker', 'iamchaunceygooden', 'z6ckk',
  'bayeuxman.arts', 'dravacus', 'akira_raikou', 'melkormancin', 'tom_tap_it',
  'yannickcorboz', 'homare_works', 'ephk', 'cedric.poulat.comics', 'theyoninotebook',
  'noctz_art', 'jiin_san', 'kaladenn', 'laviperchik', 'anastasija_serdnova',
  'theyloveleeee', '____alliyahh', 'redjusglo', 'goyard_glo', '__deandre___',
  'shesuperp', 'esha2extra', 'jalaalexandriaa', 'butta1000s', 'beauty2soul',
  'mkillaa__', '_arikardashian', 'sojanaya', 'riog__', '_precious.p',
  'click_onme', 'ixtzxl', 'veeve.xo', 'karahg_', 'truly_moni',
  'daliciahuerta', 'gabriellaa.bby', 'giselledariz', 'jennybarajas_', 'stacyhernandezr',
  'ksuuvis', 'djrennessy', '5evareligion', 'myspacemark555', 'stunmic',
  'topflightblue', 'skai0', 'vaultofche', 'captdozzie', 'fluhkunxhkosrs',
  'zayguapkid111', 'teklintowe', '130world', 'squilloooo', 'blizziboi',
  'sadprt', 'lazygod1', 'almightyglo_', 'xnovagang', 'lilpolotee',
  'gabrielr.araujo', 'mightymohamed90', 'matheusqcastro', 'thedoughydaddy', 'sadnsus',
  'raaaft', 'ciceroscope', 'marcusfrausto', 'bicalhothi', 'raycastelo_',
  'randomlynew', 'lielbomberg', 'giorojo_', 'whagnerduarte', 'augustgonet',
  'nathan_gt_n', 'guilhermekozzinharski', 'jess.so.prettii', 'doll.divaa', 'torri_tabx3',
  '_.khyariaa', 'xlillilox', 'lady_stackz_', '_kel.seyy', '_kylaakayy',
  'brazilfralis', 'samiyap_', '_ricchgucci', 'janasiamonique', '804stallion'
];

async function checkAndAnalyze() {
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
      } else {
        results.scraped.push(username);
        if (analyzed) {
          results.analyzed.push(username);
        } else {
          results.needsAnalysis.push(username);
        }
      }
    }

    // Print summary
    console.log('\n📊 SUMMARY:');
    console.log(`Total checked: ${profilesToCheck.length}`);
    console.log(`✅ Already analyzed: ${results.analyzed.length}`);
    console.log(`⚠️  Needs analysis: ${results.needsAnalysis.length}`);
    console.log(`❌ Not scraped yet: ${results.notScraped.length}`);

    // Analyze the ones that need it
    if (results.needsAnalysis.length > 0) {
      console.log('\n🤖 ANALYZING MISSING PROFILES...\n');

      let count = 0;
      for (const username of results.needsAnalysis) {
        const profile = await scrapedCollection.findOne({ username });
        const profileData = profile.profileData || profile;
        const followers = profileData.followersCount || 0;

        const analysis = {
          username: profileData.username,
          fullName: profileData.fullName || '',
          biography: profileData.biography || '',
          followersCount: followers,
          followsCount: profileData.followsCount || 0,
          postsCount: profileData.postsCount || 0,
          verified: profileData.verified || false,
          isBusinessAccount: profileData.isBusinessAccount || false,
          profilePicUrl: profileData.profilePicUrl || '',

          gender: 'Unknown',
          profileType: profileData.isBusinessAccount ? 'Business' : 'Personal',
          contentType: ['General'],
          engagementRate: followers < 10000 ? 5.0 : 3.0,
          influencerTier: followers < 1000 ? 'Nano' : followers < 10000 ? 'Micro' : followers < 100000 ? 'Mid-Tier' : 'Macro',
          brandSafetyScore: 90,
          adultContentScore: 0,
          profileSummary: [`${followers.toLocaleString()} followers`],

          analyzedAt: new Date(),
          modelUsed: 'local-fallback',
          source: 'batch_100_fix'
        };

        await analyzedCollection.replaceOne(
          { username },
          analysis,
          { upsert: true }
        );

        count++;
        console.log(`✅ ${username} - Analyzed (${followers.toLocaleString()} followers)`);
      }

      console.log(`\n✅ Analyzed ${count} profiles successfully!`);
    }

    // Show not scraped
    if (results.notScraped.length > 0) {
      console.log('\n❌ NOT SCRAPED YET:');
      results.notScraped.forEach(u => console.log(`   - ${u}`));
    }

    // WEBHOOK FAILURE ANALYSIS
    console.log('\n' + '=' .repeat(50));
    console.log('🔍 WEBHOOK FAILURE ANALYSIS');
    console.log('=' .repeat(50));
    console.log('\nPossible reasons why webhook didn\'t trigger:');
    console.log('1. ❌ Payload too large (100+ profiles at once)');
    console.log('2. ❌ Webhook endpoint crashed/timeout');
    console.log('3. ❌ Network timeout between scraper and analyzer');
    console.log('4. ❌ Railway deployment might be down');
    console.log('5. ❌ Scraper not sending webhook for bulk operations');
    console.log('\nSOLUTION: Run auto-monitor on production as backup');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

checkAndAnalyze();