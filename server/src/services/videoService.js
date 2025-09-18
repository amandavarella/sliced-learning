import ytdl from "ytdl-core";
import { buildTimingSegments } from "../utils/segmentation.js";

const SEGMENT_MINUTES = 10;
const SEGMENT_SECONDS = SEGMENT_MINUTES * 60;

const isValidYouTubeUrl = (url) => {
  try {
    return ytdl.validateURL(url);
  } catch (error) {
    return false;
  }
};

export const processVideo = async (url) => {
  if (!isValidYouTubeUrl(url)) {
    throw new Error("Unsupported YouTube URL");
  }

  const info = await ytdl.getBasicInfo(url);
  const durationSeconds = Number.parseInt(info.videoDetails.lengthSeconds, 10);
  const segments = buildTimingSegments(durationSeconds, SEGMENT_SECONDS);

  return {
    type: "video",
    title: info.videoDetails.title,
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
