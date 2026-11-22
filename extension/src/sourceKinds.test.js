import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, kindLabel, siteOf, skippedImagesNote } from "./sourceKinds.js";

test("kindLabel names each extractor kind", () => {
  assert.equal(kindLabel("issue", "https://github.com/o/r/issues/1"), "GitHub issue");
  assert.equal(kindLabel("pr", "https://github.com/o/r/pull/1"), "GitHub pull request");
  assert.equal(kindLabel("confluence", "https://x.atlassian.net/wiki/spaces/A/pages/1"), "Confluence page");
  assert.equal(kindLabel("generic", "https://github.com/o/r/actions"), "GitHub page");
  assert.equal(kindLabel("generic", "https://x.atlassian.net/browse/A-1"), "Atlassian page");
  assert.equal(kindLabel(undefined, "not a url"), "Web page");
});

test("siteOf picks the library badge", () => {
  assert.equal(siteOf("wiki", "https://github.com/o/r/wiki").label, "GitHub");
  assert.equal(siteOf("confluence", "https://x.atlassian.net/wiki").label, "Confluence");
  assert.equal(siteOf("generic", "https://example.com/").id, "generic");
});

test("skippedImagesNote is null when nothing was skipped", () => {
  assert.equal(skippedImagesNote(null), null);
  assert.equal(skippedImagesNote({ inlined: 3, skipped: 0, reasons: {} }), null);
});

test("skippedImagesNote counts skips and lists the reasons", () => {
  const note = skippedImagesNote({
    inlined: 1,
    skipped: 3,
    reasons: { "fetch-failed": 2, "not-image": 0, "too-large": 1, "total-cap": 0 },
  });
  assert.equal(note.text, "Images skipped: 3");
  assert.match(note.detail, /^2 could not be fetched; 1 was over the 2 MB per-image limit\./);
});

test("formatBytes rounds to KB under a megabyte", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(850 * 1024), "850 KB");
  assert.equal(formatBytes(2.45 * 1024 * 1024), "2.5 MB");
});
