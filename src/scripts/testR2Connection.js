require('dotenv').config();
const { S3Client, PutObjectCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

async function testR2Connection() {
  console.log('\n🔧 Testing Cloudflare R2 Connection\n');
  
  // Check environment variables
  console.log('1. Checking environment variables...');
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCESS_KEY_ID', 
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_BUCKET_NAME',
    'CLOUDFLARE_R2_PUBLIC_URL'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    return;
  }
  
  console.log('✅ All required environment variables are set');
  
  // Create S3 client
  console.log('\n2. Creating S3 client for R2...');
  
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY.trim();
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME.trim();
  
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
    },
    forcePathStyle: true,
    signatureVersion: 'v4'
  });
  
  console.log('✅ S3 client created');
  console.log('   Endpoint:', `https://${accountId}.r2.cloudflarestorage.com`);
  console.log('   Bucket:', bucketName);
  
  // Test connection by listing buckets
  console.log('\n3. Testing connection by listing buckets...');
  try {
    const listCommand = new ListBucketsCommand({});
    const response = await client.send(listCommand);
    console.log('✅ Successfully connected to R2!');
    console.log(`   Found ${response.Buckets?.length || 0} buckets`);
    response.Buckets?.forEach(bucket => {
      console.log(`   - ${bucket.Name}`);
    });
  } catch (error) {
    console.error('❌ Failed to list buckets:', {
      message: error.message,
      code: error.Code || error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });
    return;
  }
  
  // Test upload
  console.log('\n4. Testing file upload...');
  try {
    const testKey = `test/connection-test-${Date.now()}.txt`;
    const testContent = `R2 connection test at ${new Date().toISOString()}`;
    
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain'
    });
    
    await client.send(putCommand);
    console.log('✅ Successfully uploaded test file!');
    console.log('   Key:', testKey);
    console.log('   Public URL:', `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${testKey}`);
    
  } catch (error) {
    console.error('❌ Failed to upload test file:', {
      message: error.message,
      code: error.Code || error.code,  
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });
  }
  
  console.log('\n✅ R2 connection test completed!\n');
}

// Run the test
testR2Connection().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});