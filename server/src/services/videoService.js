import ytdl from "ytdl-core";
import { buildTimingSegments } from "../utils/segmentation.js";

const SEGMENT_MINUTES = 10;
const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;

const isValidYouTubeUrl = (url) => {
  try {
    return ytdl.validateURL(url);
  } catch (error) {
    console.error("[videoService] URL validation failed:", {
      url,
      error: error.message,
    });
    return false;
  }
};

export const processVideo = async (url) => {
  console.log("[videoService] Starting video processing:", { url });

  if (!isValidYouTubeUrl(url)) {
    console.error("[videoService] Invalid YouTube URL:", { url });
    throw new Error("Unsupported YouTube URL");
  }

  try {
    console.log("[videoService] Calling ytdl.getBasicInfo");
    const info = await ytdl.getBasicInfo(url);
    console.log("[videoService] ytdl.getBasicInfo succeeded:", {
      videoId: info.videoDetails.videoId,
      title: info.videoDetails.title,
      lengthSeconds: info.videoDetails.lengthSeconds,
    });

    const durationSeconds = Number.parseInt(info.videoDetails.lengthSeconds, 10);
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
  } catch (error) {
    console.error("[videoService] ytdl.getBasicInfo failed:", {
      url,
      errorMessage: error.message,
      errorName: error.name,
      statusCode: error.statusCode,
      stack: error.stack,
    });
    throw error;
  }
};
