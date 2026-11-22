// Image fetching for the capture, in two places.
//
// The capture script fetches from the page context first, where the session
// applies (private repo /raw/ paths on github.com). But content script
// requests follow the page's CORS rules, and some GitHub image hosts send no
// Access-Control-Allow-Origin header: private-user-images (uploaded
// screenshots, signed for five minutes) and camo (the proxy for external
// images). For those the capture asks the service worker, which may fetch
// across origins for the hosts in the manifest's host_permissions
// (https://*.githubusercontent.com/*). Those hosts take signed URLs, not
// cookies, so the service worker needs no session.
import { toBase64 } from "./extractors/inlineImages.js";

export const FETCH_IMAGE_MESSAGE = "sliced-learning:fetch-image";
const TIMEOUT_MS = 15000;

const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

// Service worker side: fetch one image and return it as base64, or a reason
export const fetchImageInWorker = async ({ url, maxBytes }) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "bad-url" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "bad-url" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(parsed.href, { credentials: "omit", signal: controller.signal });
    const type = response.headers.get("content-type") || "";
    const declared = Number(response.headers.get("content-length"));
    if (!response.ok || !type.toLowerCase().startsWith("image/") || declared > maxBytes) {
      // Let the caller apply its own checks from status and type
      return { status: response.status, type, base64: "" };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      return { status: 413, type, base64: "" };
    }
    return { status: response.status, type, base64: toBase64(bytes) };
  } catch (error) {
    return { error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
};

// Credentials for a page-context image fetch. Same-origin images (Confluence
// attachments under /wiki/download/, github.com /raw/ paths) send the session
// cookie. Cross-origin images keep the fetch default ("same-origin", so no
// cookies): with "include" a host answering `Access-Control-Allow-Origin: *`,
// such as img.shields.io, would fail the CORS check.
export const withPageCredentials = (url, init = {}, pageOrigin) => {
  let sameOrigin = false;
  try {
    sameOrigin = new URL(url, pageOrigin).origin === pageOrigin;
  } catch {
    sameOrigin = false;
  }
  return { ...init, credentials: sameOrigin ? "include" : "same-origin" };
};

// Capture side: a fetchImpl for inlineImages that tries the page context, then
// the service worker when the page fetch throws (CORS or network)
export const createCaptureFetch = ({ pageFetch, sendMessage, maxBytes }) => async (url, init) => {
  try {
    return await pageFetch(url, init);
  } catch (pageError) {
    if (typeof sendMessage !== "function") {
      throw pageError;
    }
    const reply = await sendMessage({ type: FETCH_IMAGE_MESSAGE, url, maxBytes });
    if (!reply || reply.error) {
      throw pageError;
    }
    const bytes = reply.base64 ? fromBase64(reply.base64) : new Uint8Array();
    // The worker answers 413 for an image over the cap; a declared length
    // over any cap makes inlineImages skip it as too-large
    const tooLarge = reply.status === 413;
    const headers = new Map([
      ["content-type", reply.type || ""],
      ["content-length", String(tooLarge ? Number.MAX_SAFE_INTEGER : bytes.length)],
    ]);
    return {
      ok: tooLarge || (reply.status >= 200 && reply.status < 300),
      status: reply.status,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
      arrayBuffer: async () => bytes.buffer,
    };
  }
};
