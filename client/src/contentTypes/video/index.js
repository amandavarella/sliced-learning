import { renderVideo } from "./renderer.jsx";

export const videoContentType = {
  type: "video",
  label: "Video",
  render: renderVideo,
  getDescription: (training) => {
    return `Video · ${training.segments.length} segments · ${training.segmentMinutes} minutes each`;
  },
};

