// Injected into the page on a toolbar click. Built as a classic script (IIFE,
// no imports in the output) because chrome.scripting injects files as classic
// scripts; Vite bundles the extractor modules into it.
//
// It only defines a function on the extension's isolated world. The service
// worker calls it in a second executeScript call and awaits the promise it
// returns, which keeps the result independent of how the bundle is wrapped.
//
// Pipeline: pick the extractor for the host (the Confluence one calls the REST
// API from the page, with the session cookie), clean the body on a clone, then
// inline its images as data URLs. Images are fetched from the page context,
// where cookies apply, with the service worker as a fallback for image hosts
// that send no CORS headers (see imageFetch.js).
import { cleanExtracted, extractPage } from "./extractors/index.js";
import { DEFAULT_LIMITS, inlineImages } from "./extractors/inlineImages.js";
import { createCaptureFetch, withPageCredentials } from "./imageFetch.js";

const capturePage = async () => {
  const sourceUrl = location.href;
  const extracted = await extractPage(document, sourceUrl, {
    fetchImpl: (url, init) => fetch(url, init),
  });
  const { kind, title, via } = extracted;
  const body = cleanExtracted(extracted, sourceUrl);
  const fetchImpl = createCaptureFetch({
    pageFetch: (url, init) => fetch(url, withPageCredentials(url, init, location.origin)),
    sendMessage: (message) => chrome.runtime.sendMessage(message),
    maxBytes: DEFAULT_LIMITS.perImageBytes,
  });
  const stats = await inlineImages(body, { fetchImpl });

  return {
    title: title || sourceUrl,
    html: body.outerHTML,
    sourceUrl,
    capturedAt: new Date().toISOString(),
    kind,
    stats,
    extraction: via ? { via, format: extracted.format || null, apiErrors: extracted.apiErrors || [] } : null,
  };
};

globalThis.__slicedLearningCapture = capturePage;
