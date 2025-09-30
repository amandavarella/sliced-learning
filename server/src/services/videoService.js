import ytdl from "ytdl-core";
import https from "https";
import { buildTimingSegments } from "../utils/segmentation.js";

const SEGMENT_MINUTES = 10;
const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const AGENT = new https.Agent({ keepAlive: true });

const isValidYouTubeUrl = (url) => {
  try {
    return ytdl.validateURL(url);
  } catch (error) {
    return false;
  }
};

export const processVideo = async (url) => {
  console.info(`[videoService] Processing YouTube url=${url}`);

  if (!isValidYouTubeUrl(url)) {
    console.warn(`[videoService] Invalid YouTube URL: ${url}`);
    throw new Error("Unsupported YouTube URL");
  }

  let info;

  try {
    info = await ytdl.getBasicInfo(url, {
      requestOptions: {
        agent: AGENT,
        headers: REQUEST_HEADERS,
      },
    });
  } catch (error) {
    console.error(`[videoService] Failed to fetch video info for ${url}`, error);
    throw error;
  }

  const durationSeconds = Number.parseInt(info.videoDetails.lengthSeconds, 10);
  console.info(
    `[videoService] Video info loaded id=${info.videoDetails.videoId} duration=${durationSeconds}s`,
  );

  const segments = buildTimingSegments(durationSeconds, SEGMENT_SECONDS);

  return {
    type: "video",
    title: info.videoDetails.title,
    videoId: info.videoDetails.videoId,
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
};
