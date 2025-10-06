import axios from "axios";
import { buildTimingSegments } from "../utils/segmentation.js";

const SEGMENT_MINUTES = 10;
const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;

/**
 * Extract YouTube video ID from various URL formats
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/
 */
const extractVideoId = (url) => {
  try {
    const urlObj = new URL(url);

    // youtu.be/VIDEO_ID
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1).split("?")[0];
    }

    // youtube.com/watch?v=VIDEO_ID
    if (urlObj.searchParams.has("v")) {
      return urlObj.searchParams.get("v");
    }

    // youtube.com/shorts/VIDEO_ID or youtube.com/embed/VIDEO_ID
    const pathMatch = urlObj.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
    if (pathMatch) {
      return pathMatch[2];
    }

    return null;
  } catch (error) {
    console.error("[videoService] Failed to parse URL:", {
      url,
      error: error.message,
    });
    return null;
  }
};

/**
 * Parse ISO 8601 duration (e.g., "PT4M13S") to seconds
 */
const parseISO8601Duration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Fetch video metadata from YouTube Data API v3
 */
const fetchVideoMetadata = async (videoId) => {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY environment variable is not configured");
  }

  const apiUrl = "https://www.googleapis.com/youtube/v3/videos";
  const params = {
    part: "snippet,contentDetails",
    id: videoId,
    key: apiKey,
  };

  console.log("[videoService] Calling YouTube Data API:", {
    videoId,
    apiUrl,
    hasApiKey: Boolean(apiKey),
  });

  try {
    const response = await axios.get(apiUrl, { params, timeout: 10000 });

    console.log("[videoService] YouTube Data API response:", {
      status: response.status,
      itemCount: response.data.items?.length || 0,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error("Video not found or is private/unavailable");
    }

    return response.data.items[0];
  } catch (error) {
    if (error.response) {
      console.error("[videoService] YouTube Data API error response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });

      if (error.response.status === 403) {
        throw new Error("YouTube API quota exceeded or invalid API key");
      }
      if (error.response.status === 404) {
        throw new Error("Video not found");
      }

      throw new Error(`YouTube API error: ${error.response.status} ${error.response.statusText}`);
    }

    throw error;
  }
};

export const processVideo = async (url) => {
  console.log("[videoService] Starting video processing:", { url });

  const videoId = extractVideoId(url);

  if (!videoId) {
    console.error("[videoService] Failed to extract video ID:", { url });
    throw new Error("Invalid YouTube URL format");
  }

  console.log("[videoService] Extracted video ID:", { videoId });

  try {
    const videoData = await fetchVideoMetadata(videoId);

    const title = videoData.snippet.title;
    const durationISO = videoData.contentDetails.duration;
    const durationSeconds = parseISO8601Duration(durationISO);

    console.log("[videoService] Video metadata retrieved:", {
      videoId,
      title,
      durationISO,
      durationSeconds,
    });

    if (durationSeconds === 0) {
      throw new Error("Unable to determine video duration");
    }

    const segments = buildTimingSegments(durationSeconds, SEGMENT_SECONDS);

    return {
      type: "video",
      title,
      videoId,
      sourceUrl: url,
      segmentMinutes: SEGMENT_MINUTES,
      totalSegments: segments.length,
      durationSeconds,
      segments: segments.map((segment, index) => ({
        ...segment,
        cue: {
          start: new Date(segment.startSeconds * 1000).toISOString().substring(11, 19),
          end: new Date(segment.endSeconds * 1000).toISOString().substring(11, 19),
        },
        label: `Segment ${index + 1}`,
      })),
    };
  } catch (error) {
    console.error("[videoService] Video processing failed:", {
      url,
      videoId,
      errorMessage: error.message,
      errorName: error.name,
    });
    throw error;
  }
};
