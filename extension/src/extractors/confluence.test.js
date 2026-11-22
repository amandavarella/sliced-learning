// Confluence extractor and cleaning tests. The fixtures in
// extension/fixtures/confluence/ are hand-written, modelled on Confluence's
// export view HTML (see extension/fixtures/README.md); no company page was
// captured. The REST API is a fake fetchImpl answering from a route table.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cleanConfluenceBody } from "./cleanConfluence.js";
import {
  cleanConfluenceTitle,
  detectConfluencePage,
  extractConfluence,
} from "./confluence.js";
import { cleanExtracted, extractPage } from "./index.js";
import { makeDocument } from "./testPages.js";
import { isSupportedUrl } from "../sites.js";
import { normaliseUrl } from "../urlKey.js";

const fixture = (name) =>
  readFileSync(new URL(`../../fixtures/confluence/${name}`, import.meta.url), "utf8");

const ORIGIN = "https://mock.atlassian.net";
const PAGE_URL = `${ORIGIN}/wiki/spaces/TEST/pages/123/Onboarding+guide`;
const V2_EXPORT = `${ORIGIN}/wiki/api/v2/pages/123?body-format=export_view`;
const V2_VIEW = `${ORIGIN}/wiki/api/v2/pages/123?body-format=view`;
const V1_SEARCH = `${ORIGIN}/wiki/rest/api/content/search?cql=id%3D123&expand=body.export_view`;

const json = (body, status = 200) => () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const fakeFetch = (routes) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return route();
  };
  return { fetchImpl, calls, urls: () => calls.map((call) => call.url) };
};

const v2Export = (html = fixture("export-view.html")) =>
  json({
    id: "123",
    title: "Onboarding guide",
    body: { export_view: { value: html, representation: "export_view" } },
    _links: { base: `${ORIGIN}/wiki` },
  });

const domPage = (url = PAGE_URL) =>
  makeDocument({
    url,
    pageTitle: "Onboarding guide - Test space - Confluence",
    head: '<meta property="og:title" content="OG onboarding">',
    body: fixture("dom-page.html"),
  });

const extracted = async () => {
  const { fetchImpl } = fakeFetch({ [V2_EXPORT]: v2Export() });
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });
  return { result, body: cleanConfluenceBody(result.bodyElement, PAGE_URL) };
};

test("detectConfluencePage reads the page id from both URL forms", () => {
  const cases = {
    [PAGE_URL]: { pageId: "123", space: "TEST" },
    [`${ORIGIN}/wiki/spaces/TEST/pages/123`]: { pageId: "123", space: "TEST" },
    [`${ORIGIN}/wiki/spaces/~5f00a/pages/98765/Personal+page#comment-1`]: { pageId: "98765", space: "~5f00a" },
    "https://envato.atlassian.net/wiki/spaces/ENG/pages/4242/Some+title": { pageId: "4242", space: "ENG" },
    [`${ORIGIN}/wiki/pages/viewpage.action?pageId=555`]: { pageId: "555", space: null },
  };
  for (const [url, expected] of Object.entries(cases)) {
    assert.deepEqual(detectConfluencePage(url), expected, url);
  }
  for (const url of [
    `${ORIGIN}/wiki/spaces/TEST/overview`,
    `${ORIGIN}/wiki/spaces/TEST/pages`,
    `${ORIGIN}/wiki/pages/viewpage.action`,
    `${ORIGIN}/wiki/pages/viewpage.action?pageId=abc`,
    `${ORIGIN}/browse/READ-42`,
    "https://example.com/wiki/spaces/TEST/pages/123/Title",
    "https://atlassian.net.evil.test/wiki/spaces/TEST/pages/123",
    "http://mock.atlassian.net/wiki/spaces/TEST/pages/123",
  ]) {
    assert.equal(detectConfluencePage(url), null, url);
  }
});

test("sites.js accepts any *.atlassian.net site and nothing that only looks like one", () => {
  assert.equal(isSupportedUrl(PAGE_URL), true);
  assert.equal(isSupportedUrl("https://envato.atlassian.net/wiki/home"), true);
  assert.equal(isSupportedUrl("https://atlassian.net/wiki"), false);
  assert.equal(isSupportedUrl("https://a.b.atlassian.net/wiki"), false);
  assert.equal(isSupportedUrl("https://mock.atlassian.net.evil.test/wiki"), false);
  assert.equal(isSupportedUrl("https://github.com/a/b"), true);
});

test("normaliseUrl drops the Confluence title slug and the hash", () => {
  const key = `${ORIGIN}/wiki/spaces/TEST/pages/123`;
  assert.equal(normaliseUrl(PAGE_URL), key);
  assert.equal(normaliseUrl(`${ORIGIN}/wiki/spaces/TEST/pages/123/Renamed+title#heading`), key);
  assert.equal(normaliseUrl(key), key);
  // The viewpage form keeps its query: it carries the page id
  assert.equal(
    normaliseUrl(`${ORIGIN}/wiki/pages/viewpage.action?pageId=555#x`),
    `${ORIGIN}/wiki/pages/viewpage.action?pageId=555`,
  );
});

test("API v2 export_view is the first route, with cookies and the title from the response", async () => {
  const { fetchImpl, calls } = fakeFetch({ [V2_EXPORT]: v2Export() });
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });

  assert.equal(result.kind, "confluence");
  assert.equal(result.via, "api-v2");
  assert.equal(result.format, "export_view");
  assert.equal(result.title, "Onboarding guide");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, V2_EXPORT);
  assert.equal(calls[0].init.credentials, "include");
  assert.ok(result.bodyElement.querySelector("h1#Onboarding-Overview"));
  // Parsed into its own inert document, not the page
  assert.notEqual(result.bodyElement.ownerDocument, domPage());
  assert.equal(result.bodyElement.isConnected, false);
});

test("API v2 without export_view retries with body-format=view", async () => {
  const { fetchImpl, urls } = fakeFetch({
    [V2_EXPORT]: json({ id: "123", title: "Onboarding guide", body: { storage: { value: "<p>x</p>" } } }),
    [V2_VIEW]: json({ id: "123", title: "Onboarding guide", body: { view: { value: fixture("view.html") } } }),
  });
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });

  assert.deepEqual(urls(), [V2_EXPORT, V2_VIEW]);
  assert.equal(result.via, "api-v2");
  assert.equal(result.format, "view");
  assert.match(result.bodyElement.textContent, /First point from the view body/);
});

test("a failing v2 falls back to the v1 content search", async () => {
  const { fetchImpl, urls } = fakeFetch({
    [V2_EXPORT]: json({ message: "Forbidden" }, 403),
    [V1_SEARCH]: json({
      results: [{ id: "123", title: "Onboarding guide (v1)", body: { export_view: { value: fixture("export-view.html") } } }],
    }),
  });
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });

  assert.deepEqual(urls(), [V2_EXPORT, V1_SEARCH]);
  assert.equal(result.via, "api-v1");
  assert.equal(result.title, "Onboarding guide (v1)");
  assert.ok(result.bodyElement.querySelector("table"));
});

test("a fetch that throws counts as a failed route", async () => {
  const fetchImpl = async (url) => {
    if (url === V1_SEARCH) {
      return json({ results: [{ title: "From v1", body: { export_view: { value: "<p>Body text</p>" } } }] })();
    }
    throw new TypeError("Failed to fetch");
  };
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });
  assert.equal(result.via, "api-v1");
});

test("both API routes failing falls back to the rendered DOM", async () => {
  const { fetchImpl, urls } = fakeFetch({
    [V2_EXPORT]: json({}, 401),
    [V1_SEARCH]: json({ results: [] }),
  });
  const document = domPage();
  const result = await extractConfluence(document, PAGE_URL, { fetchImpl });

  assert.deepEqual(urls(), [V2_EXPORT, V1_SEARCH]);
  assert.equal(result.via, "dom");
  assert.equal(result.title, "Onboarding from the rendered page");
  assert.ok(result.bodyElement.matches('[data-testid="page-content-only"]'));
  assert.equal(result.apiErrors.length, 2);
  assert.ok(!result.bodyElement.textContent.includes("A comment"));

  const body = cleanConfluenceBody(result.bodyElement, PAGE_URL);
  assert.equal(body.querySelectorAll("button").length, 0);
  assert.equal(body.querySelector("a").getAttribute("href"), `${ORIGIN}/wiki/spaces/TEST/pages/456/Fetcher+runbook`);
});

test("an empty API body counts as a failure", async () => {
  const { fetchImpl } = fakeFetch({
    [V2_EXPORT]: v2Export("<p>   </p>"),
    [V1_SEARCH]: json({ results: [{ body: { export_view: { value: "" } } }] }),
  });
  const result = await extractConfluence(domPage(), PAGE_URL, { fetchImpl });
  assert.equal(result.via, "dom");
});

test("the DOM candidates are tried in order", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const body = (html) => makeDocument({ url: PAGE_URL, pageTitle: "T - S - Confluence", body: html });

  const older = body('<div id="main-content"><p>Main content</p></div><div id="content"><p>Outer</p></div>');
  assert.equal((await extractConfluence(older, PAGE_URL, { fetchImpl })).bodyElement.id, "main-content");

  const renderer = body('<div id="content-body"></div><div class="ak-renderer-document"><p>Renderer</p></div>');
  const fromRenderer = await extractConfluence(renderer, PAGE_URL, { fetchImpl });
  assert.ok(fromRenderer.bodyElement.matches(".ak-renderer-document"), "an empty candidate is skipped");

  assert.equal(await extractConfluence(body("<p>Nothing known</p>"), PAGE_URL, { fetchImpl }), null);
});

test("titles: API title, then title-text, h1#title-text, og:title, document.title", async () => {
  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const page = (body, head = "", pageTitle = "Page name - Test space - Confluence") =>
    makeDocument({ url: PAGE_URL, pageTitle, head, body: `${body}<div id="content"><p>Text</p></div>` });
  const title = async (document) => (await extractConfluence(document, PAGE_URL, { fetchImpl: failing })).title;

  assert.equal(await title(page('<h1 data-testid="title-text">Test id title</h1><h1 id="title-text">Old</h1>')), "Test id title");
  assert.equal(await title(page('<h1 id="title-text">Old layout title</h1>')), "Old layout title");
  assert.equal(await title(page("", '<meta property="og:title" content="OG title">')), "OG title");
  assert.equal(await title(page("")), "Page name");
  assert.equal(await title(page("", "", "Page name - Confluence")), "Page name");

  // An API response without a title takes the page's title
  const { fetchImpl } = fakeFetch({ [V2_EXPORT]: json({ body: { export_view: { value: "<p>Body</p>" } } }) });
  const fromApi = await extractConfluence(page('<h1 data-testid="title-text">From the page</h1>'), PAGE_URL, { fetchImpl });
  assert.equal(fromApi.via, "api-v2");
  assert.equal(fromApi.title, "From the page");

  assert.equal(cleanConfluenceTitle("A - B - C - Space - Confluence"), "A - B - C");
});

test("extractPage dispatches atlassian.net to Confluence and falls back to generic", async () => {
  const { fetchImpl } = fakeFetch({ [V2_EXPORT]: v2Export() });
  const result = await extractPage(domPage(), PAGE_URL, { fetchImpl });
  assert.equal(result.kind, "confluence");
  assert.equal(result.via, "api-v2");

  const overview = `${ORIGIN}/wiki/spaces/TEST/overview`;
  const generic = await extractPage(makeDocument({ url: overview, body: "<main><h1>Space</h1></main>" }), overview, { fetchImpl });
  assert.equal(generic.kind, "generic");
});

test("cleanExtracted uses the Confluence cleaner for Confluence results only", async () => {
  const { result } = await extracted();
  const body = cleanExtracted(result, PAGE_URL);
  assert.equal(body.querySelectorAll(".toc-macro").length, 0);
});

test("cleaning: the TOC macro is removed", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll('.toc-macro, [data-macro-name="toc"]').length, 0);
  assert.ok(!body.querySelector('a[href*="#Onboarding-Overview"]'));
});

test("cleaning: info and warning macros become titled blockquotes", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll(".confluence-information-macro, .confluence-information-macro-icon").length, 0);
  const quotes = Array.from(body.querySelectorAll("blockquote.confluence-panel"));
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].querySelector("p > strong").textContent, "Before you start");
  assert.match(quotes[0].textContent, /access to the staging account/);
  assert.ok(quotes[1].classList.contains("confluence-panel-warning"));
  assert.equal(quotes[1].querySelector("p > strong").textContent, "Warning");
});

test("cleaning: expand macros become details and summary", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll(".expand-container, .expand-control").length, 0);
  const details = body.querySelector("details");
  assert.equal(details.querySelector(":scope > summary").textContent, "Troubleshooting the first start");
  assert.match(details.textContent, /stale lock file/);
});

test("cleaning: code macros become plain pre > code with the title kept", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll(".code.panel, .syntaxhighlighter-pre, .codeHeader").length, 0);
  const code = body.querySelector("pre > code");
  assert.equal(code.className, "language-bash");
  assert.ok(code.textContent.startsWith("git clone https://example.com/reading-service.git\ncd reading-service"));
  assert.equal(code.parentElement.previousElementSibling.textContent, "Start the service locally");
});

test("cleaning: status lozenges become inline text spans", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll(".status-macro, .aui-lozenge").length, 0);
  const statuses = Array.from(body.querySelectorAll("span.confluence-status")).map((span) => span.textContent);
  assert.deepEqual(statuses, ["IN PRODUCTION", "IN PROGRESS"]);
});

test("cleaning: Jira macros become a link with the key as text", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll(".jira-issue").length, 0);
  const link = Array.from(body.querySelectorAll("a")).find((a) => a.textContent === "READ-42");
  assert.equal(link.getAttribute("href"), `${ORIGIN}/browse/READ-42`);
  assert.equal(link.querySelectorAll("img").length, 0);
  assert.match(link.parentElement.textContent, /READ-42 Move the reading service to the new cluster\./);
  assert.ok(!body.textContent.includes("In Progress"), "the Jira status lozenge is dropped");

  // A macro without a link builds one from the key
  const document = makeDocument({ url: PAGE_URL, body: '<div id="b"><span class="jira-issue" data-jira-key="ABC-7">ABC-7</span></div>' });
  const cleaned = cleanConfluenceBody(document.querySelector("#b"), PAGE_URL);
  assert.equal(cleaned.innerHTML, `<a href="${ORIGIN}/browse/ABC-7">ABC-7</a>`);
});

test("cleaning: emoticons become their alt text or Unicode fallback, never images", async () => {
  const { body } = await extracted();
  assert.equal(body.querySelectorAll("img.emoticon").length, 0);
  assert.match(body.textContent, /team channel \(smile\)/);
  assert.match(body.textContent, /production deploy \(tick\)/);

  const document = makeDocument({
    url: PAGE_URL,
    body: '<div id="b"><img class="emoticon" data-emoji-fallback="⭐" alt="(star)" src="/x.png"><img class="emoticon" data-emoji-fallback=":custom:" alt=":custom:" src="/y.png"><img class="emoticon" src="/z.png"></div>',
  });
  const cleaned = cleanConfluenceBody(document.querySelector("#b"), PAGE_URL);
  assert.equal(cleaned.innerHTML, "⭐:custom:");
});

test("cleaning: attachment images resolve to absolute full-size URLs", async () => {
  const { body } = await extracted();
  const images = Array.from(body.querySelectorAll("img"));
  assert.equal(images.length, 2);
  assert.equal(
    images[0].getAttribute("src"),
    `${ORIGIN}/wiki/download/attachments/123/architecture.png?version=1&modificationDate=1763856000000&api=v2`,
  );
  assert.equal(images[0].hasAttribute("data-fallback-src"), false, "src and data-image-src agree");
  // The thumbnail src gives way to the full image, and stays as the fallback
  assert.equal(
    images[1].getAttribute("src"),
    `${ORIGIN}/wiki/download/attachments/123/error-graph.png?version=2&modificationDate=1763942400000&api=v2`,
  );
  assert.equal(
    images[1].getAttribute("data-fallback-src"),
    `${ORIGIN}/wiki/download/thumbnails/123/error-graph.png?version=2&modificationDate=1763942400000&api=v2`,
  );
  assert.equal(body.querySelectorAll(".confluence-embedded-file-wrapper, .table-wrap").length, 0);

  // A data-image-src relative to data-base-url
  const document = makeDocument({
    url: PAGE_URL,
    body: '<div id="b"><img data-image-src="download/attachments/123/a.png" data-base-url="https://mock.atlassian.net/wiki"></div>',
  });
  const cleaned = cleanConfluenceBody(document.querySelector("#b"), PAGE_URL);
  assert.equal(cleaned.querySelector("img").getAttribute("src"), `${ORIGIN}/wiki/download/attachments/123/a.png`);
});

test("cleaning: every href and src is absolute, and content survives", async () => {
  const { result, body } = await extracted();
  assert.notEqual(body, result.bodyElement, "cleaning works on a clone");
  for (const node of body.querySelectorAll("[href], [src]")) {
    for (const attribute of ["href", "src"]) {
      const value = node.getAttribute(attribute);
      if (value) {
        assert.match(value, /^https:\/\//, `${attribute}="${value}" is not absolute`);
      }
    }
  }
  assert.ok(body.querySelector(`a[href="${ORIGIN}/wiki/spaces/TEST/pages/456/Fetcher+runbook"]`));
  assert.equal(body.querySelectorAll("table tr").length, 4);
  assert.equal(body.querySelectorAll("h1, h2").length, 4);
  assert.ok(body.textContent.split(/\s+/).length > 500);
});
