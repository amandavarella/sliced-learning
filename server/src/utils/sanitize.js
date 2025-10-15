import createDOMPurify from "isomorphic-dompurify";

/**
 * Sanitizes HTML content while preserving images, figures, and semantic content.
 * Blocks scripts and unsafe attributes while keeping images and their metadata.
 */
export const sanitizeHtml = (unsafeHtml) => {
  const DOMPurify = createDOMPurify(globalThis);

  // Configure DOMPurify to allow images and semantic HTML
  return DOMPurify.sanitize(unsafeHtml, {
    ALLOWED_TAGS: [
      // Images and figures
      "img",
      "figure",
      "figcaption",
      "picture",
      "source",
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
  });
};
