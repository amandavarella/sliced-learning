// Service worker. Handles the toolbar click: checks the page is supported,
// injects capture.js, stores the capture and opens the reader. Slicing does
// not happen here because a service worker has no DOMParser; the reader page
// slices the capture when it opens.
import { isSupportedUrl } from "./sites.js";
import { normaliseUrl } from "./urlKey.js";
import { writeCapture } from "./storage.js";
import { FETCH_IMAGE_MESSAGE, fetchImageInWorker } from "./imageFetch.js";

const READER_PATH = "reader.html";

const readerUrl = (params) => {
  const search = new URLSearchParams(params).toString();
  return chrome.runtime.getURL(`${READER_PATH}?${search}`);
};

// Reuse a reader tab that already shows this URL instead of stacking copies.
// The tab is reloaded so it reads the capture just stored and can offer to
// re-slice it; progress is saved on every move, so nothing is lost.
const openOrFocusReader = async (url) => {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [url],
  });
  const existing = contexts.find((context) => context.tabId >= 0);
  if (existing) {
    const tab = await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.reload(tab.id);
    return tab;
  }
  return chrome.tabs.create({ url });
};

const capture = async (tabId) => {
  const target = { tabId };
  await chrome.scripting.executeScript({ target, files: ["capture.js"] });
  const [injection] = await chrome.scripting.executeScript({
    target,
    // The capture is async (image inlining); executeScript waits for the
    // promise a func returns and hands back its resolved value
    func: async () => globalThis.__slicedLearningCapture(),
  });
  if (!injection?.result?.html) {
    throw new Error("The page returned no content to capture.");
  }
  return injection.result;
};

export const handleActionClick = async (tab) => {
  if (!tab?.id || !isSupportedUrl(tab.url)) {
    return openOrFocusReader(readerUrl({ unsupported: "1" }));
  }

  const key = normaliseUrl(tab.url);
  const result = await capture(tab.id);
  // Stored even when a training already exists: the reader then asks whether
  // to continue the saved training or re-slice from this capture
  await writeCapture(key, { ...result, sourceUrl: result.sourceUrl || tab.url });
  return openOrFocusReader(readerUrl({ key }));
};

chrome.action.onClicked.addListener((tab) => {
  handleActionClick(tab).catch((error) => {
    console.error("Sliced Learning could not capture this page", error);
  });
});

// Image fetches the capture script could not make from the page (see
// imageFetch.js). Only messages from this extension's own scripts arrive here.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== FETCH_IMAGE_MESSAGE || sender.id !== chrome.runtime.id) {
    return false;
  }
  fetchImageInWorker(message).then(sendResponse);
  return true;
});

// Exposed so the smoke test can drive a click from the service worker
globalThis.__handleActionClick = handleActionClick;
