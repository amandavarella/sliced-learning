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

const fetchVideoMetadata = async (videoId) => {
  // Use YouTube oEmbed API - official, public, no auth required
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  const oembedResponse = await axios.get(oembedUrl);
  const title = oembedResponse.data.title || "YouTube Video";

  // Use noembed.com as a fallback to get duration - it's a public service that aggregates video metadata
  try {
    const noembedResponse = await axios.get(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
      { timeout: 10000 }
    );

    if (noembedResponse.data.duration) {
      return {
        title,
        videoId,
        durationSeconds: parseInt(noembedResponse.data.duration, 10),
      };
    }
  } catch (noembedError) {
    console.warn(
      `[videoService] Noembed failed for ${videoId}:`,
      noembedError.message
    );
  }

  // Fallback: fetch with minimal headers to avoid bot detection
  try {
    const pageResponse = await axios.get(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 10000,
      }
    );

    const html = pageResponse.data;

    // Try multiple patterns to extract duration
    const patterns = [
      /<meta property="og:video:duration" content="(\d+)"/,
      /"lengthSeconds":"(\d+)"/,
      /"length":"(\d+)"/,
      /approxDurationMs[":"]+(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let durationSeconds = parseInt(match[1], 10);
        // If it's in milliseconds, convert to seconds
        if (durationSeconds > 100000) {
          durationSeconds = Math.floor(durationSeconds / 1000);
        }
        return {
          title,
          videoId,
          durationSeconds,
        };
      }
    }
  } catch (pageError) {
    console.error(
      `[videoService] Page fetch failed for ${videoId}:`,
      pageError.message
    );
  }

  throw new Error(
    "Could not extract video duration. The video may be unavailable or restricted."
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
