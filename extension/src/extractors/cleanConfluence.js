// Cleans a Confluence body (export view HTML from the API, or the rendered
// DOM) before it leaves the page. Works on a clone and returns it.
//
// Markup sources. Confirmed in Atlassian's own pages: the expand macro's
// `expand-container` and `expand-control` classes (support KB "Expand Macro
// collapses immediately upon expanding it") and the info macro's
// `confluence-information-macro`, `-body` and `-information` classes
// (community answer on styling the info macro in HTML export). Everything
// else below is [Unverified]: it follows the view and export view HTML that
// Confluence has rendered for years (macro wrappers with `conf-macro` and
// `data-macro-name`), but no export view from a Cloud site was available to
// check it against. First real use should compare a captured body with these
// rules (see "First manual test on envato.atlassian.net" in the plan).
import { absolutise, resolveUrl, unwrap } from "./clean.js";

// Removed outright: navigation and UI, not content
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  // Table of contents macro (client-side and server-rendered variants)
  ".toc-macro",
  ".client-side-toc-macro",
  '[data-macro-name="toc"]',
  // Icon spans inside macros, only a non-breaking space as text
  ".confluence-information-macro-icon",
  ".expand-control-icon",
  "span.aui-icon",
  // Empty anchor targets for in-page links
  "span.confluence-anchor-link",
  // UI in the rendered DOM (DOM fallback only): heading copy-link buttons
  "button",
];

// Layout-only wrappers, replaced by their children
const LAYOUT_WRAPPERS = [
  ".contentLayout2",
  ".contentLayout",
  ".columnLayout",
  ".cell",
  ".innerCell",
  "div.table-wrap",
  "span.confluence-embedded-file-wrapper",
];

const INFO_LABELS = {
  information: "Info",
  info: "Info",
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

// The selector list is queried once per rule, so nested matches already
// removed by an outer one are skipped
const each = (root, selector, fn) => {
  for (const node of Array.from(root.querySelectorAll(selector))) {
    if (root.contains(node)) {
      fn(node);
    }
  }
};

// Info, note, tip and warning macros become a blockquote led by their title
// (or the macro type when the title is empty)
const replaceInfoMacros = (root) => {
  const document = root.ownerDocument;
  each(root, ".confluence-information-macro", (macro) => {
    const typeClass = Array.from(macro.classList).find((name) =>
      name.startsWith("confluence-information-macro-") &&
      INFO_LABELS[name.slice("confluence-information-macro-".length)],
    );
    const type = typeClass ? typeClass.slice("confluence-information-macro-".length) : "information";
    const titleNode = macro.querySelector(":scope > .title, :scope > p.title");
    const bodyNode = macro.querySelector(":scope > .confluence-information-macro-body") || macro;
    const title = text(titleNode);
    titleNode?.remove();

    const quote = document.createElement("blockquote");
    quote.className = `confluence-panel confluence-panel-${INFO_LABELS[type].toLowerCase()}`;
    const heading = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = title || INFO_LABELS[type];
    heading.appendChild(strong);
    quote.appendChild(heading);
    quote.append(...Array.from(bodyNode.childNodes));
    macro.replaceWith(quote);
  });

  // [Unverified] The panel macro: div.panel with .panelHeader and
  // .panelContent. Code macros share the panel classes and are handled first.
  each(root, "div.panel:not(.code)", (panel) => {
    const header = panel.querySelector(":scope > .panelHeader");
    const content = panel.querySelector(":scope > .panelContent") || panel;
    const quote = document.createElement("blockquote");
    quote.className = "confluence-panel";
    if (text(header)) {
      const heading = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = text(header);
      heading.appendChild(strong);
      quote.appendChild(heading);
    }
    header?.remove();
    quote.append(...Array.from(content.childNodes));
    panel.replaceWith(quote);
  });
};

// Expand macros become details/summary, which the sanitiser allows. The
// reader shows them collapsed (the sanitiser drops `open`).
const replaceExpandMacros = (root) => {
  const document = root.ownerDocument;
  each(root, ".expand-container", (container) => {
    const control = container.querySelector(".expand-control");
    const label = text(control?.querySelector(".expand-control-text")) || text(control) || "Click here to expand...";
    const content = container.querySelector(".expand-content");
    control?.remove();

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    details.append(...Array.from((content || container).childNodes));
    container.replaceWith(details);
  });
};

// "brush: java; gutter: false; theme: Confluence" -> "java"
const brushOf = (pre) => {
  const params = pre?.getAttribute("data-syntaxhighlighter-params") || "";
  const brush = params.match(/brush:\s*([\w+#-]+)/)?.[1];
  return (brush || pre?.getAttribute("data-language") || pre?.getAttribute("data-code-lang") || "").toLowerCase();
};

const plainCodeBlock = (document, source, language) => {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  if (language && language !== "none" && language !== "text") {
    code.className = `language-${language}`;
  }
  code.textContent = source.replace(/\s+$/, "");
  pre.appendChild(code);
  return pre;
};

// Code macros become plain pre > code, with the macro title as a paragraph
const replaceCodeMacros = (root) => {
  const document = root.ownerDocument;
  each(root, 'div.code.panel, div[data-macro-name="code"], .code-block', (macro) => {
    const pre = macro.querySelector("pre");
    const header = text(macro.querySelector(".codeHeader"));
    const fragment = document.createDocumentFragment();
    if (header) {
      const title = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = header;
      title.appendChild(strong);
      fragment.appendChild(title);
    }
    fragment.appendChild(plainCodeBlock(document, (pre || macro).textContent, brushOf(pre)));
    macro.replaceWith(fragment);
  });
  // A highlighter pre outside a macro wrapper
  each(root, "pre.syntaxhighlighter-pre", (pre) => {
    pre.replaceWith(plainCodeBlock(document, pre.textContent, brushOf(pre)));
  });
};

// Status lozenges become a plain inline span with their text
const replaceStatusMacros = (root) => {
  const document = root.ownerDocument;
  each(root, '.status-macro, [data-macro-name="status"]', (lozenge) => {
    const span = document.createElement("span");
    span.className = "confluence-status";
    span.textContent = text(lozenge);
    lozenge.replaceWith(span);
  });
};

// Jira issue macros become a link with the issue key as text, followed by
// the summary when the macro rendered one
const replaceJiraMacros = (root, pageUrl) => {
  const document = root.ownerDocument;
  const origin = new URL(pageUrl).origin;
  each(root, '.jira-issue, [data-macro-name="jira"][data-jira-key]', (macro) => {
    const keyLink = macro.querySelector("a.jira-issue-key") || macro.querySelector("a[href]");
    const key = macro.getAttribute("data-jira-key") || text(keyLink).match(/[A-Z][A-Z0-9_]+-\d+/)?.[0] || text(keyLink);
    if (!key) {
      macro.remove();
      return;
    }
    const link = document.createElement("a");
    link.setAttribute("href", keyLink?.getAttribute("href") || `${origin}/browse/${encodeURIComponent(key)}`);
    link.textContent = key;
    const summary = text(macro.querySelector(".summary"));
    const fragment = document.createDocumentFragment();
    fragment.appendChild(link);
    if (summary) {
      fragment.appendChild(document.createTextNode(` ${summary}`));
    }
    macro.replaceWith(fragment);
  });
};

// Emoticons become text: the Unicode fallback when Cloud provides one, else
// the alt text such as "(tick)", else nothing. They are never fetched.
const replaceEmoticons = (root) => {
  const document = root.ownerDocument;
  each(root, "img.emoticon, img[data-emoticon-name], img[data-emoji-id]", (img) => {
    const fallback = (img.getAttribute("data-emoji-fallback") || "").trim();
    const value = fallback && !/^:[\w+-]+:$/.test(fallback) ? fallback : (img.getAttribute("alt") || "").trim();
    if (value) {
      img.replaceWith(document.createTextNode(value));
    } else {
      img.remove();
    }
  });
};

// Attachment images carry the full-size URL in data-image-src; src may be a
// thumbnail or missing. data-base-url is the site's /wiki base for a
// data-image-src that is relative to it. The old src stays as a fallback for
// the inliner.
const resolveAttachmentImages = (root, pageUrl) => {
  for (const img of Array.from(root.querySelectorAll("img[data-image-src]"))) {
    const raw = img.getAttribute("data-image-src").trim();
    if (!raw) {
      continue;
    }
    const baseUrl = img.getAttribute("data-base-url");
    const base = raw.startsWith("/") || !baseUrl ? pageUrl : `${baseUrl.replace(/\/+$/, "")}/`;
    const full = resolveUrl(raw, base);
    const current = img.getAttribute("src");
    if (current && current.trim()) {
      const resolved = resolveUrl(current.trim(), pageUrl);
      if (resolved !== full) {
        img.setAttribute("data-fallback-src", resolved);
      }
    }
    img.setAttribute("src", full);
    img.removeAttribute("srcset");
  }
};

export const cleanConfluenceBody = (bodyElement, pageUrl) => {
  const clone = bodyElement.cloneNode(true);

  // Code first: its wrapper shares the panel classes with the panel macro
  replaceCodeMacros(clone);
  for (const node of Array.from(clone.querySelectorAll(NOISE_SELECTORS.join(",")))) {
    node.remove();
  }
  replaceInfoMacros(clone);
  replaceExpandMacros(clone);
  replaceStatusMacros(clone);
  replaceJiraMacros(clone, pageUrl);
  replaceEmoticons(clone);
  each(clone, LAYOUT_WRAPPERS.join(","), unwrap);
  resolveAttachmentImages(clone, pageUrl);
  absolutise(clone, pageUrl);

  return clone;
};
