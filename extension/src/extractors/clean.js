// Cleans an extracted body before it leaves the page. Works on a clone, so
// the live page is never touched, and returns the clone.
//
// - Drops GitHub UI inside rendered Markdown: heading permalinks, copy
//   buttons with their tooltips and screen reader labels, and the overlay
//   toggles around rendered diagrams.
// - Replaces rendered diagrams (Mermaid and the other viewscreen formats),
//   which live in a cross-origin iframe the capture cannot read, with their
//   source as a code block plus a link to the original page.
// - Turns task list checkboxes into text, since the sanitiser drops inputs.
// - Makes href, src and srcset absolute: the reader renders from a
//   chrome-extension:// origin, where relative URLs would point nowhere.
// - Prefers an image's data-canonical-src over its camo.githubusercontent.com
//   proxy URL, keeping the camo URL in data-fallback-src for the inliner.
const NOISE_SELECTORS = [
  "a.anchor",
  "svg.octicon-link",
  "clipboard-copy",
  ".zeroclipboard-container",
  ".ClipboardButton",
  ".js-clipboard-copy",
  // Tooltips carry a button's label as text ("Copy code to clipboard"). The
  // sanitiser drops unknown tags such as tool-tip and button but keeps their
  // text, so a tooltip left in would show up as a stray line in the reader
  "tool-tip",
  '[role="tooltip"]',
  "details.details-reset",
  "details.details-overlay",
  "details-dialog",
];

const DIAGRAM_CONTAINERS = [
  "section.js-render-needs-enrichment",
  'section[data-type="mermaid"]',
  ".render-container",
  "iframe.render-viewer",
];

// Elements next to a code block that are UI rather than content: the copy
// button, its screen reader label, and popover feedback ("Copied!")
const CODE_BLOCK_UI_SELECTORS = ["button", ".sr-only", ".visually-hidden", "[popover]", "[aria-live]"];
const CODE_WRAPPER_CONTENT = "p, h1, h2, h3, h4, h5, h6, ul, ol, dl, table, blockquote, img, figure";
const COPY_LABEL = /^(copy( code)?( to clipboard)?|copied!?)$/i;

export const DIAGRAM_NOTE = "Diagram rendered on GitHub";

const CAMO_HOST = "camo.githubusercontent.com";

const parseJsonData = (value) => {
  if (!value) {
    return "";
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.data === "string" ? parsed.data : "";
  } catch {
    return "";
  }
};

const diagramSource = (container) => {
  const pre = container.querySelector('pre[lang="mermaid"], pre[lang]');
  if (pre?.textContent.trim()) {
    return pre.textContent;
  }
  const withJson = container.matches("[data-json]") ? container : container.querySelector("[data-json]");
  const fromJson = parseJsonData(withJson?.getAttribute("data-json"));
  if (fromJson) {
    return fromJson;
  }
  const iframe = container.matches("iframe") ? container : container.querySelector("iframe[data-content]");
  const fromIframe = parseJsonData(iframe?.getAttribute("data-content"));
  if (fromIframe) {
    return fromIframe;
  }
  const withPlain = container.matches("[data-plain]") ? container : container.querySelector("[data-plain]");
  return withPlain?.getAttribute("data-plain") || "";
};

const diagramType = (container) => {
  const typed = container.matches("[data-type]") ? container : container.querySelector("[data-type]");
  const pre = container.querySelector("pre[lang]");
  return (typed?.getAttribute("data-type") || pre?.getAttribute("lang") || "mermaid").toLowerCase();
};

const replaceDiagrams = (root, pageUrl) => {
  const document = root.ownerDocument;
  let replaced = 0;

  for (const selector of DIAGRAM_CONTAINERS) {
    // Re-query each round: replacing a section also removes the
    // .render-container and iframe inside it
    for (const node of Array.from(root.querySelectorAll(selector))) {
      if (!root.contains(node)) {
        continue;
      }
      const container =
        node.closest("section.js-render-needs-enrichment, section[data-type]") ||
        node.closest(".render-container") ||
        node;
      if (container === root || !root.contains(container)) {
        continue;
      }

      const type = diagramType(container);
      const source = diagramSource(container);
      const fragment = document.createDocumentFragment();

      if (source.trim()) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.className = `language-${type}`;
        code.textContent = source.replace(/\s+$/, "");
        pre.appendChild(code);
        fragment.appendChild(pre);
      }

      const note = document.createElement("p");
      const link = document.createElement("a");
      link.setAttribute("href", pageUrl);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.textContent = DIAGRAM_NOTE;
      note.appendChild(link);
      fragment.appendChild(note);

      container.replaceWith(fragment);
      replaced += 1;
    }
  }
  return replaced;
};

// GitHub wraps each code block in a div with the copy UI beside the pre
// (div.highlight, div.snippet-clipboard-content). Removes that UI, and any
// leftover element or text that is only a copy label, from the wrapper
// without touching the code itself.
const removeCodeBlockUi = (root) => {
  const wrappers = new Set();
  for (const pre of root.querySelectorAll("pre")) {
    const wrapper = pre.parentElement;
    // Only a div that holds this one code block and no other content, so a
    // list item or blockquote around a code block is never trimmed
    if (
      wrapper?.tagName === "DIV" &&
      wrapper !== root &&
      !wrapper.closest("pre") &&
      wrapper.querySelectorAll("pre").length === 1 &&
      !wrapper.querySelector(CODE_WRAPPER_CONTENT)
    ) {
      wrappers.add(wrapper);
    }
  }
  const outsideCode = (node) => !node.parentElement?.closest("pre, code");

  for (const wrapper of wrappers) {
    for (const node of Array.from(wrapper.querySelectorAll(CODE_BLOCK_UI_SELECTORS.join(",")))) {
      if (root.contains(node) && outsideCode(node)) {
        node.remove();
      }
    }
    for (const node of Array.from(wrapper.querySelectorAll("*"))) {
      if (root.contains(node) && !node.matches("pre, code") && outsideCode(node) && COPY_LABEL.test(node.textContent.trim())) {
        node.remove();
      }
    }
    for (const child of Array.from(wrapper.childNodes)) {
      if (child.nodeType === 3 && COPY_LABEL.test(child.textContent.trim())) {
        child.remove();
      }
    }
  }
};

export const unwrap = (node) => {
  node.replaceWith(...Array.from(node.childNodes));
};

// A details element that wraps the whole body hides the content behind a
// toggle in the reader; keep its summary as a paragraph and open it up
const unwrapWholeBodyDetails = (root) => {
  const elements = Array.from(root.children);
  if (elements.length !== 1 || elements[0].tagName !== "DETAILS") {
    return;
  }
  const details = elements[0];
  const summary = details.querySelector(":scope > summary");
  if (summary) {
    const paragraph = root.ownerDocument.createElement("p");
    paragraph.append(...Array.from(summary.childNodes));
    summary.replaceWith(paragraph);
  }
  unwrap(details);
};

const replaceCheckboxes = (root) => {
  for (const input of Array.from(root.querySelectorAll('input[type="checkbox"]'))) {
    const mark = input.hasAttribute("checked") || input.getAttribute("aria-checked") === "true" ? "☑" : "☐";
    input.replaceWith(root.ownerDocument.createTextNode(`${mark} `));
  }
  // Anything else an input could be is UI, not content
  for (const input of Array.from(root.querySelectorAll("input"))) {
    input.remove();
  }
};

export const resolveUrl = (value, baseUrl) => {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
};

// srcset candidates are "<url> <descriptor>" joined by commas. A comma inside a
// URL is not followed by whitespace, so split on comma plus whitespace only.
const resolveSrcset = (value, baseUrl) =>
  value
    .split(/,\s+/)
    .map((candidate) => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      return [resolveUrl(url, baseUrl), ...descriptors].join(" ");
    })
    .join(", ");

export const absolutise = (root, baseUrl) => {
  const all = [root, ...root.querySelectorAll("[href], [src], [srcset]")];
  for (const node of all) {
    for (const attribute of ["href", "src"]) {
      const value = node.getAttribute(attribute);
      // In-page anchors point at the original page, which is where they work
      if (value !== null && value.trim()) {
        node.setAttribute(attribute, resolveUrl(value.trim(), baseUrl));
      }
    }
    const srcset = node.getAttribute("srcset");
    if (srcset) {
      node.setAttribute("srcset", resolveSrcset(srcset, baseUrl));
    }
  }
};

const isCamo = (value) => {
  try {
    return new URL(value).hostname === CAMO_HOST;
  } catch {
    return false;
  }
};

const preferCanonicalImages = (root, baseUrl) => {
  for (const img of root.querySelectorAll("img[data-canonical-src]")) {
    const src = img.getAttribute("src") || "";
    const canonical = img.getAttribute("data-canonical-src");
    if (!canonical || !isCamo(src)) {
      continue;
    }
    img.setAttribute("src", resolveUrl(canonical, baseUrl));
    img.setAttribute("data-fallback-src", src);
    // The camo srcset would win over src in the reader
    img.removeAttribute("srcset");
  }
};

export const cleanBody = (bodyElement, baseUrl) => {
  const clone = bodyElement.cloneNode(true);

  replaceDiagrams(clone, baseUrl);

  for (const node of Array.from(clone.querySelectorAll(NOISE_SELECTORS.join(",")))) {
    node.remove();
  }
  removeCodeBlockUi(clone);
  for (const wrapper of Array.from(clone.querySelectorAll("div.markdown-heading"))) {
    unwrap(wrapper);
  }
  unwrapWholeBodyDetails(clone);
  replaceCheckboxes(clone);
  absolutise(clone, baseUrl);
  preferCanonicalImages(clone, baseUrl);

  return clone;
};
