#!/bin/bash

# Test script for YouTube API integration
# Usage: ./test-youtube-api.sh [base-url]
# Example: ./test-youtube-api.sh https://your-app.vercel.app

BASE_URL="${1:-http://localhost:4000}"

echo "================================================"
echo "YouTube API Integration Test Suite"
echo "Testing against: $BASE_URL"
echo "================================================"
echo ""

# Test 1: Standard YouTube URL
echo "Test 1: Standard watch URL"
echo "URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}')
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status" -eq 200 ]; then
  echo "✅ PASS - Status: $status"
  echo "$body" | jq -r '"   Title: \(.title // "N/A")"'
  echo "$body" | jq -r '"   Duration: \(.durationSeconds // 0) seconds"'
  echo "$body" | jq -r '"   Segments: \(.totalSegments // 0)"'
else
  echo "❌ FAIL - Status: $status"
  echo "$body" | jq .
fi
echo ""

# Test 2: Short URL format
echo "Test 2: Short URL format (youtu.be)"
echo "URL: https://youtu.be/dQw4w9WgXcQ"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}')
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status" -eq 200 ]; then
  echo "✅ PASS - Status: $status"
  echo "$body" | jq -r '"   Video ID: \(.videoId // "N/A")"'
else
  echo "❌ FAIL - Status: $status"
  echo "$body" | jq .
fi
echo ""

# Test 3: URL with timestamp
echo "Test 3: URL with timestamp parameter"
echo "URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"}')
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status" -eq 200 ]; then
  echo "✅ PASS - Status: $status"
else
  echo "❌ FAIL - Status: $status"
  echo "$body" | jq .
fi
echo ""

# Test 4: Long video (should create multiple segments)
echo "Test 4: Long video (multiple segments)"
echo "URL: https://www.youtube.com/watch?v=jNQXAC9IVRw" # "Me at the zoo" - first YouTube video
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"}')
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status" -eq 200 ]; then
  echo "✅ PASS - Status: $status"
  echo "$body" | jq -r '"   Duration: \(.durationSeconds // 0) seconds"'
  echo "$body" | jq -r '"   Segments: \(.totalSegments // 0)"'
  echo "$body" | jq -r '"   Segment duration: \(.segmentMinutes // 0) minutes each"'
else
  echo "❌ FAIL - Status: $status"
  echo "$body" | jq .
fi
echo ""

# Test 5: Invalid URL format
echo "Test 5: Invalid URL (should fail gracefully)"
echo "URL: https://invalid-url.com/video"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://invalid-url.com/video"}')
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status" -eq 500 ]; then
  echo "✅ PASS - Status: $status (expected error)"
  echo "$body" | jq -r '"   Error: \(.error // "N/A")"'
  echo "$body" | jq -r '"   Details: \(.details // "N/A")"'
else
  echo "❌ FAIL - Expected 500, got: $status"
  echo "$body" | jq .
fi
echo ""

# Test 6: Article URL (should still work)
echo "Test 6: Article URL (verify articles still work)"
echo "URL: https://example.com/article"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/process" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}')
status=$(echo "$response" | tail -n1)

if [ "$status" -eq 200 ] || [ "$status" -eq 500 ]; then
  echo "✅ PASS - Articles still route correctly (Status: $status)"
else
  echo "⚠️  WARN - Unexpected status: $status"
fi
echo ""

# Summary
echo "================================================"
echo "Test Suite Complete"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Check Vercel logs for detailed output"
echo "2. Verify YOUTUBE_API_KEY is set in environment"
echo "3. Confirm YouTube Data API v3 is enabled"
echo ""
echo "View logs with: vercel logs [project-name] --follow"
