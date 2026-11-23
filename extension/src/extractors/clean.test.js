// cleanBody tests against the GitHub fixtures, wrapped by testPages.js in the
// page structure the extractor needs (the fixtures are body outerHTML only).
import assert from "node:assert/strict";
import test from "node:test";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

import { createBrowserDom } from "../../../shared/dom/browser.js";
import { createSanitizer } from "../../../shared/sanitize.js";
import { sliceHtml } from "../../../shared/slice.js";
import { cleanBody, DIAGRAM_NOTE } from "./clean.js";
import { extractGitHub } from "./github.js";
import { makeDocument, PAGES, pageDocument } from "./testPages.js";

const cleaned = (page) => {
  const document = pageDocument(page);
  const { bodyElement } = extractGitHub(document, page.url);
  return { original: bodyElement, body: cleanBody(bodyElement, page.url) };
};

const byFixture = (name) => PAGES.find((page) => page.fixture === name);

for (const page of PAGES) {
  test(`cleanBody strips GitHub UI from ${page.fixture}`, () => {
    const { original, body } = cleaned(page);

    assert.notEqual(body, original, "cleanBody must work on a clone");
    for (const selector of ["a.anchor", "svg.octicon-link", "clipboard-copy", ".zeroclipboard-container", "div.markdown-heading", "input"]) {
      assert.equal(body.querySelectorAll(selector).length, 0, `${selector} left in ${page.fixture}`);
    }
    for (const node of body.querySelectorAll("[href], [src]")) {
      for (const attribute of ["href", "src"]) {
        const value = node.getAttribute(attribute);
        if (value) {
          assert.match(value, /^(https?|mailto|data):/, `${attribute}="${value}" is not absolute`);
        }
      }
    }
  });
}

test("cleanBody leaves the source document alone", () => {
  const page = byFixture("blob-readme.html");
  const { original } = cleaned(page);
  assert.ok(original.querySelectorAll("a.anchor").length > 0);
});

test("cleanBody makes relative URLs absolute against the page", () => {
  const page = byFixture("blob-relative-img.html");
  const document = pageDocument(page);
  const { bodyElement } = extractGitHub(document, page.url);
  assert.ok(bodyElement.querySelector('img[src="/sindresorhus/awesome/raw/main/media/logo.svg"]'));

  const body = cleanBody(bodyElement, page.url);
  assert.ok(body.querySelector('img[src="https://github.com/sindresorhus/awesome/raw/main/media/logo.svg"]'));
  assert.ok(body.querySelector('a[href="https://github.com/sindresorhus/awesome/blob/main/media/logo.svg"]'));
});

test("cleanBody prefers data-canonical-src over camo and keeps camo as a fallback", () => {
  const { body } = cleaned(byFixture("repo-readme.html"));
  const images = Array.from(body.querySelectorAll("img[data-canonical-src]"));
  assert.ok(images.length > 0);
  for (const img of images) {
    assert.equal(img.getAttribute("src"), img.getAttribute("data-canonical-src"));
    assert.match(img.getAttribute("data-fallback-src"), /^https:\/\/camo\.githubusercontent\.com\//);
  }
});

test("cleanBody replaces Mermaid diagrams with their source and a link", () => {
  const page = byFixture("blob-mermaid.html");
  const { original, body } = cleaned(page);
  const diagrams = original.querySelectorAll('section[data-type="mermaid"]').length;
  assert.equal(diagrams, 10);

  assert.equal(body.querySelectorAll("iframe, .render-container, section[data-type]").length, 0);
  const blocks = Array.from(body.querySelectorAll("pre > code.language-mermaid"));
  assert.equal(blocks.length, diagrams);
  assert.ok(blocks[0].textContent.startsWith("flowchart LR"));
  assert.ok(blocks[0].textContent.includes("A[Hard] -->|Text| B(Round)"));

  const notes = Array.from(body.querySelectorAll("a")).filter((link) => link.textContent === DIAGRAM_NOTE);
  assert.equal(notes.length, diagrams);
  assert.equal(notes[0].getAttribute("href"), page.url);

  // The README's own table of contents toggle is content and stays
  assert.equal(body.querySelectorAll("details").length, 1);
  assert.equal(body.querySelectorAll("details-dialog, details.details-overlay").length, 0);
});

test("cleanBody falls back to data-json when the Mermaid pre is missing", () => {
  const url = "https://github.com/a/b/blob/main/x.md";
  const document = makeDocument({
    url,
    body: `<article class="markdown-body"><p>Before</p><div class="render-container" data-type="mermaid"><div data-json='{"data":"graph TD\\nA-->B\\n"}'></div><iframe class="render-viewer" src="https://viewscreen.githubusercontent.com/x"></iframe></div></article>`,
  });
  const body = cleanBody(document.querySelector("article"), url);
  assert.equal(body.querySelector("code.language-mermaid").textContent, "graph TD\nA-->B");
  assert.equal(body.querySelectorAll("iframe").length, 0);
});

test("cleanBody turns task list checkboxes into text", () => {
  const { body } = cleaned(byFixture("issue.html"));
  assert.equal(body.querySelectorAll("input").length, 0);
  assert.match(body.textContent, /☑\s+Follow our Code of Conduct/);
});

test("cleanBody opens a details element that wraps the whole body", () => {
  const url = "https://github.com/a/b/issues/1";
  const document = makeDocument({
    url,
    body: `<div id="b"><details><summary>Click</summary><p>Hidden text</p></details></div>`,
  });
  const body = cleanBody(document.querySelector("#b"), url);
  assert.equal(body.querySelectorAll("details, summary").length, 0);
  assert.equal(body.innerHTML, "<p>Click</p><p>Hidden text</p>");
});

test("GitHub syntax highlighting survives cleaning, sanitising and slicing", () => {
  // The reader colours code with GitHub's Prettylights classes
  // (extension/src/githubSyntax.css), so the pl-* spans must reach the segments
  const page = byFixture("blob-readme.html");
  const { body } = cleaned(page);
  const window = new JSDOM("").window;
  const payload = sliceHtml({
    html: body.outerHTML,
    title: "Readability",
    sourceUrl: page.url,
    dom: createBrowserDom(window.DOMParser),
    sanitize: createSanitizer(createDOMPurify(window)),
  });
  const html = payload.segments.map((segment) => segment.html).join("");
  const document = new JSDOM(html).window.document;

  assert.ok(document.querySelector("div.highlight.highlight-source-js > pre"), "highlight wrapper lost");
  for (const name of ["pl-k", "pl-s", "pl-c", "pl-c1", "pl-en", "pl-v", "pl-smi", "pl-s1", "pl-kos"]) {
    assert.ok(document.querySelector(`.highlight pre span.${name}`), `span.${name} lost`);
  }
});

// Cleans, sanitises and slices a body the way the extension does, and
// returns the reader's view of it: what a reader sees as text, and the HTML
const sliceForReader = (body, url) => {
  const window = new JSDOM("").window;
  const payload = sliceHtml({
    html: body.outerHTML,
    title: "Page",
    sourceUrl: url,
    dom: createBrowserDom(window.DOMParser),
    sanitize: createSanitizer(createDOMPurify(window)),
  });
  const html = payload.segments.map((segment) => segment.html).join("");
  const container = window.document.createElement("div");
  container.innerHTML = html;
  return { html, text: container.textContent, container };
};

for (const fixture of ["blob-readme.html", "blob-mermaid.html", "issue.html"]) {
  test(`no "Copy code to clipboard" text reaches the reader from ${fixture}`, () => {
    const page = byFixture(fixture);
    const { original, body } = cleaned(page);
    assert.ok(original.outerHTML.includes("Copy code to clipboard"), "fixture lost its copy buttons");

    const { html, text, container } = sliceForReader(body, page.url);
    assert.ok(container.querySelectorAll("pre").length > 0);
    assert.ok(!text.includes("Copy code to clipboard"));
    assert.ok(!html.includes("Copy code to clipboard"));
  });
}

test("cleanBody removes copy button labels GitHub renders as text next to a code block", () => {
  // [Unverified] markup: none of the fixtures or the signed-out live pages
  // show the label as text, but a signed-in private README did. These are the
  // shapes that would do it: a Primer tooltip element, a role="tooltip" span,
  // screen reader text in a button, popover feedback, and a bare label
  const url = "https://github.com/a/b/blob/main/README.md";
  const variants = [
    `<clipboard-copy id="c1"></clipboard-copy><tool-tip for="c1" popover="manual">Copy code to clipboard</tool-tip>`,
    `<span role="tooltip" aria-hidden="true">Copy code to clipboard</span>`,
    `<button type="button" class="Button"><svg class="octicon-copy"></svg><span class="sr-only">Copy code to clipboard</span></button>`,
    `<div class="snippet-copy"><span>Copy code to clipboard</span></div>`,
    `<span aria-live="polite">Copied!</span>`,
    `Copy code to clipboard`,
  ];
  for (const variant of variants) {
    const document = makeDocument({
      url,
      body: `<article class="markdown-body"><p>Install it:</p><div class="highlight highlight-source-shell"><pre>npm install copy-code</pre>${variant}</div><p>Copy code to clipboard is a phrase in prose.</p></article>`,
    });
    const body = cleanBody(document.querySelector("article"), url);
    const { text, container } = sliceForReader(body, url);

    assert.equal(container.querySelector("pre").textContent, "npm install copy-code", variant);
    assert.equal(text.match(/Copy code to clipboard/g)?.length, 1, variant);
    assert.ok(!text.includes("Copied"), variant);
  }
});

test("cleanBody keeps a code block whose code is a copy label", () => {
  const url = "https://github.com/a/b";
  const document = makeDocument({
    url,
    body: `<article class="markdown-body"><div class="highlight"><pre><span class="pl-s">Copied!</span></pre></div></article>`,
  });
  const body = cleanBody(document.querySelector("article"), url);
  assert.equal(body.querySelector("pre").textContent, "Copied!");
});

test("cleanBody leaves screen reader text alone outside a code block wrapper", () => {
  const url = "https://github.com/a/b";
  const document = makeDocument({
    url,
    body: `<article class="markdown-body"><ol><li><p>Run:</p><pre>make</pre><span class="sr-only">Step one</span></li></ol></article>`,
  });
  const body = cleanBody(document.querySelector("article"), url);
  assert.ok(body.querySelector("li .sr-only"));
});
