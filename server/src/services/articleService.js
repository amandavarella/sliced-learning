import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chunkByWordGoal, chunkHtmlContent } from "../utils/segmentation.js";
import { sanitizeHtml } from "../utils/sanitize.js";

const WORDS_PER_MINUTE = 200;
const SEGMENT_MINUTES = 2;
const MAX_WORDS_PER_SEGMENT = WORDS_PER_MINUTE * SEGMENT_MINUTES;

const fetchHtml = async (url) => {
  const { data } = await axios.get(url, {
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  return data;
};

const normalizeText = (htmlContent) => {
  const dom = new JSDOM(`<body>${htmlContent}</body>`);
  const document = dom.window.document;
  return Array.from(document.querySelectorAll("p"))
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
};

// Common lazy-loading attributes we should promote into actual src values.
const IMAGE_SOURCE_ATTRIBUTES = [
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-zoom-src",
  "data-zoom-image",
  "data-hi-res-src",
  "data-srcset",
  "data-large-image",
  "data-image",
  "data-url",
];

const TRANSPARENT_PLACEHOLDER_PATTERN = /R0lGODlhAQABAIAAAAAAAP\/\/\//i;
const SVG_PLACEHOLDER_PATTERN = /^data:image\/svg\+xml/i;

const resolveImageUrl = (value, baseUrl) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "#" || trimmed.toLowerCase() === "about:blank") {
    return null;
  }

  if (trimmed.startsWith("javascript:")) {
    return null;
  }

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch (error) {
    return null;
  }
};

const extractFirstSrcFromSrcset = (value) => {
  if (!value) {
    return null;
  }

  const firstCandidate = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .shift();

  if (!firstCandidate) {
    return null;
  }

  const [urlPart] = firstCandidate.split(/\s+/);
  return urlPart || null;
};

const normalizeSrcset = (value, baseUrl) => {
  if (!value) {
    return null;
  }

  const normalizedCandidates = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [urlPart, descriptor] = candidate.split(/\s+/, 2);
      const resolved = resolveImageUrl(urlPart, baseUrl);
      if (!resolved) {
        return null;
      }
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    })
    .filter(Boolean);

  if (!normalizedCandidates.length) {
    return null;
  }

  return normalizedCandidates.join(", ");
};

const normalizePictureSources = (picture, baseUrl) => {
  if (!picture) {
    return;
  }

  const pictureSources = picture.querySelectorAll("source");
  pictureSources.forEach((source) => {
    const normalizedSrcset = normalizeSrcset(source.getAttribute("srcset"), baseUrl);
    if (normalizedSrcset) {
      source.setAttribute("srcset", normalizedSrcset);
    } else {
      source.removeAttribute("srcset");
    }
  });
};

const applyPreferredSourceToImage = (image, baseUrl, { removeWhenMissing = false } = {}) => {
  if (!image) {
    return;
  }

  const preferredSource = selectPreferredSource(image, baseUrl);
  if (preferredSource) {
    image.setAttribute("src", preferredSource);
  } else if (removeWhenMissing) {
    image.removeAttribute("src");
  }

  const srcsetAttribute = image.getAttribute("srcset") || image.getAttribute("data-srcset");
  const normalizedSrcset = normalizeSrcset(srcsetAttribute, baseUrl);
  if (normalizedSrcset) {
    image.setAttribute("srcset", normalizedSrcset);
  } else if (removeWhenMissing) {
    image.removeAttribute("srcset");
  }
};

const hydrateDocumentImages = (document, baseUrl) => {
  if (!document) {
    return;
  }

  const pictures = document.querySelectorAll("picture");
  pictures.forEach((picture) => {
    applyPreferredSourceToImage(picture.querySelector("img"), baseUrl);
    normalizePictureSources(picture, baseUrl);
  });

  const images = document.querySelectorAll("img");
  images.forEach((image) => {
    applyPreferredSourceToImage(image, baseUrl);
  });
};

const selectPreferredSource = (image, baseUrl) => {
  const originalSrc = image.getAttribute("src");

  // Check if src is a real image (not a placeholder)
  const isPlaceholder = originalSrc && (
    TRANSPARENT_PLACEHOLDER_PATTERN.test(originalSrc) ||
    SVG_PLACEHOLDER_PATTERN.test(originalSrc)
  );

  if (originalSrc && !isPlaceholder) {
    const resolvedOriginal = resolveImageUrl(originalSrc, baseUrl);
    if (resolvedOriginal) {
      return resolvedOriginal;
    }
  }

  const srcsetSrc = extractFirstSrcFromSrcset(image.getAttribute("srcset"));
  if (srcsetSrc) {
    const resolvedSrcset = resolveImageUrl(srcsetSrc, baseUrl);
    if (resolvedSrcset) {
      return resolvedSrcset;
    }
  }

  for (const attribute of IMAGE_SOURCE_ATTRIBUTES) {
    const attributeValue = image.getAttribute(attribute);
    if (!attributeValue) {
      continue;
    }

    const candidateSource = attribute.includes("srcset")
      ? extractFirstSrcFromSrcset(attributeValue)
      : attributeValue;

    const resolved = resolveImageUrl(candidateSource, baseUrl);
    if (resolved) {
      return resolved;
    }
  }

  const pictureParent = image.parentElement?.nodeName === "PICTURE"
    ? image.parentElement
    : null;

  if (pictureParent) {
    const pictureSources = Array.from(pictureParent.querySelectorAll("source"));
    for (const source of pictureSources) {
      const srcsetValue = source.getAttribute("srcset");
      const candidate = extractFirstSrcFromSrcset(srcsetValue);
      const resolved = resolveImageUrl(candidate, baseUrl);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
};

const normalizeArticleContent = (htmlContent, baseUrl) => {
  if (!htmlContent || !htmlContent.trim()) {
    return htmlContent;
  }

  const dom = new JSDOM(`<body>${htmlContent}</body>`, { url: baseUrl });
  const { document } = dom.window;

  // Handle noscript tags - extract images from noscript and replace placeholder
  const noscriptTags = document.querySelectorAll("noscript");
  noscriptTags.forEach((noscript) => {
    const noscriptDom = new JSDOM(`<body>${noscript.innerHTML}</body>`);
    const noscriptImg = noscriptDom.window.document.querySelector("img");

    if (noscriptImg && noscriptImg.getAttribute("src")) {
      // Look for preceding sibling that might be a placeholder
      const prevSibling = noscript.previousElementSibling;
      if (prevSibling && prevSibling.tagName === "IMG") {
        // Replace placeholder with real image from noscript
        prevSibling.setAttribute("src", noscriptImg.getAttribute("src"));
        if (noscriptImg.getAttribute("srcset")) {
          prevSibling.setAttribute("srcset", noscriptImg.getAttribute("srcset"));
        }
        if (noscriptImg.getAttribute("alt")) {
          prevSibling.setAttribute("alt", noscriptImg.getAttribute("alt"));
        }
      } else {
        // No placeholder, insert the image from noscript
        const img = document.createElement("img");
        img.setAttribute("src", noscriptImg.getAttribute("src"));
        if (noscriptImg.getAttribute("srcset")) {
          img.setAttribute("srcset", noscriptImg.getAttribute("srcset"));
        }
        if (noscriptImg.getAttribute("alt")) {
          img.setAttribute("alt", noscriptImg.getAttribute("alt"));
        }
        noscript.parentNode.insertBefore(img, noscript);
      }
      // Remove the noscript tag
      noscript.remove();
    }
  });

  // Detect hero/featured images from background styles and data attributes
  const figuresAndDivs = document.querySelectorAll("figure, div");
  figuresAndDivs.forEach((node) => {
    const style = node.getAttribute("style") || "";
    const bgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
    const dataSrc =
      node.getAttribute("data-src") ||
      node.getAttribute("data-bg") ||
      node.getAttribute("data-background");
    const src = bgMatch?.[1] || dataSrc;

    // Only add image if there's a background and no existing img child
    if (src && !node.querySelector("img")) {
      const absolute = resolveImageUrl(src, baseUrl);
      if (absolute) {
        const img = document.createElement("img");
        img.setAttribute("src", absolute);
        img.setAttribute("alt", "");
        // Insert at the beginning of the element
        node.insertBefore(img, node.firstChild);
      }
    }
  });

  // Remove placeholder messages
  const allElements = document.querySelectorAll("*");
  allElements.forEach((element) => {
    if (element.children.length === 0 && element.textContent) {
      const text = element.textContent.trim();
      if (
        text.toLowerCase().includes("press enter") ||
        text.toLowerCase().includes("click to view image") ||
        text.toLowerCase().includes("view image in full size")
      ) {
        element.remove();
      }
    }
  });

  const images = document.querySelectorAll("img");
  images.forEach((image) => {
    applyPreferredSourceToImage(image, baseUrl, { removeWhenMissing: true });

    // Add accessibility and loading attributes
    if (!image.getAttribute("alt")) {
      image.setAttribute("alt", "");
    }
    image.removeAttribute("loading"); // Let browser decide
    image.setAttribute("decoding", "async");
    image.setAttribute("referrerpolicy", "no-referrer-when-downgrade");

    // Remove lazy-loading data attributes after we've processed them
    IMAGE_SOURCE_ATTRIBUTES.forEach((attr) => {
      image.removeAttribute(attr);
    });
    image.removeAttribute("data-lazyloaded");
    image.removeAttribute("data-sizes");
  });

  const pictures = document.querySelectorAll("picture");
  pictures.forEach((picture) => {
    normalizePictureSources(picture, baseUrl);
  });

  // Remove empty figures
  const figures = document.querySelectorAll("figure");
  figures.forEach((figure) => {
    if (!figure.querySelector("img")) {
      figure.remove();
    }
  });

  return document.body.innerHTML;
};

export const processArticle = async (url) => {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });

  // Extract OpenGraph image as fallback hero image
  const ogImage =
    dom.window.document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    dom.window.document.querySelector('meta[name="twitter:image"]')?.getAttribute("content");

  hydrateDocumentImages(dom.window.document, url);
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed) {
    throw new Error("Unable to parse article content");
  }

  let rawHtmlContent = parsed.content || "";

  // Prepend OG image as hero only if it's not already in the content
  if (ogImage) {
    const resolvedOgImage = resolveImageUrl(ogImage, url);
    if (resolvedOgImage) {
      // Check if this image URL (or a variant) is already in the content
      const tempDom = new JSDOM(`<body>${rawHtmlContent}</body>`);
      const existingImages = Array.from(tempDom.window.document.querySelectorAll("img"));

      // Extract the base image identifier (filename without resolution/format parameters)
      const ogImageBase = resolvedOgImage.split('/').pop()?.split('?')[0];

      const imageAlreadyExists = existingImages.some((img) => {
        const imgSrc = img.getAttribute("src") || "";
        const imgSrcBase = imgSrc.split('/').pop()?.split('?')[0];
        // Check if the base filename matches (handles resize/format variations)
        return imgSrc.includes(ogImageBase) || (imgSrcBase && ogImageBase && imgSrcBase.includes(ogImageBase.split('.')[0]));
      });

      // Only add if not already present
      if (!imageAlreadyExists) {
        rawHtmlContent = `<figure><img src="${resolvedOgImage}" alt="Featured image" /></figure>${rawHtmlContent}`;
      }
    }
  }

  const normalizedHtmlContent = normalizeArticleContent(rawHtmlContent, url);
  const sanitizedHtmlContent = sanitizeHtml(normalizedHtmlContent);
  const fallbackText = parsed.textContent || normalizeText(sanitizedHtmlContent);
  const htmlSegments = chunkHtmlContent(sanitizedHtmlContent, MAX_WORDS_PER_SEGMENT);

  const baseSegments = htmlSegments.length
    ? htmlSegments
    : chunkByWordGoal(fallbackText, MAX_WORDS_PER_SEGMENT).map((segment) => ({
        html: null,
        text: segment.text,
        wordCount: segment.wordCount,
      }));

  const totalWords = baseSegments.reduce(
    (total, segment) => total + segment.wordCount,
    0,
  );

  return {
    type: "article",
    title: parsed.title || dom.window.document.title || "Article",
    sourceUrl: url,
    segmentMinutes: SEGMENT_MINUTES,
    totalSegments: baseSegments.length,
    totalWords,
    segments: baseSegments.map((segment, index) => ({
      id: `segment-${index + 1}`,
      label: `Section ${index + 1}`,
      wordCount: segment.wordCount,
      estimatedMinutes: Math.max(1, Math.round(segment.wordCount / WORDS_PER_MINUTE)),
      text: segment.text,
      html: segment.html,
    })),
  };
};
