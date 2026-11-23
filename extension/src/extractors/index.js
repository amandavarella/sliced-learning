// Picks the extractor for a page by host, and the cleaner for its result.
// Every extractor returns { kind, title, bodyElement } or null, in which case
// the generic capture takes over. The Confluence extractor is async (it calls
// the REST API), so extractPage is async for every host.
import { cleanBody } from "./clean.js";
import { cleanConfluenceBody } from "./cleanConfluence.js";
import { CONFLUENCE_KIND, extractConfluence } from "./confluence.js";
import { extractGeneric } from "./generic.js";
import { extractGitHub } from "./github.js";
import { isConfluenceHost } from "../sites.js";

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

// options.fetchImpl is the fetch the Confluence extractor calls the API with
export const extractPage = async (document, url, options = {}) => {
  const host = hostOf(url);
  if (host === "github.com") {
    const result = extractGitHub(document, url);
    if (result) {
      return result;
    }
  }
  if (isConfluenceHost(host)) {
    const result = await extractConfluence(document, url, options);
    if (result) {
      return result;
    }
  }
  return extractGeneric(document, url);
};

// Confluence bodies get their own cleaning; GitHub and generic captures keep
// the phase 5 cleanBody
export const cleanExtracted = ({ kind, bodyElement }, url) =>
  kind === CONFLUENCE_KIND ? cleanConfluenceBody(bodyElement, url) : cleanBody(bodyElement, url);
