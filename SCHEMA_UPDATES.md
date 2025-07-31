# Schema Updates Summary

## Changes Made

### 1. Collection Names
- `RootProfileScraped` → `rootprofiles_scraped_data`
- `RelatedProfileScraped` → `relatedprofiles_scraped_data`

### 2. Field Name Change
- `apifyRawResponse` → `profileData` (in both schemas)

## Test Results ✅

All tests passing successfully with the updated schemas:

### Test Execution Summary
- **Session Created**: Fashion Influencers Analysis (ID: 687df44cf6e3ff02f2a5109a)
- **Root Profile Created**: sof_alexa with 94,170 followers
- **Related Profile Created**: yisehh_99 at depth 1
- **All Queries Working**: Sessions, profiles by depth, statistics
- **Error Handling**: Tested and working
- **Aggregations**: Top influencers query successful

### Data Structure Confirmed
```javascript
// Root Profile (depth 0)
{
  sessionId: ObjectId,
  username: "sof_alexa",
  depth: 0,
  status: "scraped",
  profileData: {
    // Complete Apify response stored here
    followersCount: 94170,
    relatedProfiles: [...],
    latestPosts: [...],
    // ... all other Apify fields
  },
  metadata: {
    processingTime: 45.2,
    relatedProfilesCount: 85,
    // ... other metadata
  }
}

// Related Profile (depth 1+)
{
  sessionId: ObjectId,
  parentUsername: "sof_alexa",
  depth: 1,
  username: "yisehh_99",
  status: "scraped",
  profileData: {
    // Complete Apify response
  },
  metadata: {
    discoveredFrom: "relatedProfiles"
    // ... other metadata
  }
}
```

### Indexes Updated
All indexes have been updated to use `profileData` instead of `apifyRawResponse`:
- `profileData.followersCount`
- `profileData.verified`
- `profileData.isBusinessAccount`
- `profileData.private`

## Conclusion
The schemas are fully functional with the updated field names and collection names. All virtual properties, methods, and queries are working correctly.