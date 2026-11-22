// Picks the extractor for a page by host. Every extractor returns
// { kind, title, bodyElement }; the GitHub one returns null when it cannot
// find a body, and the generic capture takes over. Phase 6 adds Confluence.
import { extractGeneric } from "./generic.js";
import { extractGitHub } from "./github.js";

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export const extractPage = (document, url) => {
  if (hostOf(url) === "github.com") {
    const result = extractGitHub(document, url);
    if (result) {
      return result;
    }
  }
  return extractGeneric(document, url);
};
