import axios from "axios";
import { buildTimingSegments } from "../utils/segmentation.js";

const SEGMENT_MINUTES = 10;
const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;

const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

const isValidYouTubeUrl = (url) => {
  return extractVideoId(url) !== null;
};

const parseDuration = (isoDuration) => {
  // Parse ISO 8601 duration format (PT1H2M3S)
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);

  return hours * 3600 + minutes * 60 + seconds;
};

const fetchVideoMetadata = async (videoId) => {
  // If YouTube Data API key is provided, use it (most reliable)
  if (process.env.YOUTUBE_API_KEY) {
    try {
      console.info(`[videoService] Using YouTube Data API`);
      const apiResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos`,
        {
          params: {
            part: "snippet,contentDetails",
            id: videoId,
            key: process.env.YOUTUBE_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (apiResponse.data.items && apiResponse.data.items.length > 0) {
        const item = apiResponse.data.items[0];
        const duration = parseDuration(item.contentDetails.duration);
        return {
          title: item.snippet.title,
          videoId,
          durationSeconds: duration,
        };
      }
    } catch (apiError) {
      console.warn(
        `[videoService] YouTube Data API failed:`,
        apiError.message
      );
      // Fall through to other methods
    }
  }

  // Use YouTube oEmbed API for title
  let title = "YouTube Video";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedResponse = await axios.get(oembedUrl, { timeout: 5000 });
    title = oembedResponse.data.title || title;
  } catch (oembedError) {
    console.warn(`[videoService] oEmbed failed:`, oembedError.message);
  }

  // Try Invidious API - a free, open-source YouTube frontend
  const invidiousInstances = [
    "https://inv.nadeko.net",
    "https://invidious.private.coffee",
    "https://iv.nboeck.de",
  ];

  for (const instance of invidiousInstances) {
    try {
      console.info(`[videoService] Trying Invidious instance: ${instance}`);
      const invidiousResponse = await axios.get(
        `${instance}/api/v1/videos/${videoId}`,
        { timeout: 8000 }
      );

      if (invidiousResponse.data.lengthSeconds) {
        const durationSeconds = parseInt(invidiousResponse.data.lengthSeconds, 10);
        console.info(`[videoService] Invidious duration: ${durationSeconds}s`);
        return {
          title: invidiousResponse.data.title || title,
          videoId,
          durationSeconds,
        };
      }
    } catch (invidiousError) {
      console.warn(
        `[videoService] Invidious instance ${instance} failed:`,
        invidiousError.message
      );
      // Continue to next instance
    }
  }

  throw new Error(
    "Could not extract video duration. Please set YOUTUBE_API_KEY environment variable for reliable YouTube processing."
  );
};

export const processVideo = async (url) => {
  console.info(`[videoService] Processing YouTube url=${url}`);

  if (!isValidYouTubeUrl(url)) {
    console.warn(`[videoService] Invalid YouTube URL: ${url}`);
    throw new Error("Unsupported YouTube URL");
  }

  const videoId = extractVideoId(url);
  console.info(`[videoService] Extracted videoId=${videoId}`);

  let metadata;
  try {
    metadata = await fetchVideoMetadata(videoId);
  } catch (error) {
    console.error(
      `[videoService] Failed to fetch video metadata for ${url}`,
      error,
    );
    throw error;
  }

  const { title, durationSeconds } = metadata;
  console.info(
    `[videoService] Video info loaded id=${videoId} duration=${durationSeconds}s`,
  );

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
        start: new Date(segment.startSeconds * 1000)
          .toISOString()
          .substring(11, 19),
        end: new Date(segment.endSeconds * 1000).toISOString().substring(11, 19),
      },
      label: `Segment ${index + 1}`,
    })),
  };
};
