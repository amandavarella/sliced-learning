import { detectVideo } from "./detector.js";
import { processVideo } from "./processor.js";

export const videoContentType = {
  type: "video",
  detect: detectVideo,
  process: processVideo,
};

