// Binds the shared slicing core (../../../shared) to the server's own jsdom and
// isomorphic-dompurify, so the rest of the server imports ready-to-use helpers.
// Relative imports keep shared/ inside the Vercel function's file trace.
import DOMPurify from "isomorphic-dompurify";
import { JSDOM } from "jsdom";
import { createNodeDom } from "../../../shared/dom/node.js";
import { createSanitizer } from "../../../shared/sanitize.js";
import { chunkHtmlContent as chunkHtmlWith } from "../../../shared/segmentation.js";
import { sliceHtml as sliceHtmlWith } from "../../../shared/slice.js";

export { chunkByWordGoal, buildTimingSegments } from "../../../shared/segmentation.js";
export {
  WORDS_PER_MINUTE,
  SEGMENT_MINUTES,
  MAX_WORDS_PER_SEGMENT,
} from "../../../shared/constants.js";

export const nodeDom = createNodeDom(JSDOM);
export const sanitizeHtml = createSanitizer(DOMPurify);

export const chunkHtmlContent = (html, maxWordsPerSegment) =>
  chunkHtmlWith(html, maxWordsPerSegment, nodeDom);

export const sliceHtml = (options) => sliceHtmlWith({ dom: nodeDom, sanitize: sanitizeHtml, ...options });
