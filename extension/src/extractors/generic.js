// Generic capture for pages no site extractor handles: the first body
// candidate that exists, titled by its first heading or the page title. This
// is the phase 4 capture moved out of capture.js unchanged in behaviour.
const BODY_CANDIDATES = ["article.markdown-body", "main", "body"];

export const cleanPageTitle = (value) => (value || "").replace(/\s+·\s+GitHub\s*$/, "").trim();

// og:title first, then document.title, both without the " · GitHub" suffix
export const fallbackTitle = (document, url) => {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  return cleanPageTitle(ogTitle) || cleanPageTitle(document.title) || url || "";
};

export const firstHeading = (root) => root?.querySelector("h1")?.textContent?.trim() || "";

export const extractGeneric = (document, url) => {
  const bodyElement =
    BODY_CANDIDATES.map((selector) => document.querySelector(selector)).find(Boolean) ||
    document.documentElement;

  return {
    kind: "generic",
    title: firstHeading(bodyElement) || fallbackTitle(document, url),
    bodyElement,
  };
};
