import { URL } from "url";

const selectors = {
  title: [
    "meta[property='og:title']",
    "meta[name='twitter:title']",
    "title",
  ],
  description: [
    "meta[property='og:description']",
    "meta[name='description']",
    "meta[name='twitter:description']",
  ],
  favicon: [
    "link[rel='icon']",
    "link[rel='shortcut icon']",
    "link[rel='apple-touch-icon']",
    "link[rel='apple-touch-icon-precomposed']",
    "link[rel='mask-icon']",
  ],
  ogImage: [
    "meta[property='og:image']",
    "meta[name='twitter:image']",
    "meta[property='og:image:url']",
  ],
  url: [
    "meta[property='og:url']",
    "link[rel='canonical']",
  ],
};

const getContent = (element) => {
  if (!element) {
    return null;
  }
  if (element.tagName === "TITLE") {
    return element.textContent?.trim() || null;
  }
  if (element.hasAttribute("content")) {
    return element.getAttribute("content")?.trim() || null;
  }
  if (element.hasAttribute("href")) {
    return element.getAttribute("href")?.trim() || null;
  }
  return element.textContent?.trim() || null;
};

const toAbsoluteUrl = (value, baseUrl) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  try {
    const absolute = new URL(trimmed, baseUrl);
    return absolute.toString();
  } catch (error) {
    return null;
  }
};

const pickFirst = (document, selectorList) => {
  for (const selector of selectorList) {
    const element = document.querySelector(selector);
    const value = getContent(element);
    if (value) {
      return value;
    }
  }
  return null;
};

export const extractDocumentMeta = (document, baseUrl) => {
  if (!document) {
    return {};
  }

  const title = pickFirst(document, selectors.title);
  const description = pickFirst(document, selectors.description);
  const faviconRelative = pickFirst(document, selectors.favicon);
  const ogImageRelative = pickFirst(document, selectors.ogImage);
  const canonical = pickFirst(document, selectors.url);

  const resolvedUrl = canonical ? toAbsoluteUrl(canonical, baseUrl) : baseUrl;

  return {
    title: title || undefined,
    description: description || undefined,
    favicon: toAbsoluteUrl(faviconRelative, baseUrl) || undefined,
    ogImage: toAbsoluteUrl(ogImageRelative, baseUrl) || undefined,
    url: resolvedUrl || undefined,
  };
};
