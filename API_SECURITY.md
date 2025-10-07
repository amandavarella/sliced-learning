# YouTube API Key Security Configuration

## Current Configuration

### API Restrictions
✅ **Restricted to**: YouTube Data API v3 only

This ensures the API key can only be used to access YouTube Data API v3 and cannot be used for other Google Cloud services (Maps, Translate, etc.).

### Application Restrictions
✅ **Set to**: None

**Why**: Server-side API calls from Vercel's serverless functions don't have referers or static IP addresses. Setting application restrictions would break the integration.

## Security Best Practices Applied

1. **API Scope Limitation**: ✅
   - Key restricted to YouTube Data API v3 only
   - Prevents unauthorized use of other Google APIs

2. **Environment Variable Storage**: ✅
   - API key stored in environment variables (never in code)
   - `.env` file excluded from git via `.gitignore`
   - Vercel environment variables are encrypted at rest

3. **Quota Monitoring**: ✅
   - Free tier: 10,000 units/day
   - Monitor usage: [Google Cloud Console](https://console.cloud.google.com/apis/dashboard)

## Why Not More Restrictions?

### HTTP Referer Restrictions
❌ **Not applicable** for server-side calls
- Vercel serverless functions make backend requests
- No browser referer header in server-to-server calls
- Would cause "Requests from referer <empty> are blocked" errors

### IP Address Restrictions
❌ **Not practical** for Vercel
- Vercel uses dynamic IP addresses for serverless functions
- IP ranges change frequently
- Would require constant maintenance

## Monitoring & Alerts

### Check API Usage
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/dashboard)
2. Select your project
3. Click on "YouTube Data API v3"
4. View usage metrics and quotas

### Set Up Quota Alerts (Optional)
1. Go to [IAM & Admin → Quotas](https://console.cloud.google.com/iam-admin/quotas)
2. Search for "YouTube Data API v3"
3. Set up alert notifications for quota usage

## Testing After Restriction Changes

```bash
# Test API key directly
curl -s "https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=dQw4w9WgXcQ&key=YOUR_KEY" | jq -r '.items[0].snippet.title // .error.message'

# Expected: Video title (e.g., "Rick Astley - Never Gonna Give You Up...")
# If error: Wait 1-2 minutes for changes to propagate

# Test full integration
curl -X POST http://localhost:4000/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Expected: Status 200 with video metadata
```

## If Key Needs Rotation

1. **Generate new API key** in Google Cloud Console
2. **Apply same restrictions**:
   - API restrictions: YouTube Data API v3 only
   - Application restrictions: None
3. **Update environment variables**:
   - Local: `server/.env`
   - Vercel: Dashboard → Settings → Environment Variables
4. **Test both keys work** before deleting old key
5. **Delete old key** after verification

## Security Checklist

- [x] API key restricted to YouTube Data API v3 only
- [x] API key stored in environment variables (not in code)
- [x] `.env` file in `.gitignore`
- [x] `.env.example` provided for setup guidance
- [x] Vercel environment variables configured
- [x] Local and production testing passed
- [x] Documentation created for security configuration

## Verified Configuration Date

**Last Verified**: 2025-10-07
**Status**: ✅ Working with YouTube API v3 restriction applied
**Test Result**: Successfully retrieved video metadata with restricted key
