import assert from "node:assert/strict";
import test from "node:test";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

import { MAX_WORDS_PER_SEGMENT, SEGMENT_MINUTES } from "./constants.js";
import { createBrowserDom } from "./dom/browser.js";
import { createNodeDom } from "./dom/node.js";
import { createSanitizer } from "./sanitize.js";
import { buildTimingSegments, chunkByWordGoal, chunkHtmlContent } from "./segmentation.js";
import { sliceHtml } from "./slice.js";

const nodeDom = createNodeDom(JSDOM);
// jsdom's DOMParser stands in for the browser's.
const browserDom = createBrowserDom(new JSDOM("").window.DOMParser);
const sanitize = createSanitizer(createDOMPurify(new JSDOM("").window));

const words = (count, word = "word") => Array.from({ length: count }, () => word).join(" ");

const SAMPLE_HTML = `
  <div><article>
    <h2>Intro</h2>
    <p>${words(150, "alpha")}</p>
    <p>${words(150, "beta")}</p>
    <figure><img src="https://example.com/a.png" alt="A"></figure>
    <p>${words(150, "gamma")}</p>
    <script>alert(1)</script>
    <!-- a comment -->
    <p>${words(50, "delta")}</p>
  </article></div>
`;

for (const [name, dom] of [["node", nodeDom], ["browser", browserDom]]) {
  test(`chunkHtmlContent groups block elements up to the word limit (${name} adapter)`, () => {
    const segments = chunkHtmlContent(SAMPLE_HTML, 400, dom);

    assert.equal(segments.length, 2);
    assert.deepEqual(segments.map((segment) => segment.wordCount), [301, 200]);
    assert.ok(segments[0].html.startsWith("<h2>Intro</h2><p>alpha"));
    assert.ok(segments[0].html.endsWith('<figure><img src="https://example.com/a.png" alt="A"></figure>'));
    assert.ok(!segments.some((segment) => segment.html.includes("script")));
    assert.ok(!segments.some((segment) => segment.html.includes("comment")));
    assert.equal(segments[1].text.split(" ")[0], "gamma");
    for (const segment of segments) {
      assert.deepEqual(Object.keys(segment), ["html", "text", "wordCount"]);
    }
  });

  test(`chunkHtmlContent descends into elements larger than the limit (${name} adapter)`, () => {
    const html = `<section><p>${words(30)}</p><p>${words(30)}</p></section><p>${words(5, "tail")}</p>`;
    const segments = chunkHtmlContent(html, 40, dom);

    assert.deepEqual(segments.map((segment) => segment.wordCount), [30, 35]);
    assert.ok(segments[1].html.endsWith(`<p>${words(5, "tail")}</p>`));
  });
}

test("both adapters produce the same segments", () => {
  assert.deepEqual(chunkHtmlContent(SAMPLE_HTML, 120, browserDom), chunkHtmlContent(SAMPLE_HTML, 120, nodeDom));
});

test("chunkHtmlContent returns no segments for empty HTML and needs a parser otherwise", () => {
  assert.deepEqual(chunkHtmlContent("   ", 400), []);
  assert.throws(() => chunkHtmlContent("<p>hi</p>", 400), TypeError);
});

test("chunkByWordGoal groups paragraphs and keeps an oversized paragraph whole", () => {
  assert.deepEqual(
    chunkByWordGoal(`${words(3)}\n\n${words(3)}\n\n${words(3)}`, 6).map((segment) => segment.wordCount),
    [6, 3],
  );
  assert.deepEqual(chunkByWordGoal(words(10), 4), [{ text: words(10), wordCount: 10 }]);
});

test("buildTimingSegments covers the whole duration", () => {
  const segments = buildTimingSegments(1500, 600);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[2], {
    id: "segment-3",
    label: "Module 3",
    startSeconds: 1200,
    endSeconds: 1500,
    durationSeconds: 300,
  });
});

test("sliceHtml sanitises, slices, and returns the article payload", () => {
  const html = `<p onclick="x()">${words(300, "one")}</p><iframe src="https://evil.example"></iframe><p>${words(300, "two")}</p>`;
  const payload = sliceHtml({ html, title: "Doc", sourceUrl: "https://example.com/doc", dom: nodeDom, sanitize });

  assert.deepEqual(Object.keys(payload), [
    "type", "title", "sourceUrl", "segmentMinutes", "totalSegments", "totalWords", "segments",
  ]);
  assert.equal(payload.type, "article");
  assert.equal(payload.segmentMinutes, SEGMENT_MINUTES);
  assert.equal(payload.totalSegments, 2);
  assert.equal(payload.totalWords, 600);
  assert.deepEqual(payload.segments[0], {
    id: "segment-1",
    label: "Section 1",
    wordCount: 300,
    estimatedMinutes: 2,
    text: words(300, "one"),
    html: `<p>${words(300, "one")}</p>`,
  });
  assert.ok(!JSON.stringify(payload).includes("iframe"));
  assert.ok(!JSON.stringify(payload).includes("onclick"));
});

test("sliceHtml falls back to plain text when the HTML has no sections", () => {
  const payload = sliceHtml({
    html: "<script>nothing</script>",
    sourceUrl: "https://example.com",
    dom: browserDom,
    sanitize,
    fallbackText: `${words(MAX_WORDS_PER_SEGMENT)}\n\n${words(10)}`,
  });

  assert.equal(payload.title, "Article");
  assert.equal(payload.totalSegments, 2);
  assert.equal(payload.segments[1].html, null);
  assert.equal(payload.segments[1].wordCount, 10);
});

// Builds a glossary table like the one in the bug report: bold acronyms and
// inline code in the cells, wrapped in GitHub's table element
const glossaryTable = (rows) =>
  `<markdown-accessiblity-table><table><thead><tr><th>Acronym</th><th>Expansion</th><th>In one line</th></tr></thead><tbody>${Array.from(
    { length: rows },
    (_, index) =>
      `<tr><td><strong>A${index}</strong></td><td>Expansion number ${index}</td><td>Logging in with <code>x${index}</code> ${words(12, "detail")}</td></tr>`,
  ).join("")}</tbody></table></markdown-accessiblity-table>`;

// Parses a segment's HTML the way the reader renders it (innerHTML), where
// table rows outside a table are dropped by the HTML parser
const rendered = (html) => {
  const container = new JSDOM("").window.document.createElement("div");
  container.innerHTML = html;
  return container;
};

test("sliceHtml splits a table larger than a segment by whole rows, repeating the header", () => {
  const payload = sliceHtml({
    html: `<p>Intro</p>${glossaryTable(40)}<p>After</p>`,
    sourceUrl: "https://example.com",
    dom: nodeDom,
    sanitize,
  });

  assert.ok(payload.totalSegments >= 2, "a 40-row table should not fit one segment");
  let rows = 0;
  for (const segment of payload.segments) {
    const container = rendered(segment.html);
    const tables = container.querySelectorAll("table");
    assert.equal(tables.length, 1, `segment ${segment.id} has ${tables.length} tables`);
    assert.equal(tables[0].querySelector("thead th").textContent, "Acronym");
    assert.ok(tables[0].querySelector("tbody tr td strong"));
    assert.ok(tables[0].querySelector("tbody tr td code"));
    // Every row is complete
    for (const row of tables[0].querySelectorAll("tbody tr")) {
      assert.equal(row.querySelectorAll("td").length, 3);
    }
    rows += tables[0].querySelectorAll("tbody tr").length;
    assert.ok(segment.html.includes("<table") && segment.html.includes("<tr"));
  }
  assert.equal(rows, 40);
  assert.ok(payload.segments[0].html.startsWith("<p>Intro</p><table>"));
  assert.ok(payload.segments.at(-1).html.endsWith("</table><p>After</p>"));
});

test("chunkHtmlContent drops a table part with no rows and repeats the header uncounted", () => {
  // 395 words of text, then a table whose first row does not fit: the table
  // starts in the next segment instead of leaving an empty header behind. A
  // repeated header is not counted again, and neither is one that was dropped
  const html = `<p>${words(395)}</p><table><thead><tr><th>Head one</th></tr></thead><tbody><tr><td>${words(300, "row")}</td></tr><tr><td>${words(300, "row")}</td></tr></tbody></table>`;
  const segments = chunkHtmlContent(html, 400, nodeDom);

  assert.equal(segments[0].html, `<p>${words(395)}</p>`);
  assert.equal(segments[0].wordCount, 395);
  assert.equal(segments.length, 3);
  for (const segment of segments.slice(1)) {
    assert.ok(segment.html.startsWith("<table><thead><tr><th>Head one</th></tr></thead><tbody><tr>"));
    assert.ok(segment.html.endsWith("</tr></tbody></table>"));
  }
  assert.deepEqual(segments.map((segment) => segment.wordCount), [395, 300, 300]);
});

test("chunkHtmlContent keeps an oversized code block, figure and table row whole", () => {
  for (const html of [
    `<pre><code>${words(500, "code")}</code></pre>`,
    `<figure><img src="https://example.com/a.png" alt=""><figcaption>${words(500)}</figcaption></figure>`,
    `<table><tbody><tr><td>${words(250)} </td><td>${words(250)}</td></tr></tbody></table>`,
  ]) {
    const segments = chunkHtmlContent(`<p>${words(10, "lead")}</p>${html}<p>${words(10, "tail")}</p>`, 400, nodeDom);
    assert.equal(segments.length, 3, html.slice(0, 20));
    assert.equal(segments[1].html, html);
    assert.equal(segments[1].wordCount, 500);
  }
});

test("chunkHtmlContent splits a long list into lists, and an ordered list keeps counting", () => {
  const items = Array.from({ length: 10 }, (_, index) => `<li>item${index} ${words(49)}</li>`).join("");
  const segments = chunkHtmlContent(`<ol class="steps">${items}</ol>`, 200, nodeDom);

  assert.equal(segments.length, 3);
  assert.ok(segments[0].html.startsWith('<ol class="steps"><li>item0'));
  assert.ok(segments[1].html.startsWith('<ol class="steps" start="5"><li>item4'));
  assert.ok(segments[2].html.startsWith('<ol class="steps" start="9"><li>item8'));
  for (const segment of segments) {
    assert.ok(segment.html.endsWith("</li></ol>"));
  }

  const unordered = chunkHtmlContent(`<ul>${items}</ul>`, 200, nodeDom);
  assert.ok(unordered.every((segment) => segment.html.startsWith("<ul><li>") && !segment.html.includes("start=")));
});

test("chunkHtmlContent splits blockquotes and details inside their wrapper, repeating the summary", () => {
  const paragraphs = Array.from({ length: 4 }, (_, index) => `<p>para${index} ${words(149)}</p>`).join("");

  const quote = chunkHtmlContent(`<blockquote>${paragraphs}</blockquote>`, 400, nodeDom);
  assert.equal(quote.length, 2);
  assert.ok(quote.every((segment) => segment.html.startsWith("<blockquote><p>") && segment.html.endsWith("</p></blockquote>")));

  const details = chunkHtmlContent(`<details open=""><summary>More</summary>${paragraphs}</details>`, 400, nodeDom);
  assert.equal(details.length, 2);
  assert.ok(details.every((segment) => segment.html.startsWith('<details open=""><summary>More</summary><p>')));
  assert.deepEqual(details.map((segment) => segment.wordCount), [301, 300]);
});

test("chunkHtmlContent splits nested lists at the inner items", () => {
  const inner = Array.from({ length: 6 }, (_, index) => `<li>inner${index} ${words(99)}</li>`).join("");
  const segments = chunkHtmlContent(`<ul><li>outer <ul>${inner}</ul></li><li>last</li></ul>`, 250, nodeDom);

  assert.equal(segments.length, 3);
  for (const segment of segments) {
    const container = rendered(segment.html);
    assert.equal(container.children.length, 1);
    assert.equal(container.firstElementChild.tagName, "UL");
  }
  assert.ok(segments[1].html.startsWith("<ul><li><ul><li>inner2"));
  assert.ok(segments[2].html.endsWith("</ul></li><li>last</li></ul>"));
});
