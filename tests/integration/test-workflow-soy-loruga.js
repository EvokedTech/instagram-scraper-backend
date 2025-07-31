require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/database');
const Session = require('./src/models/Session');
const RootProfileScraped = require('./src/models/RootProfileScraped');
const RelatedProfileScraped = require('./src/models/RelatedProfileScraped');
const batchProcessingService = require('./src/services/batchProcessingService');
const depthProcessingService = require('./src/services/depthProcessingService');
const relatedProfilesService = require('./src/services/relatedProfilesService');
const ProfileUrlHelper = require('./src/utils/profileUrlHelper');
const logger = require('./src/utils/logger');

// Test configuration
const TEST_USERNAME = 'soy_loruga';
const TEST_DEPTH = 1;
const MAX_PROFILES_PER_DEPTH = 10;

// Color codes for better visibility
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.bright}${colors.cyan}======= STEP ${step}: ${message} =======${colors.reset}\n`);
}

async function testWorkflow() {
  try {
    // Connect to database
    await connectDB();
    log('✓ Connected to MongoDB', 'green');

    // Step 1: Create a test session
    logStep(1, 'Creating Session with Root Profile');
    
    const sessionData = {
      name: `Test Workflow - ${TEST_USERNAME} - ${new Date().toISOString()}`,
      description: `Testing complete workflow with ${TEST_USERNAME} at depth ${TEST_DEPTH}`,
      rootProfiles: [ProfileUrlHelper.usernameToUrl(TEST_USERNAME)],
      config: {
        maxDepth: TEST_DEPTH,
        maxProfilesPerDepth: MAX_PROFILES_PER_DEPTH,
        scrapeRelatedProfiles: true,
        scrapeHashtags: false,
        scrapeMentions: false
      }
    };

    const session = new Session(sessionData);
    await session.save();
    log(`✓ Session created with ID: ${session._id}`, 'green');
    log(`  Root profile: ${TEST_USERNAME}`, 'yellow');
    log(`  Max depth: ${TEST_DEPTH}`, 'yellow');
    log(`  Max profiles per depth: ${MAX_PROFILES_PER_DEPTH}`, 'yellow');

    // Step 2: Check if root profile exists in database
    logStep(2, 'Root Profile Processing - Database Check');
    
    const profileUrl = ProfileUrlHelper.usernameToUrl(TEST_USERNAME);
    log(`✓ Converted username to URL: ${profileUrl}`, 'green');
    
    const existingRootProfile = await RootProfileScraped.findOne({
      sessionId: session._id,
      profileUrl: profileUrl
    });
    
    if (existingRootProfile && existingRootProfile.status === 'scraped') {
      log(`✓ Root profile already exists in database (status: ${existingRootProfile.status})`, 'yellow');
      log(`  Scraped at: ${existingRootProfile.scrapedAt}`, 'cyan');
      log(`  Followers: ${existingRootProfile.profileData?.followersCount || 'N/A'}`, 'cyan');
      log(`  Related profiles count: ${existingRootProfile.profileData?.relatedProfiles?.length || 0}`, 'cyan');
    } else {
      log('⚠ Root profile not found in database or not scraped', 'yellow');
    }

    // Step 3: Process root profiles batch
    logStep(3, 'Processing Root Profiles Batch');
    
    const batchResult = await batchProcessingService.processRootProfilesBatch(
      session._id.toString(),
      session.rootProfiles
    );
    log('✓ Batch processing completed', 'green');
    log(`  Successful: ${batchResult.successful.length}`, 'cyan');
    log(`  Failed: ${batchResult.failed.length}`, 'cyan');
    log(`  Skipped: ${batchResult.skipped.length}`, 'cyan');
    log(`  Total time: ${batchResult.totalTime}ms`, 'cyan');

    // Step 4: Extract related profiles
    logStep(4, 'Extracting Related Profiles from Root');
    
    const extractionResult = await relatedProfilesService.extractRelatedProfiles(session._id);
    log('✓ Related profiles extraction completed', 'green');
    log(`  Total extracted: ${extractionResult.totalExtracted}`, 'cyan');
    log(`  Newly created: ${extractionResult.newlyCreated}`, 'cyan');
    log(`  Already existed: ${extractionResult.alreadyExisted}`, 'cyan');
    
    if (extractionResult.profilesByRoot && extractionResult.profilesByRoot.length > 0) {
      const rootStats = extractionResult.profilesByRoot[0];
      log(`\n  From ${rootStats.rootUsername}:`, 'magenta');
      log(`    - Extracted: ${rootStats.extracted}`, 'cyan');
      log(`    - New: ${rootStats.new}`, 'cyan');
      log(`    - Existing: ${rootStats.existing}`, 'cyan');
    }

    // Step 5: Check batch database efficiency
    logStep(5, 'Verifying Batch Database Check Efficiency');
    
    const relatedProfiles = await RelatedProfileScraped.find({
      sessionId: session._id,
      depth: 1,
      status: 'pending'
    }).limit(10);
    
    log(`✓ Found ${relatedProfiles.length} pending related profiles at depth 1`, 'green');
    
    if (relatedProfiles.length > 0) {
      // Test bulk URL checking
      const profileUrls = relatedProfiles.map(p => p.profileUrl);
      const startTime = Date.now();
      
      const existingProfiles = await RelatedProfileScraped.find({
        profileUrl: { $in: profileUrls },
        status: { $in: ['scraped', 'analyzed'] }
      });
      
      const queryTime = Date.now() - startTime;
      log(`✓ Batch database check completed in ${queryTime}ms`, 'green');
      log(`  Checked ${profileUrls.length} URLs in single query`, 'cyan');
      log(`  Found ${existingProfiles.length} existing profiles`, 'cyan');
    }

    // Step 6: Process depth 1 profiles
    logStep(6, 'Processing Depth 1 Profiles');
    
    const depthResult = await depthProcessingService.processDepthLevel(session._id, 1);
    log('✓ Depth 1 processing completed', 'green');
    log(`  Total profiles: ${depthResult.totalProfiles}`, 'cyan');
    log(`  Processed: ${depthResult.processed}`, 'cyan');
    log(`  Successful: ${depthResult.successful}`, 'cyan');
    log(`  Failed: ${depthResult.failed}`, 'cyan');
    log(`  Already scraped: ${depthResult.alreadyScraped}`, 'cyan');
    log(`  Processing time: ${depthResult.processingTime}s`, 'cyan');

    // Step 7: Verify recursive depth processing
    logStep(7, 'Verifying Recursive Depth Processing Setup');
    
    // Check if profiles were extracted for next depth
    const depth1ScrapedProfiles = await RelatedProfileScraped.find({
      sessionId: session._id,
      depth: 1,
      status: 'scraped'
    }).limit(3);
    
    log(`✓ Found ${depth1ScrapedProfiles.length} scraped profiles at depth 1`, 'green');
    
    let totalRelatedAtDepth1 = 0;
    for (const profile of depth1ScrapedProfiles) {
      const relatedCount = profile.profileData?.relatedProfiles?.length || 0;
      totalRelatedAtDepth1 += relatedCount;
      log(`  ${profile.username}: ${relatedCount} related profiles`, 'cyan');
    }
    
    log(`\n  Total related profiles available for depth 2: ${totalRelatedAtDepth1}`, 'magenta');
    log(`  (Would be processed if maxDepth > 1)`, 'yellow');

    // Step 8: Final statistics
    logStep(8, 'Final Workflow Statistics');
    
    // Get session statistics
    const rootStats = await RootProfileScraped.getSessionStats(session._id);
    const relatedStats = await RelatedProfileScraped.getDepthStats(session._id);
    
    log('✓ Root Profiles Statistics:', 'green');
    rootStats.forEach(stat => {
      log(`  ${stat._id}: ${stat.count}`, 'cyan');
    });
    
    log('\n✓ Related Profiles Statistics by Depth:', 'green');
    relatedStats.forEach(depthStat => {
      log(`  Depth ${depthStat._id}:`, 'magenta');
      depthStat.stats.forEach(stat => {
        log(`    ${stat.status}: ${stat.count}`, 'cyan');
      });
      log(`    Total: ${depthStat.total}`, 'yellow');
    });

    // Update session status
    await session.updateStatus('completed');
    log('\n✓ Workflow test completed successfully!', 'green');

    // Cleanup option
    console.log(`\n${colors.yellow}Session ID for reference: ${session._id}${colors.reset}`);
    console.log(`${colors.yellow}To cleanup test data, run: npm run cleanup:session ${session._id}${colors.reset}`);

  } catch (error) {
    log(`\n✗ Error during workflow test: ${error.message}`, 'red');
    console.error(error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    log('\n✓ Database connection closed', 'green');
  }
}

// Run the test
log('\n🚀 Starting Instagram Profile Scraping Workflow Test', 'bright');
log(`Testing with username: ${TEST_USERNAME}, depth: ${TEST_DEPTH}\n`, 'yellow');

testWorkflow();