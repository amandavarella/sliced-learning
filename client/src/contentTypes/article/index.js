import { renderArticle } from "./renderer.jsx";

export const articleContentType = {
  type: "article",
  label: "Article",
  render: renderArticle,
  getDescription: (training) => {
    return `Article · ${training.segments.length} sections · ~${training.segmentMinutes} minutes each`;
  },
};

