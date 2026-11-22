// Training source for the extension's reader page, backed by
// chrome.storage.local (see storage.js for the layout). Slicing runs here
// rather than in the service worker because the page has DOMParser.
import DOMPurify from "dompurify";
import { sliceHtml } from "../../shared/slice.js";
import { createBrowserDom } from "../../shared/dom/browser.js";
import { createSanitizer } from "../../shared/sanitize.js";
import { formatBytes, kindLabel, siteOf, skippedImagesNote } from "./sourceKinds.js";
import {
  bytesInUse,
  deleteCapture,
  deleteTrainingAndCapture,
  readAllTrainings,
  readCapture,
  readTraining,
  writeTraining,
} from "./storage.js";

const UNSUPPORTED_MESSAGE =
  "Sliced Learning can't slice this page. It works on GitHub (Markdown files, READMEs, wikis, issues and pull requests on github.com) and on Confluence Cloud pages (<site>.atlassian.net/wiki). Open one of those and click the toolbar button again.";
const MISSING_MESSAGE =
  "Nothing has been captured for this page yet. Open the page and click the Sliced Learning toolbar button.";

const READER_PATH = "reader.html";

const emptyProgress = (payload) => ({
  completed: (payload.segments || []).map(() => false),
  activeIndex: 0,
});

const toReaderTraining = (key, stored, capture = null) => ({
  ...stored.payload,
  storageKey: key,
  progress: stored.progress,
  capturedAt: stored.capturedAt || null,
  stats: stored.stats || null,
  // Set when the toolbar was clicked again after this training was saved:
  // the reader asks whether to keep the training or re-slice the capture
  pendingCapture: capture ? { capturedAt: capture.capturedAt || null } : null,
});

const sliceCapture = (capture) => {
  const payload = sliceHtml({
    html: capture.html,
    title: capture.title,
    sourceUrl: capture.sourceUrl,
    dom: createBrowserDom(DOMParser),
    sanitize: createSanitizer(DOMPurify),
  });
  return { ...payload, type: "article", sourceKind: capture.kind || "generic" };
};

const storeSlicedCapture = async (key, capture) => {
  const payload = sliceCapture(capture);
  const stored = {
    payload,
    progress: emptyProgress(payload),
    capturedAt: capture.capturedAt,
    progressUpdatedAt: capture.capturedAt,
    stats: capture.stats || null,
    // Which route the extractor took (Confluence: api-v2, api-v1 or dom)
    extraction: capture.extraction || null,
  };
  await writeTraining(key, stored);
  await deleteCapture(key);
  return toReaderTraining(key, stored);
};

const isNewer = (capture, stored) => !stored.capturedAt || !capture.capturedAt || capture.capturedAt > stored.capturedAt;

const loadTraining = async ({ key, reslice }) => {
  const [existing, capture] = await Promise.all([readTraining(key), readCapture(key)]);

  if (capture && (reslice || !existing)) {
    return storeSlicedCapture(key, capture);
  }
  if (!existing) {
    throw new Error(MISSING_MESSAGE);
  }
  if (capture && !reslice) {
    if (isNewer(capture, existing)) {
      return toReaderTraining(key, existing, capture);
    }
    // An older capture left behind: the training already covers it
    await deleteCapture(key);
  }
  return toReaderTraining(key, existing);
};

// One load per key at a time, so a double-mounted effect cannot slice the
// same capture twice or race the capture deletion
const pendingLoads = new Map();

const loadOnce = (request) => {
  const pendingKey = `${request.key}|${request.reslice ? 1 : 0}`;
  if (!pendingLoads.has(pendingKey)) {
    pendingLoads.set(
      pendingKey,
      loadTraining(request).finally(() => pendingLoads.delete(pendingKey)),
    );
  }
  return pendingLoads.get(pendingKey);
};

const readerHref = (key) => `${READER_PATH}?${new URLSearchParams({ key }).toString()}`;

const toSummary = ([key, stored]) => {
  const payload = stored.payload || {};
  const completed = stored.progress?.completed || [];
  const totalSegments = payload.segments?.length || payload.totalSegments || 0;
  return {
    key,
    title: payload.title || key,
    sourceUrl: payload.sourceUrl || key,
    site: siteOf(payload.sourceKind, payload.sourceUrl || key),
    kindLabel: kindLabel(payload.sourceKind, payload.sourceUrl || key),
    capturedAt: stored.capturedAt || null,
    updatedAt: stored.progressUpdatedAt || stored.capturedAt || null,
    completedCount: completed.filter(Boolean).length,
    totalSegments,
    href: readerHref(key),
  };
};

const byLastUpdate = (left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || "");

// The key whose ?key= the reader last wrote, so a reset to the library can
// clear it without the first, empty render clearing the key being loaded
let syncedKey = null;

export const extensionTrainingSource = {
  capabilities: {
    urlInput: false,
    examples: false,
    shareLinks: false,
    openOriginal: true,
    library: true,
  },

  process() {
    return Promise.reject(new Error("The extension slices the open page from the toolbar button."));
  },

  readInitialRequest() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("unsupported") === "1") {
      return { unsupported: true };
    }
    const key = params.get("key");
    if (!key) {
      return null;
    }
    return { key, reslice: params.get("reslice") === "1" };
  },

  async load(request) {
    if (request.unsupported) {
      throw new Error(UNSUPPORTED_MESSAGE);
    }
    const training = await loadOnce(request);
    document.title = training.title;
    return training;
  },

  async saveProgress(training, { completed, activeIndex }) {
    const key = training?.storageKey;
    if (!key) {
      return;
    }
    const stored = await readTraining(key);
    if (!stored) {
      return;
    }
    await writeTraining(key, {
      ...stored,
      progress: { completed, activeIndex },
      progressUpdatedAt: new Date().toISOString(),
    });
  },

  // Keep the saved training and drop the newer capture
  async keepSavedTraining(training) {
    await deleteCapture(training.storageKey);
    return { ...training, pendingCapture: null };
  },

  // Replace the saved training with the newer capture; progress starts over
  resliceTraining(training) {
    return loadOnce({ key: training.storageKey, reslice: true });
  },

  async listTrainings() {
    const entries = await readAllTrainings();
    return entries.map(toSummary).sort(byLastUpdate);
  },

  deleteTraining(key) {
    return deleteTrainingAndCapture(key);
  },

  async getStorageUsage() {
    const bytes = await bytesInUse();
    return { bytes, label: formatBytes(bytes) };
  },

  describeTraining(training) {
    const count = training.segments?.length || 0;
    const parts = [kindLabel(training.sourceKind, training.sourceUrl), `${count} ${count === 1 ? "section" : "sections"}`];
    if (training.segmentMinutes) {
      parts.push(`~${training.segmentMinutes} min each`);
    }
    return parts.join(" · ");
  },

  getTrainingNotes(training) {
    return [skippedImagesNote(training.stats)].filter(Boolean);
  },

  // The reader opens at ?key=<key>. Write it back once a training shows (this
  // drops reslice=1, so a reload does not re-slice), and clear it when the
  // learner goes back to the library.
  syncLocation(training) {
    const url = new URL(window.location.href);
    if (training?.storageKey) {
      if (syncedKey === training.storageKey && url.search === `?${new URLSearchParams({ key: syncedKey })}`) {
        return;
      }
      syncedKey = training.storageKey;
      url.search = new URLSearchParams({ key: syncedKey }).toString();
      window.history.replaceState({}, "", url.toString());
      return;
    }
    if (syncedKey) {
      syncedKey = null;
      url.search = "";
      window.history.replaceState({}, "", url.toString());
    }
  },
};

export default extensionTrainingSource;
