import { MAX_WORDS_PER_SEGMENT, SEGMENT_MINUTES, WORDS_PER_MINUTE } from "./constants.js";
import { chunkByWordGoal, chunkHtmlContent } from "./segmentation.js";

const paragraphText = (html, dom) => {
  if (!html || !html.trim()) {
    return "";
  }

  return Array.from(dom.parseHtml(html).querySelectorAll("p"))
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
};

/**
 * Sanitises article HTML, slices it into sections, and returns the payload the
 * server sends for articles. Site-specific clean-up (Readability, lazy image
 * promotion, GitHub or Confluence selectors) happens before this call.
 *
 * - `dom`: an adapter from dom/node.js or dom/browser.js.
 * - `sanitize`: a function from createSanitizer() in sanitize.js.
 * - `fallbackText`: plain text to slice when the HTML yields no sections.
 *   Defaults to the text of the sanitised HTML's paragraphs.
 */
export const sliceHtml = ({ html, title, sourceUrl, dom, sanitize, fallbackText }) => {
  if (typeof dom?.parseHtml !== "function") {
    throw new TypeError("sliceHtml needs a dom adapter with parseHtml");
  }
  if (typeof sanitize !== "function") {
    throw new TypeError("sliceHtml needs a sanitize function");
  }

  const sanitizedHtml = sanitize(html || "");
  const htmlSegments = chunkHtmlContent(sanitizedHtml, MAX_WORDS_PER_SEGMENT, dom);

  const baseSegments = htmlSegments.length
    ? htmlSegments
    : chunkByWordGoal(
        fallbackText || paragraphText(sanitizedHtml, dom),
        MAX_WORDS_PER_SEGMENT,
      ).map((segment) => ({
        html: null,
        text: segment.text,
        wordCount: segment.wordCount,
      }));

  const totalWords = baseSegments.reduce((total, segment) => total + segment.wordCount, 0);

  return {
    type: "article",
    title: title || "Article",
    sourceUrl,
    segmentMinutes: SEGMENT_MINUTES,
    totalSegments: baseSegments.length,
    totalWords,
    segments: baseSegments.map((segment, index) => ({
      id: `segment-${index + 1}`,
      label: `Section ${index + 1}`,
      wordCount: segment.wordCount,
      estimatedMinutes: Math.max(1, Math.round(segment.wordCount / WORDS_PER_MINUTE)),
      text: segment.text,
      html: segment.html,
    })),
  };
};
