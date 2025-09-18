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

export const chunkHtmlContent = (html, maxWordsPerSegment) => {
  if (!html || !html.trim()) {
    return [];
  }

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const root = unwrapContainer(document.body);

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

    if (nodeWordCount > maxWordsPerSegment) {
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

    if (currentWordCount && currentWordCount + nodeWordCount > maxWordsPerSegment) {
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
