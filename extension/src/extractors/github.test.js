// Extractor tests against the GitHub fixtures. The fixtures hold the body
// element only, so testPages.js wraps each one in the bit of page structure
// its selectors need (#readme, #wiki-body, [data-testid="issue-body"], the PR
// timeline, title headings). See testPages.js for each skeleton.
import assert from "node:assert/strict";
import test from "node:test";

import { detectGitHubKind, extractGitHub } from "./github.js";
import { extractPage } from "./index.js";
import { makeDocument, PAGES, pageDocument, readFixture } from "./testPages.js";

for (const page of PAGES) {
  test(`extractGitHub reads ${page.fixture} as ${page.kind}`, () => {
    const document = pageDocument(page);
    const result = extractGitHub(document, page.url);

    assert.ok(result, "extractor returned null");
    assert.equal(result.kind, page.kind);
    assert.equal(result.title, page.title);
    assert.ok(result.bodyElement.textContent.trim().length > 100, "body is empty");
    assert.ok(!result.bodyElement.textContent.includes("Decoy"));
    assert.ok(!result.bodyElement.textContent.includes("Sidebar"));
    assert.ok(!result.bodyElement.textContent.includes("A comment"));
  });
}

test("detectGitHubKind reads the kind from the path", () => {
  const cases = {
    "https://github.com/a/b": "repo-readme",
    "https://github.com/a/b/": "repo-readme",
    "https://github.com/a/b/blob/main/docs/x.md": "blob",
    "https://github.com/a/b/tree/main/packages/x": "folder-readme",
    "https://github.com/a/b/wiki": "wiki",
    "https://github.com/a/b/wiki/Some-Page": "wiki",
    "https://github.com/a/b/issues/12": "issue",
    "https://github.com/a/b/pull/34": "pr",
    "https://github.com/a/b/issues": null,
    "https://github.com/a/b/pulls": null,
    "https://github.com/a/b/actions": null,
    "https://github.com/orgs/envato/repositories": null,
    "https://github.com/a": null,
    "https://example.com/a/b": null,
  };
  for (const [url, kind] of Object.entries(cases)) {
    assert.equal(detectGitHubKind(url), kind, url);
  }
});

test("the wiki sidebar is never taken, even inside #wiki-body", () => {
  const document = makeDocument({
    url: "https://github.com/a/b/wiki/Page",
    body: `<div id="wiki-body"><div class="wiki-custom-sidebar markdown-body"><p>Sidebar links</p></div><div class="markdown-body"><p>Page text</p></div></div>`,
  });
  const result = extractGitHub(document, "https://github.com/a/b/wiki/Page");
  assert.equal(result.bodyElement.textContent.trim(), "Page text");
});

test("PR pages fall back to the issue selectors for the React PR view", () => {
  // [Unverified] markup: the React PR view has not been seen live, this only
  // checks the fallback order
  const url = "https://github.com/vitejs/vite/pull/1";
  const document = makeDocument({
    url,
    body: `<h1><bdi data-testid="issue-title">React PR</bdi></h1><div data-testid="issue-body">${readFixture("issue.html")}</div>`,
  });
  const result = extractGitHub(document, url);
  assert.equal(result.kind, "pr");
  assert.equal(result.title, "React PR");
  assert.ok(result.bodyElement.matches('[data-testid="markdown-body"]'));
});

test("titles fall back to og:title, then document.title without the GitHub suffix", () => {
  const url = "https://github.com/a/b/issues/3";
  const body = `<div data-testid="issue-body"><div data-testid="markdown-body"><p>Body</p></div></div>`;

  const withOg = makeDocument({
    url,
    pageTitle: "Page title · Issue #3 · a/b · GitHub",
    head: `<meta property="og:title" content="OG title · Issue #3 · a/b">`,
    body,
  });
  assert.equal(extractGitHub(withOg, url).title, "OG title · Issue #3 · a/b");

  const withoutOg = makeDocument({ url, pageTitle: "Page title · Issue #3 · a/b · GitHub", body });
  assert.equal(extractGitHub(withoutOg, url).title, "Page title · Issue #3 · a/b");
});

test("extractGitHub returns null when no body matches", () => {
  const url = "https://github.com/a/b/issues/3";
  assert.equal(extractGitHub(makeDocument({ url, body: "<main><p>Sign in</p></main>" }), url), null);
});

test("extractPage uses the generic capture off GitHub and when GitHub finds nothing", () => {
  const offSite = makeDocument({
    url: "https://example.com/post",
    pageTitle: "A post",
    body: "<main><h1>Heading</h1><p>Text</p></main>",
  });
  const generic = extractPage(offSite, "https://example.com/post");
  assert.equal(generic.kind, "generic");
  assert.equal(generic.title, "Heading");
  assert.equal(generic.bodyElement.tagName, "MAIN");

  const url = "https://github.com/a/b/issues/3";
  const empty = makeDocument({ url, pageTitle: "Issue · GitHub", body: "<main><p>Sign in</p></main>" });
  const fallback = extractPage(empty, url);
  assert.equal(fallback.kind, "generic");
  assert.equal(fallback.title, "Issue");

  const page = PAGES.find((candidate) => candidate.kind === "wiki");
  assert.equal(extractPage(pageDocument(page), page.url).kind, "wiki");
});
