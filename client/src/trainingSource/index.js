import { createContext, createElement, useContext } from "react";
import { webTrainingSource } from "./webTrainingSource.js";

/**
 * A training source is where the reader gets trainings from and where it
 * keeps progress. The web app uses `webTrainingSource` (the Express API plus
 * URL state). The Chrome extension will add `extensionTrainingSource.js`,
 * backed by `chrome.storage.local`, with the same shape.
 *
 * Payloads have the shape the server returns from `POST /api/process`:
 * `{ type, title, sourceUrl, segmentMinutes, totalSegments, totalWords,
 * segments[], progress?: { completed: boolean[], activeIndex: number } }`,
 * plus any source-specific fields (the web source adds `shareId`).
 *
 * @typedef {object} TrainingSourceCapabilities
 * @property {boolean} urlInput     Show the URL form and the "New" actions.
 * @property {boolean} examples     Show the example chips on the landing page.
 * @property {boolean} shareLinks   Show the copy-share-link button and set og:url.
 * @property {boolean} openOriginal Show an "Open original" action for `training.sourceUrl`.
 *
 * @typedef {object} TrainingSource
 * @property {TrainingSourceCapabilities} capabilities
 * @property {(url: string) => Promise<object>} process
 *   Slice a URL into a training payload. Required when `urlInput` is true.
 * @property {() => (object|null)} readInitialRequest
 *   Synchronously describe the training to open when the reader mounts, or
 *   return null to show the landing page. The value is passed to `load`.
 * @property {(request: object) => Promise<object>} load
 *   Resolve the request from `readInitialRequest` into a training payload.
 * @property {(training: object, progress: { completed: boolean[], activeIndex: number }) => Promise<void>} saveProgress
 *   Persist progress after the learner moves or completes a segment.
 * @property {(training: object, progress: { completed?: boolean[], activeIndex?: number }) => string} [buildShareLink]
 *   Build a link that reopens the training at this position. Used when `shareLinks` is true.
 * @property {(training: (object|null), progress: { completed: boolean[], activeIndex: number }) => void} [syncLocation]
 *   Mirror the reader's state into the page URL. Optional: a source that
 *   does not own the page URL leaves it out.
 */

const TrainingSourceContext = createContext(webTrainingSource);

export const TrainingSourceProvider = ({ source, children }) =>
  createElement(TrainingSourceContext.Provider, { value: source }, children);

export const useTrainingSource = () => useContext(TrainingSourceContext);

export { webTrainingSource };
