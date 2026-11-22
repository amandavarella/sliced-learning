// DOMPurify is passed in rather than imported. The server passes
// isomorphic-dompurify, which builds DOMPurify on a JSDOM window in Node. The
// extension should pass plain `dompurify` (about 23 KB minified): the browser
// entry of isomorphic-dompurify does not pull jsdom into a Vite bundle, but it
// reads `window.DOMPurify`, which throws where there is no `window`, and npm
// still installs jsdom alongside it. A bare import here would also resolve
// from shared/node_modules, which no consumer installs.

// Allows images, figures, and semantic content. Blocks scripts and unsafe
// attributes while keeping images and their metadata.
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    // Images and figures
    "img",
    "figure",
    "figcaption",
    "picture",
    "source",
    "video",
    // Text content
    "p",
    "a",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "mark",
    "small",
    "del",
    "ins",
    "sub",
    "sup",
    // Lists
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    // Headings
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    // Code and quotes
    "blockquote",
    "pre",
    "code",
    "kbd",
    // Collapsible sections (GitHub Markdown). Inert: no scripting, and
    // DOMPurify still strips event handler attributes from them
    "details",
    "summary",
    // Structure
    "div",
    "span",
    "section",
    "article",
    "header",
    "footer",
    "main",
    "aside",
    "nav",
    // Other
    "br",
    "hr",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
  ],
  ALLOWED_ATTR: [
    // Image attributes
    "src",
    "srcset",
    "sizes",
    "alt",
    "title",
    "width",
    "height",
    "decoding",
    "referrerpolicy",
    // Link attributes
    "href",
    "target",
    "rel",
    // Media attributes
    "type",
    "media",
    // Video attributes
    "poster",
    "controls",
    "autoplay",
    "muted",
    "loop",
    "playsinline",
    "preload",
    // Semantic attributes
    "class",
    "id",
    // Data attributes for lazy loading (will be processed by our normalizer)
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-srcset",
  ],
  // Keep relative URLs relative (we'll normalize them separately)
  ALLOW_DATA_ATTR: true,
  // Allow unknown protocols (we validate in our normalizer)
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export const createSanitizer = (DOMPurify) => {
  if (typeof DOMPurify?.sanitize !== "function") {
    throw new TypeError("createSanitizer needs a DOMPurify instance");
  }

  return (unsafeHtml) => DOMPurify.sanitize(unsafeHtml, SANITIZE_CONFIG);
};
