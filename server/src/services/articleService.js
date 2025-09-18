import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chunkByWordGoal } from "../utils/segmentation.js";

const WORDS_PER_MINUTE = 200;
const SEGMENT_MINUTES = 3;
const MAX_WORDS_PER_SEGMENT = WORDS_PER_MINUTE * SEGMENT_MINUTES;

const fetchHtml = async (url) => {
  const { data } = await axios.get(url, {
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  return data;
};

const normalizeText = (htmlContent) => {
  const dom = new JSDOM(`<body>${htmlContent}</body>`);
  const document = dom.window.document;
  return Array.from(document.querySelectorAll("p"))
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
};

export const processArticle = async (url) => {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed) {
    throw new Error("Unable to parse article content");
  }

  const textContent = parsed.textContent || normalizeText(parsed.content || "");
  const segments = chunkByWordGoal(textContent, MAX_WORDS_PER_SEGMENT);
  const totalWords = segments.reduce((total, segment) => total + segment.wordCount, 0);

  return {
    type: "article",
    title: parsed.title || dom.window.document.title || "Article",
    sourceUrl: url,
    segmentMinutes: SEGMENT_MINUTES,
    totalSegments: segments.length,
    totalWords,
    segments: segments.map((segment, index) => ({
      id: `segment-${index + 1}`,
      label: `Section ${index + 1}`,
      wordCount: segment.wordCount,
      estimatedMinutes: Math.max(1, Math.round(segment.wordCount / WORDS_PER_MINUTE)),
      text: segment.text,
    })),
  };
};
