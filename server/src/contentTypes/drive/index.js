import { detectDrive } from "./detector.js";
import { processDrive } from "./processor.js";

export const driveContentType = {
  type: "drive",
  detect: detectDrive,
  process: processDrive,
};

