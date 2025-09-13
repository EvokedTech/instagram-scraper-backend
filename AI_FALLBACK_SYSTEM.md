# AI Analysis Fallback System

## Overview

The Instagram Scraper Backend now includes a robust AI analysis system with automatic fallback between multiple AI models. This ensures continuous operation even when one model experiences quota limits, rate limiting, or service disruptions.

## Features

### 1. Multi-Model Support (Triple Redundancy)
- **Primary Model**: DeepSeek-R1 (deepseek-chat)
- **First Fallback**: Grok (X.AI grok-4-latest)
- **Second Fallback**: Mistral AI (mistral-large-latest)
- Automatic failover through the chain when models are unavailable
- Seamless transition between models without interrupting service

### 2. Deduplication System
- **Cache-based deduplication**: Prevents duplicate API calls for the same profile
- **Session-level tracking**: Prevents processing the same profile multiple times in a session
- **Cache timeout**: 1-hour cache expiration for fresh analysis when needed
- **Memory-efficient**: Automatic cache cleanup for expired entries

### 3. Error Handling
- Graceful fallback on quota exhaustion
- Automatic retry with fallback model on rate limiting
- Detailed error logging for debugging
- Service continues with basic analysis if all AI models fail

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Primary AI Model
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# First Fallback AI Model
GROK_API_KEY=your_grok_api_key_here

# Second Fallback AI Model
MISTRAL_API_KEY=your_mistral_api_key_here
```

## API Endpoints

### 1. Check AI Model Status
```http
GET /api/ai-analysis/status
```

Response:
```json
{
  "success": true,
  "models": [
    {
      "name": "deepseek-r1",
      "available": true,
      "calls": 10,
      "errors": 0
    },
    {
      "name": "grok",
      "available": true,
      "calls": 2,
      "errors": 0
    },
    {
      "name": "mistral",
      "available": true,
      "calls": 0,
      "errors": 0
    }
  ],
  "summary": {
    "availableModels": 3,
    "totalModels": 3,
    "primaryModel": "deepseek-r1",
    "firstFallback": "grok",
    "secondFallback": "mistral",
    "fallbackChain": ["deepseek-r1", "grok", "mistral"]
  }
}
```

### 2. Test AI Analysis
```http
POST /api/ai-analysis/test
Content-Type: application/json

{
  "profileData": {
    "username": "testuser",
    "followersCount": 10000,
    "followingCount": 500,
    "postsCount": 100
  },
  "forceRefresh": false
}
```

### 3. Clear AI Cache
```http
POST /api/ai-analysis/clear-cache
```

### 4. Clear Duplicate Tracking
```http
POST /api/ai-analysis/clear-duplicates
```

### 5. Analyze Specific Profile
```http
POST /api/ai-analysis/analyze-profile
Content-Type: application/json

{
  "username": "example_user",
  "profileData": {
    "username": "example_user",
    "biography": "Content creator",
    "followersCount": 50000,
    "followingCount": 1000,
    "postsCount": 500,
    "isVerified": true,
    "isBusinessAccount": true
  },
  "forceRefresh": false
}
```

## How It Works

### Fallback Logic Flow

1. **Initial Request**: System attempts analysis with DeepSeek-R1
2. **Primary Success**: Returns analysis with model info
3. **Primary Failure**: Automatically switches to Grok
4. **First Fallback Success**: Returns analysis from Grok
5. **First Fallback Failure**: Automatically switches to Mistral
6. **Second Fallback Success**: Returns analysis from Mistral
7. **All Models Fail**: Returns basic metrics-only analysis

### Deduplication Process

1. **Cache Check**: System checks if analysis exists in cache
2. **Cache Hit**: Returns cached analysis (< 1 hour old)
3. **Cache Miss**: Proceeds with AI analysis
4. **Session Tracking**: Marks profile as processed in current session
5. **Duplicate Prevention**: Skips profiles already analyzed in session

## Testing

### Run Test Script
```bash
node scripts/testAIFallback.js
```

This will test:
- Primary model analysis
- Cache retrieval
- Force refresh bypass
- Fallback scenario simulation
- Model status reporting

### Manual Testing with cURL

1. **Test primary model**:
```bash
curl -X POST http://localhost:5000/api/ai-analysis/test \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}'
```

2. **Check model status**:
```bash
curl http://localhost:5000/api/ai-analysis/status
```

3. **Clear caches**:
```bash
curl -X POST http://localhost:5000/api/ai-analysis/clear-cache
```

## Monitoring

### Key Metrics to Monitor

1. **Model Usage**
   - Calls per model
   - Error rates per model
   - Fallback frequency

2. **Cache Performance**
   - Cache hit rate
   - Duplicate prevention count
   - Memory usage

3. **Response Times**
   - AI analysis latency
   - Cache retrieval speed
   - Overall processing time

### Logging

The system logs important events:
- Model selection and fallback
- Cache hits and misses
- Duplicate detection
- Error details with model info

Example log entries:
```
INFO: Attempting analysis with deepseek-r1
WARN: deepseek-r1 quota exceeded, trying next model
INFO: Attempting analysis with grok
WARN: grok rate limited, trying next model
INFO: Attempting analysis with mistral
INFO: Successfully analyzed with mistral
INFO: Cache hit for profile: testuser_10000_100
INFO: Profile testuser already processed in this session, skipping
```

## Best Practices

1. **API Key Management**
   - Store keys in environment variables
   - Never commit keys to repository
   - Rotate keys regularly

2. **Cache Management**
   - Clear cache periodically for memory management
   - Monitor cache size in production
   - Adjust cache timeout based on needs

3. **Error Handling**
   - Monitor model error rates
   - Set up alerts for high failure rates
   - Have backup API keys ready

4. **Performance Optimization**
   - Use cache for frequently analyzed profiles
   - Batch similar profiles for efficiency
   - Monitor and adjust rate limits

## Troubleshooting

### Common Issues

1. **All models failing**
   - Check API key validity
   - Verify network connectivity
   - Check model service status

2. **High duplicate rate**
   - Clear duplicate tracking cache
   - Check session management
   - Verify profile identification logic

3. **Slow response times**
   - Check model latency
   - Optimize cache configuration
   - Consider adding more fallback models

### Debug Mode

Enable detailed logging:
```javascript
// In aiAnalysisService.js
logger.level = 'debug';
```

## Future Enhancements

Potential improvements:
- Add more AI models (Claude, GPT-4, etc.)
- Implement weighted model selection
- Add cost tracking per model
- Implement smart model routing based on profile type
- Add A/B testing for model performance
- Implement distributed caching with Redis

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Verify API keys are correct
3. Test with the provided test script
4. Monitor model status endpoint

---

**Note**: This system ensures high availability of AI analysis features while managing costs and preventing service disruptions through intelligent fallback and caching mechanisms.