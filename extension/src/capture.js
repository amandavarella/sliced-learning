// Injected into the page on a toolbar click. Built as a classic script (IIFE,
// no imports) because chrome.scripting injects files as classic scripts.
//
// It only defines a function on the extension's isolated world. The service
// worker calls it in a second executeScript call and gets its return value,
// which keeps the capture result independent of how the bundle is wrapped and
// lets later phases pass options or return a promise (image inlining).
//
// This is the generic phase 4 capture: the best body candidate, minus GitHub
// heading anchors and copy buttons. Site-specific extractors come in phases 5
// and 6.
const BODY_CANDIDATES = ["article.markdown-body", "main", "body"];
const NOISE_SELECTORS = ["a.anchor", "clipboard-copy", ".zeroclipboard-container"];

const pickBody = () => {
  for (const selector of BODY_CANDIDATES) {
    const node = document.querySelector(selector);
    if (node) {
      return node;
    }
  }
  return document.documentElement;
};

const cleanTitle = (value) => (value || "").replace(/\s+·\s+GitHub\s*$/, "").trim();

const pickTitle = (body) => {
  const heading = body.querySelector("h1")?.textContent?.trim();
  if (heading) {
    return heading;
  }
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  return cleanTitle(ogTitle) || cleanTitle(document.title) || location.href;
};

// The reader renders from a chrome-extension:// origin, so relative links and
// image paths must be resolved against the page before they leave it
const absolutise = (root) => {
  for (const node of root.querySelectorAll("[href]")) {
    node.setAttribute("href", node.href);
  }
  for (const node of root.querySelectorAll("[src]")) {
    node.setAttribute("src", node.src);
  }
};

const capturePage = () => {
  const body = pickBody();
  const clone = body.cloneNode(true);
  for (const node of clone.querySelectorAll(NOISE_SELECTORS.join(","))) {
    node.remove();
  }
  absolutise(clone);

  return {
    title: pickTitle(clone),
    html: clone.outerHTML,
    sourceUrl: location.href,
    capturedAt: new Date().toISOString(),
  };
};

globalThis.__slicedLearningCapture = capturePage;
