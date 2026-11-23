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
