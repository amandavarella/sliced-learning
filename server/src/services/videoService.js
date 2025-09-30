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
  // Fetch the YouTube page HTML
  const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });

  const html = response.data;

  // Extract title from og:title meta tag
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const title = titleMatch ? titleMatch[1] : "YouTube Video";

  // Extract duration from ytInitialPlayerResponse
  const playerResponseMatch = html.match(
    /var ytInitialPlayerResponse = ({.+?});/,
  );
  if (!playerResponseMatch) {
    throw new Error("Could not extract video metadata");
  }

  const playerResponse = JSON.parse(playerResponseMatch[1]);
  const durationSeconds = Number.parseInt(
    playerResponse.videoDetails.lengthSeconds,
    10,
  );

  return {
    title,
    videoId,
    durationSeconds,
  };
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
