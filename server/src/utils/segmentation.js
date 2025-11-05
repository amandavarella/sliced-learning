import { JSDOM } from "jsdom";

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

/**
 * Calculates adaptive segment size based on total article length.
 *
 * This prevents short, continuous articles from being unnecessarily split into
 * multiple segments, improving reading flow and context preservation.
 *
 * Segmentation strategy:
 * - Short articles (≤1500 words / ~7.5 min): Single segment - maintains complete context
 * - Medium articles (1501-2500 words / ~7.5-12.5 min): Max 2 segments - balanced approach
 * - Long articles (>2500 words / >12.5 min): Standard segmentation - use base threshold
 *
 * @param {number} totalWords - Total word count of the article
 * @param {number} baseMaxWords - Base maximum words per segment (default threshold)
 * @returns {number} - Adjusted maximum words per segment
 */
const calculateAdaptiveSegmentSize = (totalWords, baseMaxWords) => {
  // Thresholds based on reading time at 200 WPM
  const SHORT_ARTICLE_THRESHOLD = 1500;  // ~7.5 min read → single segment
  const MEDIUM_ARTICLE_THRESHOLD = 2500; // ~12.5 min read → max 2 segments

  // For short articles and continuous prose, don't segment at all
  if (totalWords <= SHORT_ARTICLE_THRESHOLD) {
    return Infinity;
  }

  // For medium-length articles, use a more generous threshold
  if (totalWords <= MEDIUM_ARTICLE_THRESHOLD) {
    return Math.ceil(totalWords / 2); // Split into at most 2 segments
  }

  // For longer articles, use the standard threshold
  return baseMaxWords;
};

export const chunkHtmlContent = (html, maxWordsPerSegment) => {
  if (!html || !html.trim()) {
    return [];
  }

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const root = unwrapContainer(document.body);

  // Calculate total word count first to determine adaptive segmentation
  const totalTextContent = root.textContent || "";
  const totalWords = wordsIn(totalTextContent);

  // Adjust max words per segment based on article length
  const adaptiveMaxWords = calculateAdaptiveSegmentSize(totalWords, maxWordsPerSegment);

  const segments = [];
  let currentHtmlParts = [];
  let currentTextParts = [];
  let currentWordCount = 0;
  
  const pushSegment = () => {
    if (!currentHtmlParts.length) {
      return;
    }

    segments.push({
      html: currentHtmlParts.join(""),
      text: collapseWhitespace(currentTextParts.join(" ")),
      wordCount: currentWordCount,
    });

    currentHtmlParts = [];
    currentTextParts = [];
    currentWordCount = 0;
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

    if (nodeWordCount > adaptiveMaxWords) {
      if (node.nodeType === NODE_TYPE.ELEMENT) {
        appendChildren(node);
        return;
      }

      if (currentHtmlParts.length) {
        pushSegment();
      }

      segments.push({
        html: serialized,
        text: collapseWhitespace(nodeTextContent),
        wordCount: nodeWordCount,
      });
      return;
    }

    if (currentWordCount && currentWordCount + nodeWordCount > adaptiveMaxWords) {
      pushSegment();
    }

    currentHtmlParts.push(serialized);

    if (nodeTextContent.trim()) {
      currentTextParts.push(nodeTextContent);
    }

    currentWordCount += nodeWordCount;
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
