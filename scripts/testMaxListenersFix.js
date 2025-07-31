const logger = require('../src/utils/logger');

// Test script to verify MaxListenersExceededWarning is fixed
async function testMaxListenersFix() {
  console.log('Testing MaxListeners fix...');
  
  // Monitor for MaxListenersExceededWarning
  process.on('warning', (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      console.error('❌ MaxListenersExceededWarning detected!', warning);
      process.exit(1);
    }
  });

  try {
    // Initialize Redis clients
    console.log('1. Testing Redis clients initialization...');
    const { createSharedClients } = require('../src/config/redisClients');
    const clients = createSharedClients();
    if (clients) {
      console.log('✅ Redis clients created without warnings');
    }

    // Initialize queues
    console.log('\n2. Testing queue initialization...');
    const { queues } = require('../src/queues/queueManager');
    console.log('✅ Queue manager initialized without warnings');

    // Initialize n8n analysis queue
    console.log('\n3. Testing n8n analysis queue...');
    const { n8nAnalysisQueue } = require('../src/queues/n8nAnalysisQueue');
    if (n8nAnalysisQueue) {
      console.log('✅ n8n analysis queue initialized without warnings');
    }

    // Wait a bit to ensure no delayed warnings
    console.log('\n4. Waiting for any delayed warnings...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n✅ SUCCESS: No MaxListenersExceededWarning detected!');
    console.log('The fix is working correctly.');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    process.exit(1);
  } finally {
    // Clean up
    const { closeSharedClients } = require('../src/config/redisClients');
    await closeSharedClients();
    process.exit(0);
  }
}

// Run the test
testMaxListenersFix();