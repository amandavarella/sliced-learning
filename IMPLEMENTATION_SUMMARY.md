# YouTube 410 Error Fix - Implementation Summary

## Root Cause
**ytdl-core v4.11.5 is incompatible with Vercel's serverless environment.** YouTube blocks datacenter IPs with HTTP 410 responses. The library scrapes YouTube's web pages directly instead of using the official API.

## Solution
Migrate to **YouTube Data API v3** - the official Google API that works from any IP address and has clear error messages.

---

## Code Changes

### 1. Enhanced Logging (Already Applied)

#### File: `server/src/index.js`

```diff
@@ -55,18 +55,27 @@ app.post("/api/process", async (request, response) => {

   try {
     const trimmedUrl = String(url).trim();
-    const payload = isYouTubeLink(trimmedUrl)
+    const contentType = isYouTubeLink(trimmedUrl) ? "video" : "article";
+    console.log("[api/process] Processing request:", {
+      url: trimmedUrl,
+      contentType,
+    });
+
+    const payload = contentType === "video"
       ? await processVideo(trimmedUrl)
       : await processArticle(trimmedUrl);

@@ -82,10 +91,19 @@ app.post("/api/process", async (request, response) => {

     await saveTraining(record.id, record.sourceUrl, record.payload, record.progress);

+    console.log("[api/process] Processing succeeded:", {
+      contentType,
+      shareId,
+      segmentCount: payload.segments.length,
+    });
+
     response.json(buildResponsePayload(record, request));

   } catch (error) {
-    console.error("Processing failed", error.message);
+    console.error("[api/process] Processing failed:", {
+      url: request.body?.url,
+      errorMessage: error.message,
+      errorName: error.name,
+      errorStack: error.stack,
+    });
     response.status(500).json({
       error: "Unable to process the provided URL.",
       details: error.message,
```

#### File: `server/src/services/videoService.js`

```diff
@@ -7,8 +7,14 @@ const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;
 const isValidYouTubeUrl = (url) => {
   try {
     return ytdl.validateURL(url);
   } catch (error) {
+    console.error("[videoService] URL validation failed:", {
+      url,
+      error: error.message,
+    });
     return false;
   }
 };

 export const processVideo = async (url) => {
+  console.log("[videoService] Starting video processing:", { url });
+
   if (!isValidYouTubeUrl(url)) {
+    console.error("[videoService] Invalid YouTube URL:", { url });
     throw new Error("Unsupported YouTube URL");
   }

-  const info = await ytdl.getBasicInfo(url);
+  try {
+    console.log("[videoService] Calling ytdl.getBasicInfo");
+    const info = await ytdl.getBasicInfo(url);
+    console.log("[videoService] ytdl.getBasicInfo succeeded:", {
+      videoId: info.videoDetails.videoId,
+      title: info.videoDetails.title,
+      lengthSeconds: info.videoDetails.lengthSeconds,
+    });
+
     const durationSeconds = Number.parseInt(info.videoDetails.lengthSeconds, 10);
     const segments = buildTimingSegments(durationSeconds, SEGMENT_SECONDS);

@@ -39,4 +56,15 @@ export const processVideo = async (url) => {
       })),
     };
+  } catch (error) {
+    console.error("[videoService] ytdl.getBasicInfo failed:", {
+      url,
+      errorMessage: error.message,
+      errorName: error.name,
+      statusCode: error.statusCode,
+      stack: error.stack,
+    });
+    throw error;
+  }
 };
```

### 2. New Implementation with YouTube Data API v3

#### New File: `server/src/services/videoService.v2.js`

Complete new implementation - see file content in the repository.

**Key features:**
- Supports all YouTube URL formats (watch, shorts, youtu.be, embed)
- Uses official YouTube Data API v3
- Parses ISO 8601 duration format
- Comprehensive error handling with specific messages
- Structured logging at every step
- No secrets logged (only checks API key existence)

### 3. Environment Configuration

#### New File: `server/.env.example`

```bash
# YouTube Data API v3 Key
# Required for video processing in production
# Get your API key from: https://console.cloud.google.com/apis/credentials
# Enable "YouTube Data API v3" in your Google Cloud project
YOUTUBE_API_KEY=your_api_key_here
```

---

## Deployment Steps

### Step 1: Get YouTube API Key

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project
3. Enable "YouTube Data API v3"
4. Create API Key under Credentials
5. Restrict to YouTube Data API v3 only

### Step 2: Install dotenv

```bash
cd server
npm install dotenv
```

### Step 3: Update server/src/index.js

Add at the very top:
```javascript
import "dotenv/config";
```

Then change the import:
```javascript
// FROM:
import { processVideo } from "./services/videoService.js";

// TO:
import { processVideo } from "./services/videoService.v2.js";
```

### Step 4: Configure Environment Variables

**Vercel Dashboard:**
1. Go to Project Settings → Environment Variables
2. Add `YOUTUBE_API_KEY` with your API key
3. Apply to Production, Preview, and Development

**Local Development:**
Create `server/.env`:
```bash
YOUTUBE_API_KEY=your_actual_api_key_here
```

### Step 5: Test Locally

```bash
cd server
npm run dev

# In another terminal:
curl -X POST http://localhost:4000/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

**Expected output:**
- Status: 200
- Body includes: `"type": "video"`, segments array, video metadata

### Step 6: Deploy to Vercel

```bash
git add .
git commit -m "Fix YouTube 410 error with Data API v3"
git push
```

### Step 7: Verify on Vercel

Check logs in Vercel dashboard:
```
✅ [api/process] Processing request: { url: '...', contentType: 'video' }
✅ [videoService] Extracted video ID: { videoId: '...' }
✅ [videoService] YouTube Data API response: { status: 200, itemCount: 1 }
✅ [videoService] Video metadata retrieved: { videoId, title, durationSeconds }
✅ [api/process] Processing succeeded
```

---

## Test Commands

### Basic Functionality Test
```bash
# Test standard YouTube URL
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq .

# Test short URL format
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}' | jq .

# Test shorts format
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/shorts/SHORT_ID"}' | jq .
```

### Error Handling Test
```bash
# Test invalid URL
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/invalid"}' | jq .
# Expected: 500 with "Invalid YouTube URL format"

# Test private video (use any private video ID)
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=PRIVATE_ID"}' | jq .
# Expected: 500 with "Video not found or is private/unavailable"
```

### Automated Test Script
```bash
#!/bin/bash
# Save as test-youtube.sh

BASE_URL="${1:-https://your-app.vercel.app}"

echo "Testing YouTube processing on $BASE_URL"
echo ""

# Test cases: URL and expected status
declare -A tests=(
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]=200
  ["https://youtu.be/dQw4w9WgXcQ"]=200
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"]=200
  ["https://invalid-url"]=500
)

for url in "${!tests[@]}"; do
  expected_status="${tests[$url]}"
  echo "Testing: $url"

  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/api/process" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}")

  if [ "$status" -eq "$expected_status" ]; then
    echo "✅ PASS - Got $status (expected $expected_status)"
  else
    echo "❌ FAIL - Got $status (expected $expected_status)"
  fi
  echo ""
done
```

---

## Vercel Settings Checklist

- [x] **Environment Variables**
  - `YOUTUBE_API_KEY` added to Vercel dashboard
  - Applied to Production, Preview, Development

- [x] **Runtime Configuration**
  - Using Node.js Functions (not Edge) ✅ Already configured in vercel.json
  - Node version: 18.x or 20.x

- [x] **API Routes**
  - `api/index.mjs` exists and exports Express app
  - `vercel.json` includes `includeFiles: "server/src/**"`
  - Routes configured: `/api/(.*)` → `/api/index.mjs`

- [ ] **Monitoring**
  - Enable Vercel logs
  - Set up alerts for 500 errors (optional)
  - Monitor YouTube API quota in Google Cloud Console

---

## Expected Logs After Deployment

### Successful Request
```
[api/process] Processing request: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  contentType: 'video'
}
[videoService] Starting video processing: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
}
[videoService] Extracted video ID: { videoId: 'dQw4w9WgXcQ' }
[videoService] Calling YouTube Data API: {
  videoId: 'dQw4w9WgXcQ',
  apiUrl: 'https://www.googleapis.com/youtube/v3/videos',
  hasApiKey: true
}
[videoService] YouTube Data API response: {
  status: 200,
  itemCount: 1
}
[videoService] Video metadata retrieved: {
  videoId: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up',
  durationISO: 'PT3M32S',
  durationSeconds: 212
}
[api/process] Processing succeeded: {
  contentType: 'video',
  shareId: '...',
  segmentCount: 1
}
```

### Failed Request (Invalid API Key)
```
[api/process] Processing request: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  contentType: 'video'
}
[videoService] Starting video processing: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
}
[videoService] Extracted video ID: { videoId: 'dQw4w9WgXcQ' }
[videoService] Calling YouTube Data API: {
  videoId: 'dQw4w9WgXcQ',
  apiUrl: 'https://www.googleapis.com/youtube/v3/videos',
  hasApiKey: true
}
[videoService] YouTube Data API error response: {
  status: 403,
  statusText: 'Forbidden',
  data: { error: { code: 403, message: '...' } }
}
[videoService] Video processing failed: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  errorMessage: 'YouTube API quota exceeded or invalid API key'
}
[api/process] Processing failed: {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  errorMessage: 'YouTube API quota exceeded or invalid API key'
}
```

---

## Rollback Plan

If issues occur:

1. Change one line in `server/src/index.js`:
   ```javascript
   import { processVideo } from "./services/videoService.js"; // Back to old version
   ```

2. Commit and push:
   ```bash
   git add server/src/index.js
   git commit -m "Rollback to ytdl-core"
   git push
   ```

Note: The old version will still fail on Vercel (410 error), but at least you have a known state.

---

## Trade-offs Analysis

| Aspect | ytdl-core (Old) | YouTube Data API v3 (New) |
|--------|----------------|---------------------------|
| **Reliability** | ❌ Breaks on Vercel | ✅ Works everywhere |
| **Setup** | ✅ No config needed | ❌ Requires API key |
| **Cost** | ✅ Free | ✅ Free (10k/day quota) |
| **Maintenance** | ❌ Needs frequent updates | ✅ Stable API |
| **Error Messages** | ❌ Generic "410" | ✅ Specific errors |
| **Production Ready** | ❌ No | ✅ Yes |

**Recommendation:** Use YouTube Data API v3 for production deployments.

---

## Next Steps (Optional Enhancements)

1. **Add Caching**
   - Store video metadata in your database
   - Check cache before calling YouTube API
   - Reduces API quota usage by ~90%

2. **Add Retry Logic**
   - Implement exponential backoff for API errors
   - Handle transient network failures

3. **Quota Monitoring**
   - Track daily API usage
   - Alert when approaching quota limits
   - Implement rate limiting on your endpoint

4. **Support Playlists**
   - Extract all video IDs from playlist
   - Process each video separately
   - Combine into one training session

---

## Questions & Troubleshooting

**Q: I see "YOUTUBE_API_KEY environment variable is not configured"**
A: Add the environment variable in Vercel dashboard and redeploy

**Q: Getting 403 errors from YouTube API**
A: Check that:
- API key is correct
- YouTube Data API v3 is enabled in Google Cloud
- You haven't exceeded quota (check Google Cloud Console)

**Q: Works locally but fails on Vercel**
A: Ensure environment variable is set in Vercel dashboard for all environments

**Q: How do I check my quota usage?**
A: Google Cloud Console → APIs & Services → Dashboard → YouTube Data API v3

**Q: Can I increase the quota?**
A: Yes, request quota increase in Google Cloud Console or upgrade to paid tier

---

## Success Criteria ✅

- [ ] YouTube videos process successfully on Vercel production
- [ ] Logs show clear flow from request to success
- [ ] Error messages are actionable (not generic 410)
- [ ] No secrets appear in logs
- [ ] All URL formats supported (watch, shorts, youtu.be)
- [ ] Blog article processing still works
- [ ] Local development works with .env file
- [ ] Vercel preview deployments work
