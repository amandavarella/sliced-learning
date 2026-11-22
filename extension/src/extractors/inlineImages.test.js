import assert from "node:assert/strict";
import test from "node:test";

import { inlineImages } from "./inlineImages.js";
import { makeDocument } from "./testPages.js";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const response = ({ status = 200, type = "image/png", bytes = PNG, length } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({
    "content-type": type,
    ...(length === undefined ? {} : { "content-length": String(length) }),
  }),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

const bodyWith = (images) =>
  makeDocument({
    url: "https://github.com/a/b",
    body: `<div id="body">${images.map((attrs) => `<img ${attrs}>`).join("")}</div>`,
  }).querySelector("#body");

// A fetchImpl that answers from a table of URL -> response factory, and
// records the URLs asked for and the peak concurrency
const fakeFetch = (routes) => {
  const calls = [];
  let active = 0;
  let peak = 0;
  const fetchImpl = async (url) => {
    calls.push(url);
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const route = routes[url];
      if (!route) {
        throw new TypeError("Failed to fetch");
      }
      return route();
    } finally {
      active -= 1;
    }
  };
  return { fetchImpl, calls, peak: () => peak };
};

test("inlines an image as a data URL and drops srcset", async () => {
  const body = bodyWith(['src="https://x.test/a.png" srcset="https://x.test/a@2x.png 2x"']);
  const { fetchImpl } = fakeFetch({ "https://x.test/a.png": () => response() });

  const stats = await inlineImages(body, { fetchImpl });

  const img = body.querySelector("img");
  assert.equal(img.getAttribute("src"), `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  assert.equal(img.hasAttribute("srcset"), false);
  assert.equal(stats.inlined, 1);
  assert.equal(stats.skipped, 0);
  assert.equal(stats.bytes, PNG.length);
});

test("keeps the URL when the response is not an image", async () => {
  const body = bodyWith(['src="https://x.test/login"']);
  const { fetchImpl } = fakeFetch({ "https://x.test/login": () => response({ type: "text/html; charset=utf-8" }) });

  const stats = await inlineImages(body, { fetchImpl });

  assert.equal(body.querySelector("img").getAttribute("src"), "https://x.test/login");
  assert.deepEqual([stats.inlined, stats.skipped, stats.reasons["not-image"]], [0, 1, 1]);
});

test("keeps the URL when an image is over the per-image cap", async () => {
  const big = new Uint8Array(101);
  const body = bodyWith(['src="https://x.test/declared.png"', 'src="https://x.test/actual.png"']);
  const { fetchImpl } = fakeFetch({
    "https://x.test/declared.png": () => response({ length: 5000 }),
    "https://x.test/actual.png": () => response({ bytes: big }),
  });

  const stats = await inlineImages(body, { fetchImpl, perImageBytes: 100 });

  const sources = Array.from(body.querySelectorAll("img")).map((img) => img.getAttribute("src"));
  assert.deepEqual(sources, ["https://x.test/declared.png", "https://x.test/actual.png"]);
  assert.equal(stats.reasons["too-large"], 2);
  assert.equal(stats.bytes, 0);
});

test("stops inlining once the total cap is reached", async () => {
  const bytes = new Uint8Array(40);
  const urls = ["a", "b", "c", "d"].map((name) => `https://x.test/${name}.png`);
  const body = bodyWith(urls.map((url) => `src="${url}"`));
  const { fetchImpl } = fakeFetch(Object.fromEntries(urls.map((url) => [url, () => response({ bytes })])));

  const stats = await inlineImages(body, { fetchImpl, totalBytes: 100, concurrency: 1 });

  const inlined = Array.from(body.querySelectorAll("img")).filter((img) =>
    img.getAttribute("src").startsWith("data:"),
  );
  assert.equal(inlined.length, 2);
  assert.equal(stats.inlined, 2);
  assert.equal(stats.bytes, 80);
  assert.equal(stats.reasons["total-cap"], 2);
});

test("the total cap holds with parallel fetches", async () => {
  const bytes = new Uint8Array(40);
  const urls = Array.from({ length: 10 }, (_, index) => `https://x.test/${index}.png`);
  const body = bodyWith(urls.map((url) => `src="${url}"`));
  const { fetchImpl, peak } = fakeFetch(Object.fromEntries(urls.map((url) => [url, () => response({ bytes })])));

  const stats = await inlineImages(body, { fetchImpl, totalBytes: 100 });

  assert.ok(stats.bytes <= 100);
  assert.equal(stats.inlined + stats.skipped, 10);
  assert.ok(peak() <= 4, `ran ${peak()} fetches at once`);
  assert.ok(peak() > 1, "fetches did not run in parallel");
});

test("keeps the URL when the fetch fails or returns an error status", async () => {
  const body = bodyWith(['src="https://x.test/offline.png"', 'src="https://x.test/missing.png"']);
  const { fetchImpl } = fakeFetch({ "https://x.test/missing.png": () => response({ status: 404 }) });

  const stats = await inlineImages(body, { fetchImpl });

  const sources = Array.from(body.querySelectorAll("img")).map((img) => img.getAttribute("src"));
  assert.deepEqual(sources, ["https://x.test/offline.png", "https://x.test/missing.png"]);
  assert.equal(stats.reasons["fetch-failed"], 2);
});

test("tries the camo fallback when the canonical URL fails", async () => {
  const body = bodyWith([
    'src="https://badge.test/b.svg" data-fallback-src="https://camo.githubusercontent.com/abc"',
  ]);
  const { fetchImpl, calls } = fakeFetch({
    "https://camo.githubusercontent.com/abc": () => response({ type: "image/svg+xml" }),
  });

  const stats = await inlineImages(body, { fetchImpl });

  assert.deepEqual(calls, ["https://badge.test/b.svg", "https://camo.githubusercontent.com/abc"]);
  const img = body.querySelector("img");
  assert.match(img.getAttribute("src"), /^data:image\/svg\+xml;base64,/);
  assert.equal(img.hasAttribute("data-fallback-src"), false);
  assert.equal(stats.inlined, 1);
});

test("leaves data URLs alone and counts nothing for them", async () => {
  const body = bodyWith(['src="data:image/png;base64,AAAA"']);
  const { fetchImpl, calls } = fakeFetch({});
  const stats = await inlineImages(body, { fetchImpl });
  assert.equal(calls.length, 0);
  assert.deepEqual([stats.inlined, stats.skipped], [0, 0]);
});
