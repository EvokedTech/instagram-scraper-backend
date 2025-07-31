# Session Management API Documentation

## Overview
The Session Management API allows you to create and manage Instagram scraping sessions with unlimited root profiles.

## Base URL
```
http://localhost:5000/api/sessions
```

## Endpoints

### 1. Create New Session
Create a new scraping session with root profiles.

**Endpoint:** `POST /api/sessions`

**Request Body:**
```json
{
  "name": "Fashion Bloggers Analysis",
  "description": "Analyzing fashion blogger networks", // optional
  "rootProfiles": [
    "username1",                                    // plain username
    "@username2",                                   // username with @
    "https://www.instagram.com/username3/",        // full URL
    "instagram.com/username4"                       // URL without protocol
  ],
  "config": {                                      // optional
    "maxDepth": 2,                                 // 1-5, default: 2
    "maxProfilesPerDepth": 100,                    // 1-1000, default: 100
    "analysisEnabled": true                        // default: true
  }
}
```

**Success Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "687df44cf6e3ff02f2a5109a",
    "name": "Fashion Bloggers Analysis",
    "description": "Analyzing fashion blogger networks",
    "rootProfiles": [
      "https://www.instagram.com/username1/",
      "https://www.instagram.com/username2/",
      "https://www.instagram.com/username3/",
      "https://www.instagram.com/username4/"
    ],
    "config": {
      "maxDepth": 2,
      "maxProfilesPerDepth": 100,
      "analysisEnabled": true
    },
    "status": "pending",
    "stats": {
      "totalProfiles": 4,
      "scrapedProfiles": 0,
      "currentDepth": 0
    },
    "createdAt": "2025-01-20T10:00:00Z"
  },
  "message": "Session created successfully with 4 root profiles"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid input data
- `409 Conflict` - Session with same name already exists

### 2. Get All Sessions
Retrieve all sessions with pagination and filtering.

**Endpoint:** `GET /api/sessions`

**Query Parameters:**
- `status` - Filter by status (pending, running, paused, completed, failed)
- `limit` - Number of results per page (default: 20)
- `offset` - Number of results to skip (default: 0)
- `sort` - Sort field and order (default: -createdAt)

**Example:** `GET /api/sessions?status=running&limit=10&offset=0`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "687df44cf6e3ff02f2a5109a",
      "name": "Fashion Bloggers Analysis",
      "status": "running",
      "stats": {
        "totalProfiles": 150,
        "scrapedProfiles": 45,
        "currentDepth": 1
      },
      "createdAt": "2025-01-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "pages": 3
  }
}
```

### 3. Get Session Details
Get detailed information about a specific session.

**Endpoint:** `GET /api/sessions/:id`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "session": {
      "_id": "687df44cf6e3ff02f2a5109a",
      "name": "Fashion Bloggers Analysis",
      "description": "Analyzing fashion blogger networks",
      "rootProfiles": ["https://www.instagram.com/username1/"],
      "config": {
        "maxDepth": 2,
        "maxProfilesPerDepth": 100,
        "analysisEnabled": true
      },
      "status": "running",
      "stats": {
        "totalProfiles": 150,
        "scrapedProfiles": 45,
        "currentDepth": 1,
        "startedAt": "2025-01-20T10:05:00Z"
      },
      "progressPercentage": 30,
      "duration": 3600000
    },
    "profileStats": {
      "rootProfiles": {
        "pending": 2,
        "scraped": 2,
        "failed": 0
      },
      "relatedProfiles": [
        {
          "_id": 1,
          "stats": [
            { "status": "scraped", "count": 41 },
            { "status": "pending", "count": 59 }
          ],
          "total": 100
        }
      ]
    }
  }
}
```

**Error Response:**
- `404 Not Found` - Session not found

### 4. Update Session Status
Update the status of a session (start, pause, resume, stop).

**Endpoint:** `PUT /api/sessions/:id/status`

**Request Body:**
```json
{
  "status": "running"  // or "paused", "completed", "failed"
}
```

**Valid Status Transitions:**
- `pending` → `running` (start)
- `running` → `paused` (pause)
- `paused` → `running` (resume)
- `running` → `completed` (complete)
- `running` → `failed` (stop with error)

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "687df44cf6e3ff02f2a5109a",
    "status": "running",
    "stats": {
      "startedAt": "2025-01-20T10:05:00Z"
    }
  },
  "message": "Session started successfully"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid status or transition
- `404 Not Found` - Session not found

### 5. Get Session Statistics
Get detailed statistics for a session.

**Endpoint:** `GET /api/sessions/:id/stats`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "session": {
      "name": "Fashion Bloggers Analysis",
      "status": "running",
      "progress": 30,
      "duration": 3600000
    },
    "profiles": {
      "total": 145,
      "rootProfiles": {
        "total": 4,
        "scraped": 4
      },
      "relatedProfiles": {
        "total": 141,
        "byDepth": [
          {
            "_id": 1,
            "stats": [
              { "status": "scraped", "count": 41 },
              { "status": "pending", "count": 59 }
            ],
            "total": 100
          },
          {
            "_id": 2,
            "stats": [
              { "status": "pending", "count": 41 }
            ],
            "total": 41
          }
        ]
      }
    },
    "topInfluencers": [
      {
        "username": "fashion_guru",
        "profileUrl": "https://www.instagram.com/fashion_guru/",
        "depth": 1,
        "followersCount": 1250000,
        "verified": true
      }
    ]
  }
}
```

### 6. Delete Session
Soft delete a session (marks as deleted, doesn't remove data).

**Endpoint:** `DELETE /api/sessions/:id`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Session deleted successfully"
}
```

**Error Responses:**
- `400 Bad Request` - Cannot delete running session
- `404 Not Found` - Session not found

## Input Validation

### Root Profiles Format
The API accepts root profiles in multiple formats:
- Plain username: `"fashionblogger"`
- Username with @: `"@fashionblogger"`
- Full Instagram URL: `"https://www.instagram.com/fashionblogger/"`
- URL without protocol: `"instagram.com/fashionblogger"`

All formats are automatically normalized to: `https://www.instagram.com/username/`

### Validation Rules
- **Username**: Must contain only letters, numbers, periods, and underscores
- **Session Name**: Required, non-empty string
- **Root Profiles**: At least one valid profile required
- **Max Depth**: Between 1 and 5
- **Max Profiles Per Depth**: Between 1 and 1000

## Error Handling

All error responses follow this format:
```json
{
  "success": false,
  "error": "Error message",
  "details": ["Additional error details if applicable"]
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Internal Server Error