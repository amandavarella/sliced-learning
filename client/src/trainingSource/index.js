import { createContext, createElement, useContext } from "react";
import { webTrainingSource } from "./webTrainingSource.js";

/**
 * A training source is where the reader gets trainings from and where it
 * keeps progress. The web app uses `webTrainingSource` (the Express API plus
 * URL state). The Chrome extension has `extension/src/extensionTrainingSource.js`,
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
 * @property {boolean} [library]    With no training open, show the Library of stored
 *   trainings instead of the landing page. Needs `listTrainings` and `deleteTraining`.
 *
 * @typedef {object} TrainingSummary  One row of the Library.
 * @property {string} key             Storage key, passed back to `deleteTraining`.
 * @property {string} title
 * @property {string} href            Link that opens the training in the reader.
 * @property {string} sourceUrl
 * @property {{ id: string, label: string }} site  Badge, such as `{ id: "github", label: "GitHub" }`.
 * @property {string} kindLabel       Page kind, such as "GitHub issue".
 * @property {(string|null)} capturedAt  ISO date the page was captured.
 * @property {(string|null)} updatedAt   ISO date of the last progress save; the list is sorted by it.
 * @property {number} completedCount
 * @property {number} totalSegments
 *
 * @typedef {object} TrainingNote  A short note under the description line.
 * @property {string} id
 * @property {string} text    Shown, such as "Images skipped: 2".
 * @property {string} [detail] Shown on hover.
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
 * @property {() => Promise<TrainingSummary[]>} [listTrainings]
 *   Every stored training, most recently used first. Used when `library` is true.
 * @property {(key: string) => Promise<void>} [deleteTraining]
 *   Remove a stored training and anything kept for it. Used when `library` is true.
 * @property {() => Promise<{ bytes: number, label: string }>} [getStorageUsage]
 *   Space the stored trainings take, for the Library. Optional.
 * @property {(training: object) => string} [describeTraining]
 *   The description line under the title. Defaults to the content type's description.
 * @property {(training: object) => TrainingNote[]} [getTrainingNotes]
 *   Notes about how the training was made, shown under the description. Optional.
 * @property {(training: object) => Promise<object>} [keepSavedTraining]
 * @property {(training: object) => Promise<object>} [resliceTraining]
 *   When `load` returns a training with `pendingCapture: { capturedAt }` (a
 *   newer copy of the page is waiting), the reader shows a banner. "Continue"
 *   calls `keepSavedTraining` and keeps the returned training; "Re-slice"
 *   calls `resliceTraining` and opens the returned training, with progress reset.
 */

const TrainingSourceContext = createContext(webTrainingSource);

export const TrainingSourceProvider = ({ source, children }) =>
  createElement(TrainingSourceContext.Provider, { value: source }, children);

export const useTrainingSource = () => useContext(TrainingSourceContext);

export { webTrainingSource };
