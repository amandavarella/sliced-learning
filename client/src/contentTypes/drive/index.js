import { renderDrive } from "./renderer.jsx";

export const driveContentType = {
  type: "drive",
  label: "Drive folder",
  render: renderDrive,
  getDescription: (training) => {
    return `Google Drive Folder · ${training.segments.length} files · ~${training.segmentMinutes} minutes each`;
  },
};

