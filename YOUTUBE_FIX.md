# YouTube Processing Fix for Vercel Production

## Root Cause Analysis

### The Problem
YouTube video slicing fails on Vercel with HTTP 410 ("Gone") error, but works locally.

### Why It Happens
1. **ytdl-core v4.11.5** scrapes YouTube's web pages directly (no official API)
2. YouTube actively **blocks datacenter IPs** with 410 responses as anti-bot measure
3. **Vercel serverless functions** run from datacenter IPs → blocked by YouTube
4. **Local development** uses residential ISP IPs → allowed by YouTube
5. The library is **outdated** (2022) and YouTube has strengthened anti-bot measures since then

### Current External Requests
- **File**: `server/src/services/videoService.js:20`
- **Call**: `ytdl.getBasicInfo(url)`
- **Target**: YouTube web pages (not official API)
- **Env vars**: None required (that's part of the problem)
- **Result**: 410 errors on Vercel, success locally

---

## Solution: Migrate to YouTube Data API v3

### Why YouTube Data API v3?
✅ Official Google API - stable, supported, documented
✅ Works from any IP (datacenter, residential, serverless)
✅ Simple REST API - just need video ID and API key
✅ Returns duration in ISO 8601 format (e.g., "PT4M13S")
✅ Free quota: 10,000 units/day (1 unit per video lookup = 10,000 videos/day)
✅ Better error messages and retry capability

### Trade-offs
- ❌ Requires Google Cloud API key (5-minute setup)
- ❌ Has quota limits (but 10k/day is generous for most use cases)
- ✅ Much more reliable than web scraping
- ✅ No more 410 errors
- ✅ Works on Vercel, Netlify, AWS Lambda, etc.

---

## Implementation

### 1. Get YouTube API Key (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3**:
   - APIs & Services → Library
   - Search "YouTube Data API v3"
   - Click "Enable"
4. Create API Key:
   - APIs & Services → Credentials
   - Create Credentials → API Key
   - Copy the generated key
5. (Recommended) Restrict the key:
   - Edit API key → API restrictions
   - Select "YouTube Data API v3" only

### 2. Add Environment Variable

**Vercel Dashboard:**
```
Settings → Environment Variables → Add New
Name: YOUTUBE_API_KEY
Value: [your API key from step 1]
```

**Local development** (create `server/.env`):
```bash
YOUTUBE_API_KEY=your_api_key_here
```

### 3. Install dotenv for Local Development

```bash
cd server
npm install dotenv
```

### 4. Update server/src/index.js

Add at the very top:
```javascript
import "dotenv/config";
```

### 5. Switch to New Video Service

Replace the import in `server/src/index.js`:

**Before:**
```javascript
import { processVideo } from "./services/videoService.js";
```

**After:**
```javascript
import { processVideo } from "./services/videoService.v2.js";
```

### 6. Deploy to Vercel

```bash
git add .
git commit -m "Fix YouTube processing with Data API v3

- Replace ytdl-core with YouTube Data API v3
- Add structured logging for debugging
- Support all YouTube URL formats (watch, shorts, youtu.be)
- Add YOUTUBE_API_KEY environment variable
- Improve error messages

Fixes 410 error in production by using official API instead of web scraping"
git push
```

Vercel will auto-deploy. Check logs to verify it's using the new service.

---

## Logging Changes

Enhanced logging throughout the YouTube processing path:

### server/src/index.js:66-69
```javascript
console.log("[api/process] Processing request:", {
  url: trimmedUrl,
  contentType,
});
```

### server/src/services/videoService.v2.js
- Line 120: Log video ID extraction
- Line 77: Log YouTube API call with request details
- Line 82: Log API response summary
- Line 88-102: Detailed error logging with status codes

**No secrets are logged** - API key existence is checked with `Boolean(apiKey)` only.

---

## Test Plan

### Test Matrix

| URL Type | Example | Expected Result |
|----------|---------|-----------------|
| Standard watch | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | ✅ Segments generated |
| Short link | `https://youtu.be/dQw4w9WgXcQ` | ✅ Segments generated |
| Shorts | `https://www.youtube.com/shorts/dQw4w9WgXcQ` | ✅ Segments generated |
| Embed | `https://www.youtube.com/embed/dQw4w9WgXcQ` | ✅ Segments generated |
| Long video (>1hr) | Any video > 60 min | ✅ Multiple 10-min segments |
| Private video | Any private video | ❌ Clear error: "Video not found or is private/unavailable" |
| Invalid API key | Set wrong key | ❌ Clear error: "YouTube API quota exceeded or invalid API key" |

### Local Testing (Production Mode)

```bash
# Terminal 1: Start server with production env
cd server
NODE_ENV=production npm start

# Terminal 2: Test the API
curl -X POST http://localhost:4000/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

**Expected response:**
```json
{
  "type": "video",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video)",
  "videoId": "dQw4w9WgXcQ",
  "sourceUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "segmentMinutes": 10,
  "totalSegments": 1,
  "durationSeconds": 212,
  "segments": [...]
}
```

### Vercel Preview Testing

```bash
# Deploy to preview
git push origin your-branch

# Test preview deployment
curl -X POST https://your-preview-url.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}'
```

### Production Testing

```bash
# After merging to main
curl -X POST https://your-production-url.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/shorts/your-short-id"}'
```

### Test Different URL Formats

```bash
# Create test script
cat > test-youtube-urls.sh << 'EOF'
#!/bin/bash

API_URL="${1:-http://localhost:4000}"

echo "Testing YouTube URL formats against $API_URL"

urls=(
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  "https://youtu.be/dQw4w9WgXcQ"
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"
  "https://m.youtube.com/watch?v=dQw4w9WgXcQ"
)

for url in "${urls[@]}"; do
  echo ""
  echo "Testing: $url"
  curl -X POST "$API_URL/api/process" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}" \
    -s -o /dev/null -w "HTTP %{http_code}\n"
done
EOF

chmod +x test-youtube-urls.sh

# Run tests
./test-youtube-urls.sh http://localhost:4000
```

### Check Vercel Logs

```bash
# Install Vercel CLI if needed
npm i -g vercel

# View real-time logs
vercel logs your-project-name --follow

# Look for:
# ✅ "[api/process] Processing request: { url: '...', contentType: 'video' }"
# ✅ "[videoService] Extracted video ID: { videoId: '...' }"
# ✅ "[videoService] Video metadata retrieved: { videoId, title, durationSeconds }"
# ✅ "[api/process] Processing succeeded: { contentType: 'video', ... }"
```

---

## Acceptance Criteria

✅ **POST /api/process returns 200** for all supported YouTube URL formats in production
✅ **Client displays segments** correctly for YouTube videos on Vercel
✅ **Logs show clear flow** from request → video ID → API call → success
✅ **Error messages are specific**:
  - "Invalid YouTube URL format" (bad URL)
  - "Video not found or is private/unavailable" (private/deleted video)
  - "YouTube API quota exceeded or invalid API key" (API issue)
  - "YOUTUBE_API_KEY environment variable is not configured" (missing key)
✅ **No secrets logged** - only presence/absence of API key is logged
✅ **Works on Vercel preview and production** environments

---

## Vercel Configuration Checklist

### Environment Variables
- [ ] `YOUTUBE_API_KEY` is set in Vercel dashboard
- [ ] Environment variable is applied to Production, Preview, and Development
- [ ] Value is saved and deployment is re-triggered

### Build & Runtime Settings
- [ ] **Runtime**: Node.js Functions (not Edge)
  - Current config uses Serverless Functions ✅
  - Edge Runtime doesn't support all Node.js APIs
- [ ] **Node Version**: 18.x or 20.x (check Vercel dashboard)
- [ ] **Timeout**: Default 10s is fine for API calls
- [ ] **Memory**: Default 1024 MB is sufficient

### API Route Configuration
- [ ] `api/index.mjs` exists and exports Express app
- [ ] `vercel.json` routes `/api/*` correctly to function
- [ ] Function includes server files via `includeFiles` pattern

### Deployment
- [ ] No build errors in Vercel build logs
- [ ] Function size is reasonable (should be < 50 MB)
- [ ] Environment variables are masked in logs

---

## Rollback Plan

If the new implementation fails:

1. **Immediate rollback** - change one line in `server/src/index.js`:
   ```javascript
   // Rollback: change this
   import { processVideo } from "./services/videoService.v2.js";

   // Back to this
   import { processVideo } from "./services/videoService.js";
   ```

2. **Commit and push**:
   ```bash
   git add server/src/index.js
   git commit -m "Rollback to ytdl-core temporarily"
   git push
   ```

3. Note: Original ytdl-core will still fail on Vercel, but at least articles work

---

## Long-term Considerations

### Quota Management
- **Free tier**: 10,000 units/day
- **Cost per video lookup**: 1 unit
- **When to upgrade**: If you exceed 10k videos/day
- **Monitoring**: Check Google Cloud Console → APIs & Services → Quotas

### Caching Strategy (Future Enhancement)
To reduce API calls:
- Cache video metadata (title, duration) in your storage layer
- Use `shareId` to check if video was already processed
- Only call YouTube API for new, uncached videos
- Implement TTL (e.g., 7 days) to refresh stale data

### Alternative Solutions Considered
1. **@distube/ytdl-core** - Unmaintained fork, same 410 issues
2. **yt-dlp** - Python binary, hard to deploy on Vercel
3. **youtubei.js** - Reverse-engineered API, fragile like ytdl-core
4. **YouTube Data API v3** ✅ **CHOSEN** - Official, stable, production-ready

---

## Questions?

- **Q: Why not use yt-dlp?**
  A: Requires Python binary, doesn't work in Vercel's Node.js serverless runtime

- **Q: Can I avoid the API key requirement?**
  A: No reliable solution exists. All web scraping methods fail on cloud IPs.

- **Q: What if I hit quota limits?**
  A: Implement caching (see above) or upgrade to paid tier ($0.10 per 10,000 units)

- **Q: Does this work for downloading videos?**
  A: No, this only gets metadata (title, duration). The client embeds YouTube's player.

- **Q: Will this break local development?**
  A: No, just add YOUTUBE_API_KEY to server/.env (see .env.example)
