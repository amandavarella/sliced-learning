const WORD_PATTERN = /\s+/g;
const FORBIDDEN_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const NODE_TYPE = {
  ELEMENT: 1,
  TEXT: 3,
  COMMENT: 8,
  DOCUMENT_FRAGMENT: 11,
};
const WRAPPABLE_CONTAINER_TAGS = new Set(["DIV", "ARTICLE", "SECTION", "MAIN"]);

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const collapseWhitespace = (value) => {
  return String(value ?? "").replace(/\s+/g, " ").trim();
};

const splitIntoParagraphs = (text) => {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
};

const wordsIn = (text) => {
  if (!text) {
    return 0;
  }
  return text.trim().split(WORD_PATTERN).filter(Boolean).length;
};

const shouldSkipNode = (node) => {
  if (!node) {
    return true;
  }

  if (node.nodeType === NODE_TYPE.COMMENT) {
    return true;
  }

  if (node.nodeType === NODE_TYPE.TEXT) {
    return !node.textContent || !node.textContent.trim();
  }

  if (node.nodeType === NODE_TYPE.ELEMENT) {
    return FORBIDDEN_TAGS.has(node.nodeName);
  }

  return true;
};

const serializeNode = (node) => {
  if (!node) {
    return "";
  }

  if (node.nodeType === NODE_TYPE.TEXT) {
    return escapeHtml(node.textContent);
  }

  if (node.nodeType === NODE_TYPE.ELEMENT) {
    if (FORBIDDEN_TAGS.has(node.nodeName)) {
      return "";
    }
    return node.outerHTML || "";
  }

  if (node.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT) {
    return Array.from(node.childNodes)
      .map((child) => serializeNode(child))
      .join("");
  }

  return "";
};

const unwrapContainer = (node) => {
  let current = node;
  while (
    current?.childNodes?.length === 1 &&
    current.firstChild.nodeType === NODE_TYPE.ELEMENT &&
    WRAPPABLE_CONTAINER_TAGS.has(current.firstChild.nodeName)
  ) {
    current = current.firstChild;
  }

  return current;
};

// Elements that are never split, even when they hold more words than one
// segment: a code block or a figure cut in two reads worse than a long
// segment, and a table row is the smallest piece a table splits into.
const KEEP_WHOLE_TAGS = new Set(["PRE", "FIGURE", "TR"]);

// Elements that split across segments with their structure kept: each part is
// wrapped in a copy of the element, so a long table becomes two or more
// tables, a long list two or more lists. Other oversized elements (div,
// section, p) are descended into and their wrapper dropped, as before.
const SPLIT_WITH_WRAPPER_TAGS = new Set([
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "UL",
  "OL",
  "DL",
  "LI",
  "BLOCKQUOTE",
  "DETAILS",
]);

// Children repeated at the top of every part of a split element: a table's
// caption and header rows, a details element's summary.
const HEADER_TAGS = {
  TABLE: new Set(["CAPTION", "THEAD", "COLGROUP"]),
  DETAILS: new Set(["SUMMARY"]),
};

const isHeaderOf = (frame, node) =>
  Boolean(frame && node.nodeType === NODE_TYPE.ELEMENT && HEADER_TAGS[frame.node.nodeName]?.has(node.nodeName));

const closingTag = (node) => `</${node.nodeName.toLowerCase()}>`;

// The start tag of a part of a split element. An ordered list continued from
// the previous segment gets a start attribute so its numbering carries on.
const openingTag = (frame) => {
  const clone = frame.node.cloneNode(false);
  if (frame.node.nodeName === "OL" && frame.itemCount) {
    const start = Number.parseInt(frame.node.getAttribute("start") ?? "1", 10);
    clone.setAttribute("start", String((Number.isNaN(start) ? 1 : start) + frame.itemCount));
  }
  const html = clone.outerHTML;
  const close = closingTag(frame.node);
  return html.endsWith(close) ? html.slice(0, -close.length) : html;
};

// Splits sanitised HTML into segments of at most maxWordsPerSegment words,
// keeping whole block elements together where they fit. An element too big
// for one segment is kept whole (KEEP_WHOLE_TAGS), split into parts that each
// keep its wrapper (SPLIT_WITH_WRAPPER_TAGS), or descended into. `parseHtml`
// turns an HTML string into a Document (see dom/node.js and dom/browser.js),
// which keeps this module free of any DOM library.
export const chunkHtmlContent = (html, maxWordsPerSegment, { parseHtml } = {}) => {
  if (!html || !html.trim()) {
    return [];
  }

  if (typeof parseHtml !== "function") {
    throw new TypeError("chunkHtmlContent needs a parseHtml function");
  }

  const document = parseHtml(html);
  const root = unwrapContainer(document.body);

  const segments = [];
  let currentHtmlParts = [];
  let currentTextParts = [];
  let currentWordCount = 0;
  let currentHasContent = false;
  // Split elements currently open, outermost first. Each frame records where
  // its start tag sits in the current segment (to drop it if nothing follows),
  // whether this segment holds any of its content yet, its header HTML, and
  // (for lists) how many items it has emitted so far.
  const openFrames = [];

  const reopenFrames = () => {
    for (const frame of openFrames) {
      frame.openIndex = currentHtmlParts.length;
      frame.openTextIndex = currentTextParts.length;
      frame.openWordCount = currentWordCount;
      frame.hasContent = false;
      currentHtmlParts.push(openingTag(frame), ...frame.headers);
    }
  };

  // Removes a split element that holds nothing but its start tag and headers
  const dropFrame = (frame) => {
    currentHtmlParts.length = frame.openIndex;
    currentTextParts.length = frame.openTextIndex;
    currentWordCount = frame.openWordCount;
  };

  const pushSegment = () => {
    // Close the open split elements, innermost first. One with no content in
    // this segment (opened just before the break) is dropped entirely.
    for (let index = openFrames.length - 1; index >= 0; index -= 1) {
      const frame = openFrames[index];
      if (frame.hasContent) {
        currentHtmlParts.push(closingTag(frame.node));
      } else {
        dropFrame(frame);
      }
    }

    if (currentHasContent) {
      segments.push({
        html: currentHtmlParts.join(""),
        text: collapseWhitespace(currentTextParts.join(" ")),
        wordCount: currentWordCount,
      });
    }

    currentHtmlParts = [];
    currentTextParts = [];
    currentWordCount = 0;
    currentHasContent = false;
    reopenFrames();
  };

  const appendChildren = (parent) => {
    if (!parent?.childNodes) {
      return;
    }

    Array.from(parent.childNodes).forEach((child) => {
      if (child.nodeType === NODE_TYPE.TEXT && (!child.textContent || !child.textContent.trim())) {
        return;
      }
      appendNode(child);
    });
  };

  const appendSplit = (node) => {
    const frame = {
      node,
      openIndex: currentHtmlParts.length,
      openTextIndex: currentTextParts.length,
      openWordCount: currentWordCount,
      hasContent: false,
      headers: [],
      itemCount: 0,
    };
    currentHtmlParts.push(openingTag(frame));
    openFrames.push(frame);
    appendChildren(node);
    openFrames.pop();
    if (frame.hasContent) {
      currentHtmlParts.push(closingTag(node));
    } else {
      dropFrame(frame);
    }
  };

  const appendNode = (node) => {
    if (shouldSkipNode(node)) {
      return;
    }

    const serialized = serializeNode(node);
    if (!serialized) {
      return;
    }

    const nodeTextContent = node.textContent || "";
    const nodeWordCount = wordsIn(nodeTextContent);
    const parentFrame = openFrames[openFrames.length - 1];

    if (nodeWordCount > maxWordsPerSegment && node.nodeType === NODE_TYPE.ELEMENT) {
      if (SPLIT_WITH_WRAPPER_TAGS.has(node.nodeName)) {
        appendSplit(node);
        return;
      }
      if (!KEEP_WHOLE_TAGS.has(node.nodeName)) {
        appendChildren(node);
        return;
      }
    }

    if (currentWordCount && currentWordCount + nodeWordCount > maxWordsPerSegment) {
      pushSegment();
    }

    currentHtmlParts.push(serialized);

    if (nodeTextContent.trim()) {
      currentTextParts.push(nodeTextContent);
    }

    currentWordCount += nodeWordCount;

    if (isHeaderOf(parentFrame, node)) {
      // Repeated in later parts; on its own it is not a reason to keep a part
      parentFrame.headers.push(serialized);
      return;
    }

    currentHasContent = true;
    for (const frame of openFrames) {
      frame.hasContent = true;
    }
    if (parentFrame && node.nodeName === "LI") {
      parentFrame.itemCount += 1;
    }
  };

  appendChildren(root);

  pushSegment();

  return segments;
};

const toSegment = (parts, wordCount) => ({
  text: parts.join("\n\n"),
  wordCount,
});

const chunkList = (items, maxWordsPerSegment) => {
  const segments = [];
  let currentParts = [];
  let currentCount = 0;

  for (const item of items) {
    const itemWordCount = wordsIn(item);

    if (currentCount && currentCount + itemWordCount > maxWordsPerSegment) {
      segments.push(toSegment(currentParts, currentCount));
      currentParts = [];
      currentCount = 0;
    }

    currentParts.push(item);
    currentCount += itemWordCount;
  }

  if (currentParts.length) {
    segments.push(toSegment(currentParts, currentCount));
  }

  if (!segments.length && items.length) {
    const joined = items.join(" ");
    segments.push(toSegment([joined], wordsIn(joined)));
  }

  return segments;
};

export const chunkByWordGoal = (text, maxWordsPerSegment) => {
  const paragraphs = splitIntoParagraphs(text);

  if (!paragraphs.length) {
    const sentences = text
      .split(/[\.!?]\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    return chunkList(sentences, maxWordsPerSegment);
  }

  return chunkList(paragraphs, maxWordsPerSegment);
};

export const buildTimingSegments = (totalSeconds, secondsPerSegment) => {
  const segments = [];
  const totalSegments = Math.max(1, Math.ceil(totalSeconds / secondsPerSegment));

  for (let index = 0; index < totalSegments; index += 1) {
    const startSeconds = index * secondsPerSegment;
    const endSeconds = Math.min(totalSeconds, startSeconds + secondsPerSegment);

    segments.push({
      id: `segment-${index + 1}`,
      label: `Module ${index + 1}`,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
    });
  }

  return segments;
};
