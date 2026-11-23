import assert from "node:assert/strict";
import test from "node:test";

import { inlineImages } from "./extractors/inlineImages.js";
import { makeDocument } from "./extractors/testPages.js";
import { createCaptureFetch, FETCH_IMAGE_MESSAGE, fetchImageInWorker, withPageCredentials } from "./imageFetch.js";

const corsError = () => Promise.reject(new TypeError("Failed to fetch"));
const oneImage = (src) =>
  makeDocument({ url: "https://github.com/a/b", body: `<div id="b"><img src="${src}"></div>` }).querySelector("#b");

test("falls back to the service worker when the page fetch throws", async () => {
  const messages = [];
  const fetchImpl = createCaptureFetch({
    pageFetch: corsError,
    sendMessage: async (message) => {
      messages.push(message);
      return { status: 200, type: "image/png", base64: Buffer.from("png").toString("base64") };
    },
    maxBytes: 100,
  });
  const body = oneImage("https://private-user-images.githubusercontent.com/1/x.png?jwt=t");

  const stats = await inlineImages(body, { fetchImpl });

  assert.deepEqual(messages, [
    { type: FETCH_IMAGE_MESSAGE, url: "https://private-user-images.githubusercontent.com/1/x.png?jwt=t", maxBytes: 100 },
  ]);
  assert.equal(body.querySelector("img").getAttribute("src"), `data:image/png;base64,${Buffer.from("png").toString("base64")}`);
  assert.equal(stats.inlined, 1);
});

test("does not ask the service worker when the page answers", async () => {
  let asked = false;
  const fetchImpl = createCaptureFetch({
    pageFetch: async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    sendMessage: async () => {
      asked = true;
    },
    maxBytes: 100,
  });
  const stats = await inlineImages(oneImage("https://github.com/a/b/raw/main/x.png"), { fetchImpl });
  assert.equal(asked, false);
  assert.equal(stats.reasons["not-image"], 1);
});

test("maps service worker refusals onto the skip reasons", async () => {
  const replies = [{ status: 413, type: "image/png", base64: "" }, { error: "Failed to fetch" }, { status: 200, type: "text/html", base64: "" }];
  const fetchImpl = createCaptureFetch({ pageFetch: corsError, sendMessage: async () => replies.shift(), maxBytes: 100 });
  const body = makeDocument({
    url: "https://github.com/a/b",
    body: `<div id="b"><img src="https://x.test/1"><img src="https://x.test/2"><img src="https://x.test/3"></div>`,
  }).querySelector("#b");

  const stats = await inlineImages(body, { fetchImpl, concurrency: 1 });

  assert.deepEqual(stats.reasons, { "fetch-failed": 1, "not-image": 1, "too-large": 1, "total-cap": 0 });
  assert.equal(stats.inlined, 0);
});

test("fetchImageInWorker returns base64 for images within the cap", async (t) => {
  const bodies = { "https://x.test/small.png": "abc", "https://x.test/big.png": "x".repeat(200) };
  t.mock.method(globalThis, "fetch", async (url) =>
    new Response(bodies[url], { status: 200, headers: { "content-type": "image/png" } }),
  );

  assert.deepEqual(await fetchImageInWorker({ url: "https://x.test/small.png", maxBytes: 100 }), {
    status: 200,
    type: "image/png",
    base64: Buffer.from("abc").toString("base64"),
  });
  assert.equal((await fetchImageInWorker({ url: "https://x.test/big.png", maxBytes: 100 })).status, 413);
  assert.equal((await fetchImageInWorker({ url: "http://x.test/a.png", maxBytes: 100 })).error, "bad-url");
});

test("withPageCredentials always uses same-origin credentials", () => {
  const origin = "https://mock.atlassian.net";
  // Same-origin URLs still get the session cookie under "same-origin"
  assert.equal(
    withPageCredentials("https://mock.atlassian.net/wiki/download/attachments/1/a.png", { signal: null }, origin).credentials,
    "same-origin",
  );
  assert.equal(withPageCredentials("/wiki/download/attachments/1/a.png", {}, origin).credentials, "same-origin");
  // Cross-origin keeps the fetch default, so ACAO: * hosts still pass CORS
  assert.equal(withPageCredentials("https://img.shields.io/badge/x.svg", {}, origin).credentials, "same-origin");
  assert.deepEqual(withPageCredentials("https://x.test/a.png", { signal: "s" }, origin), { signal: "s", credentials: "same-origin" });
});

test("withPageCredentials does not force cookies on github.com /raw/ images", () => {
  // github.com/<owner>/<repo>/raw/<ref>/<path> redirects to
  // raw.githubusercontent.com, which answers `Access-Control-Allow-Origin: *`.
  // With "include" the browser rejects that wildcard after the redirect and the
  // image is skipped; "same-origin" sends the cookie to github.com only.
  const init = withPageCredentials("https://github.com/a/b/raw/main/x.png", {}, "https://github.com");
  assert.equal(init.credentials, "same-origin");
});
