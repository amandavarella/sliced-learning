// Training source for the extension's reader page, backed by
// chrome.storage.local (see storage.js for the layout). Slicing runs here
// rather than in the service worker because the page has DOMParser.
import DOMPurify from "dompurify";
import { sliceHtml } from "../../shared/slice.js";
import { createBrowserDom } from "../../shared/dom/browser.js";
import { createSanitizer } from "../../shared/sanitize.js";
import {
  deleteCapture,
  readCapture,
  readTraining,
  writeTraining,
} from "./storage.js";

const UNSUPPORTED_MESSAGE =
  "Sliced Learning works on github.com and envato.atlassian.net pages. Open one and click the toolbar button again.";
const MISSING_MESSAGE =
  "Nothing has been captured for this page yet. Open the page and click the Sliced Learning toolbar button.";

const emptyProgress = (payload) => ({
  completed: (payload.segments || []).map(() => false),
  activeIndex: 0,
});

const toReaderTraining = (key, stored) => ({
  ...stored.payload,
  storageKey: key,
  progress: stored.progress,
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

const loadTraining = async ({ key, reslice }) => {
  const existing = await readTraining(key);
  if (existing && !reslice) {
    return toReaderTraining(key, existing);
  }

  const capture = await readCapture(key);
  if (!capture) {
    if (existing) {
      return toReaderTraining(key, existing);
    }
    throw new Error(MISSING_MESSAGE);
  }

  const payload = sliceCapture(capture);
  const stored = {
    payload,
    progress: emptyProgress(payload),
    capturedAt: capture.capturedAt,
    stats: capture.stats || null,
  };
  await writeTraining(key, stored);
  await deleteCapture(key);
  return toReaderTraining(key, stored);
};

// One load per key at a time, so a double-mounted effect cannot slice the
// same capture twice or race the capture deletion
const pendingLoads = new Map();

export const extensionTrainingSource = {
  capabilities: {
    urlInput: false,
    examples: false,
    shareLinks: false,
    openOriginal: true,
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

    const pendingKey = `${request.key}|${request.reslice ? 1 : 0}`;
    if (!pendingLoads.has(pendingKey)) {
      pendingLoads.set(
        pendingKey,
        loadTraining(request).finally(() => pendingLoads.delete(pendingKey)),
      );
    }

    const training = await pendingLoads.get(pendingKey);
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
    await writeTraining(key, { ...stored, progress: { completed, activeIndex } });
  },
};

export default extensionTrainingSource;
