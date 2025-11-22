import { detectArticle } from "./detector.js";
import { processArticle } from "./processor.js";

export const articleContentType = {
  type: "article",
  detect: detectArticle,
  process: processArticle,
};

