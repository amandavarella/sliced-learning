# Quick Start: Fix YouTube 410 Error

**Problem**: YouTube videos fail on Vercel with HTTP 410 error
**Solution**: Switch from ytdl-core to YouTube Data API v3
**Time**: 10 minutes

---

## Step 1: Get YouTube API Key (5 min)

1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Click "Enable APIs and Services"
4. Search "YouTube Data API v3" and click Enable
5. Go to Credentials → Create Credentials → API Key
6. Copy the API key
7. (Optional) Click "Restrict Key" → API restrictions → Select "YouTube Data API v3"

---

## Step 2: Install Dependencies

```bash
cd server
npm install dotenv
```

---

## Step 3: Update Code (2 changes)

### Change 1: server/src/index.js

Add at the **very top** of the file:
```javascript
import "dotenv/config";
```

Then find this line (around line 5):
```javascript
import { processVideo } from "./services/videoService.js";
```

Change it to:
```javascript
import { processVideo } from "./services/videoService.v2.js";
```

---

## Step 4: Configure Environment Variables

### For Vercel:
1. Go to Vercel Dashboard → Your Project → Settings
2. Click "Environment Variables"
3. Add new variable:
   - **Name**: `YOUTUBE_API_KEY`
   - **Value**: [paste your API key from Step 1]
   - **Environment**: Check all (Production, Preview, Development)
4. Click "Save"

### For Local Development:
Create `server/.env`:
```bash
YOUTUBE_API_KEY=your_api_key_here
```

---

## Step 5: Test Locally

```bash
# Start server
cd server
npm run dev

# In another terminal, test with a YouTube URL:
curl -X POST http://localhost:4000/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

**Expected**: Status 200 with video metadata and segments

---

## Step 6: Deploy to Vercel

```bash
git add .
git commit -m "Fix YouTube 410 error with Data API v3"
git push
```

Vercel will auto-deploy. Wait 1-2 minutes, then test your production URL.

---

## Step 7: Verify on Vercel

Test your production deployment:
```bash
curl -X POST https://your-app.vercel.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}'
```

Or run the automated test suite:
```bash
./test-youtube-api.sh https://your-app.vercel.app
```

---

## Troubleshooting

### "YOUTUBE_API_KEY environment variable is not configured"
- Go to Vercel dashboard
- Settings → Environment Variables
- Verify `YOUTUBE_API_KEY` is set
- Redeploy (Deployments → Latest → Redeploy)

### "YouTube API quota exceeded or invalid API key"
- Verify API key is correct in Vercel dashboard
- Go to https://console.cloud.google.com/
- APIs & Services → Library
- Confirm "YouTube Data API v3" shows "API enabled"
- Check quota: APIs & Services → Dashboard → YouTube Data API v3

### Still getting 410 errors
- You may be using the old service
- Check `server/src/index.js` line 5: should import from `videoService.v2.js`
- Verify changes were committed and deployed
- Check Vercel logs for which service is being called

### Works locally but not on Vercel
- Environment variable must be set in Vercel dashboard (not just .env)
- After adding env var, trigger new deployment
- Check Vercel logs for actual error message

---

## What Changed?

| Before | After |
|--------|-------|
| ytdl-core web scraping | YouTube Data API v3 |
| No API key needed | Requires API key |
| Fails on Vercel (410) | Works everywhere ✅ |
| Generic errors | Specific error messages ✅ |
| No environment variables | YOUTUBE_API_KEY required |

---

## Test URLs

Test these different YouTube URL formats:

```bash
# Standard watch URL
https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Short URL
https://youtu.be/dQw4w9WgXcQ

# With timestamp
https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s

# Mobile URL
https://m.youtube.com/watch?v=dQw4w9WgXcQ

# Shorts
https://www.youtube.com/shorts/[VIDEO_ID]
```

All should work with the new implementation.

---

## API Quota

**Free tier**: 10,000 units/day
**Cost per video**: 1 unit
**Result**: 10,000 videos/day for free

To check usage:
1. Go to https://console.cloud.google.com/
2. APIs & Services → Dashboard
3. Click "YouTube Data API v3"
4. View "Queries per day" chart

---

## Rollback (if needed)

If something goes wrong:

1. Edit `server/src/index.js`
2. Change this line:
   ```javascript
   import { processVideo } from "./services/videoService.js";
   ```
3. Commit and push

Note: Original version still won't work on Vercel (410 error remains), but articles will work.

---

## Documentation

- **Full details**: See `YOUTUBE_FIX.md`
- **Implementation guide**: See `IMPLEMENTATION_SUMMARY.md`
- **Test script**: Run `./test-youtube-api.sh`

---

## Success Checklist

- [ ] YouTube API key obtained
- [ ] dotenv installed (`npm install dotenv`)
- [ ] index.js imports dotenv at top
- [ ] index.js imports videoService.v2.js
- [ ] YOUTUBE_API_KEY set in Vercel dashboard
- [ ] YOUTUBE_API_KEY in server/.env for local dev
- [ ] Local test passes (curl returns 200)
- [ ] Vercel deployment succeeds
- [ ] Production test passes
- [ ] Vercel logs show successful processing

Done! YouTube videos should now work on Vercel. 🎉
