// Confluence Cloud extractor. Unlike the GitHub one it is async: the
// preferred route asks the Confluence REST API for the page body, from the
// page context, where the session cookie applies.
//
// Routes, in order (JSON paths from the published OpenAPI specs, see "Phase 1
// findings > Confluence Cloud API" in docs/chrome-extension-plan.md):
//
//   api-v2  GET /wiki/api/v2/pages/<id>?body-format=export_view
//           HTML at body.export_view.value, title at title. When the
//           response has no body.export_view (the v2 response schema does
//           not declare it), GET the same page with body-format=view and use
//           body.view.value.
//   api-v1  GET /wiki/rest/api/content/search?cql=id=<id>&expand=body.export_view
//           HTML at results[0].body.export_view.value, title at
//           results[0].title.
//   dom     The rendered page body, from an ordered list of selectors.
//
// The API HTML is parsed with the page's DOMParser into an element of that
// parsed (inert) document, so nothing in it loads or runs in the page.
import { isConfluenceHost } from "../sites.js";

export const CONFLUENCE_KIND = "confluence";
const API_TIMEOUT_MS = 20000;

const SPACE_PAGE_PATH = /^\/wiki\/spaces\/([^/]+)\/pages\/(\d+)(?:\/|$)/;
const VIEWPAGE_PATH = /^\/wiki\/pages\/viewpage\.action\/?$/;

// [Unverified] DOM selectors: not checked against a live Confluence Cloud
// page (phase 1 open question 2). Kept in order from most to least specific.
export const DOM_BODY_SELECTORS = [
  '[data-testid="page-content-only"]',
  "#content-body",
  ".ak-renderer-document",
  "#main-content",
  "#content",
];
export const DOM_TITLE_SELECTORS = ['[data-testid="title-text"]', "h1#title-text"];

// { pageId, space } for a Confluence Cloud page URL, else null
export const detectConfluencePage = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !isConfluenceHost(url.hostname)) {
    return null;
  }
  const match = url.pathname.match(SPACE_PAGE_PATH);
  if (match) {
    return { pageId: match[2], space: decodeURIComponent(match[1]) };
  }
  if (VIEWPAGE_PATH.test(url.pathname)) {
    const pageId = url.searchParams.get("pageId");
    if (pageId && /^\d+$/.test(pageId)) {
      return { pageId, space: null };
    }
  }
  return null;
};

// "Page - Space - Confluence" and "Page - Confluence" become "Page".
// [Unverified] suffix shape, taken from the phase 1 notes. A space name with
// " - " in it leaves part of the space in the title.
export const cleanConfluenceTitle = (value) =>
  (value || "")
    .replace(/\s+-\s+[^-]+?\s+-\s+Confluence\s*$/, "")
    .replace(/\s+-\s+Confluence\s*$/, "")
    .trim();

export const domTitle = (document) => {
  for (const selector of DOM_TITLE_SELECTORS) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  return cleanConfluenceTitle(ogTitle) || cleanConfluenceTitle(document.title);
};

const hasContent = (element) =>
  Boolean(element && (element.textContent.trim() || element.querySelector("img, table")));

const fetchJson = async (fetchImpl, url) => {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!response?.ok) {
      throw new Error(`HTTP ${response?.status} for ${url}`);
    }
    return await response.json();
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const stringAt = (value) => (typeof value === "string" && value.trim() ? value : "");

// Each route answers { html, title } or throws
const fromApiV2 = async (fetchImpl, origin, pageId) => {
  const base = `${origin}/wiki/api/v2/pages/${encodeURIComponent(pageId)}`;
  const exportView = await fetchJson(fetchImpl, `${base}?body-format=export_view`);
  const exportHtml = stringAt(exportView?.body?.export_view?.value);
  if (exportHtml) {
    return { html: exportHtml, title: stringAt(exportView?.title), format: "export_view" };
  }
  const view = await fetchJson(fetchImpl, `${base}?body-format=view`);
  const viewHtml = stringAt(view?.body?.view?.value);
  if (!viewHtml) {
    throw new Error("v2 returned neither body.export_view nor body.view");
  }
  return { html: viewHtml, title: stringAt(view?.title) || stringAt(exportView?.title), format: "view" };
};

const fromApiV1 = async (fetchImpl, origin, pageId) => {
  const cql = encodeURIComponent(`id=${pageId}`);
  const json = await fetchJson(
    fetchImpl,
    `${origin}/wiki/rest/api/content/search?cql=${cql}&expand=body.export_view`,
  );
  const result = json?.results?.[0];
  const html = stringAt(result?.body?.export_view?.value);
  if (!html) {
    throw new Error("v1 search returned no body.export_view");
  }
  return { html, title: stringAt(result?.title), format: "export_view" };
};

// A detached element holding the API HTML, owned by a DOMParser document so
// its images do not load and its scripts never run in the page
export const parseBody = (document, html) => {
  const Parser = document.defaultView?.DOMParser || globalThis.DOMParser;
  const parsed = new Parser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  const container = parsed.createElement("div");
  container.className = "confluence-body";
  container.append(...Array.from(parsed.body.childNodes));
  return container;
};

const fromDom = (document) => {
  for (const selector of DOM_BODY_SELECTORS) {
    const element = document.querySelector(selector);
    if (hasContent(element)) {
      return element;
    }
  }
  return null;
};

export const extractConfluence = async (document, url, { fetchImpl } = {}) => {
  const page = detectConfluencePage(url);
  if (!page) {
    return null;
  }
  const origin = new URL(url).origin;
  const doFetch = fetchImpl || globalThis.fetch?.bind(globalThis);
  const errors = [];

  if (typeof doFetch === "function") {
    for (const [via, route] of [
      ["api-v2", fromApiV2],
      ["api-v1", fromApiV1],
    ]) {
      try {
        const { html, title, format } = await route(doFetch, origin, page.pageId);
        const bodyElement = parseBody(document, html);
        if (!hasContent(bodyElement)) {
          throw new Error(`${via} returned an empty body`);
        }
        return {
          kind: CONFLUENCE_KIND,
          title: title || domTitle(document),
          bodyElement,
          via,
          format,
          pageId: page.pageId,
        };
      } catch (error) {
        errors.push(`${via}: ${error?.message || error}`);
      }
    }
  }

  // [Unverified] DOM fallback, see DOM_BODY_SELECTORS
  const bodyElement = fromDom(document);
  if (!bodyElement) {
    return null;
  }
  return {
    kind: CONFLUENCE_KIND,
    title: domTitle(document),
    bodyElement,
    via: "dom",
    pageId: page.pageId,
    apiErrors: errors,
  };
};
