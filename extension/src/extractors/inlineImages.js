// Inlines images as data URLs while the capture runs in the page, where the
// session applies and signed URLs are still fresh. GitHub's uploaded-image
// URLs expire after five minutes, and private repo images need the session,
// so neither would load later from the reader's chrome-extension:// origin.
//
// An image keeps its URL when the fetch fails, the response is not an image,
// it is over the per-image cap, or the training's total cap is reached.
export const DEFAULT_LIMITS = {
  perImageBytes: 2 * 1024 * 1024,
  totalBytes: 20 * 1024 * 1024,
  concurrency: 4,
  timeoutMs: 15000,
};

export const SKIP_REASONS = ["fetch-failed", "not-image", "too-large", "total-cap"];

export const toBase64 = (bytes) => {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

const mimeOf = (response) =>
  (response.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();

// Runs `worker` over `items`, at most `limit` at a time
const runPool = async (items, limit, worker) => {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
};

export const inlineImages = async (bodyElement, options = {}) => {
  const { perImageBytes, totalBytes, concurrency, timeoutMs } = { ...DEFAULT_LIMITS, ...options };
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);

  const stats = {
    inlined: 0,
    skipped: 0,
    bytes: 0,
    reasons: Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0])),
    // Message of the first thrown fetch error among skipped images, so the
    // reader can say more than "could not be fetched"
    firstError: null,
  };
  // Bytes claimed by images in flight, so parallel fetches cannot overshoot
  // the total cap between them
  let claimed = 0;

  const skip = (reason) => {
    stats.skipped += 1;
    stats.reasons[reason] += 1;
    return { reason };
  };

  const fetchOne = async (url) => {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url, { signal: controller?.signal });
      if (!response?.ok) {
        return { reason: "fetch-failed" };
      }
      const mime = mimeOf(response);
      if (!mime.startsWith("image/")) {
        return { reason: "not-image" };
      }
      const declared = Number(response.headers?.get?.("content-length"));
      if (declared > perImageBytes) {
        return { reason: "too-large" };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > perImageBytes) {
        return { reason: "too-large" };
      }
      return { mime, bytes };
    } catch (error) {
      return { reason: "fetch-failed", error: String(error?.message || error || "unknown error") };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const images = Array.from(bodyElement.querySelectorAll("img")).filter((img) => {
    const src = img.getAttribute("src") || "";
    return src && !src.startsWith("data:");
  });

  if (typeof fetchImpl !== "function") {
    for (let index = 0; index < images.length; index += 1) {
      skip("fetch-failed");
    }
    return stats;
  }

  await runPool(images, concurrency, async (img) => {
    if (claimed >= totalBytes) {
      skip("total-cap");
      return;
    }

    const candidates = [img.getAttribute("src"), img.getAttribute("data-fallback-src")].filter(Boolean);
    let result = { reason: "fetch-failed" };
    for (const url of candidates) {
      result = await fetchOne(url);
      // Only a failed fetch is worth retrying on the fallback URL
      if (result.bytes || result.reason !== "fetch-failed") {
        break;
      }
    }

    if (!result.bytes) {
      // Keep the first thrown error of an image that stayed skipped, not one
      // a fallback URL recovered from
      if (result.error && stats.firstError === null) {
        stats.firstError = result.error;
      }
      skip(result.reason);
      return;
    }
    if (claimed + result.bytes.length > totalBytes) {
      skip("total-cap");
      return;
    }

    claimed += result.bytes.length;
    img.setAttribute("src", `data:${result.mime};base64,${toBase64(result.bytes)}`);
    img.removeAttribute("srcset");
    img.removeAttribute("data-fallback-src");
    stats.inlined += 1;
    stats.bytes += result.bytes.length;
  });

  return stats;
};
