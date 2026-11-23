import { useEffect } from "react";

// Adds a GitHub style copy button to every code block in the reader. After a
// segment is in the DOM, each pre becomes
//
//   <div class="code-block">
//     <pre>...</pre>
//     <button class="code-copy-button" aria-label="Copy code">copy icon</button>
//     <span class="code-copy-status" aria-live="polite"></span>
//   </div>
//
// The button sits in a wrapper rather than inside the pre so it stays at the
// top right when a long line scrolls the pre sideways. Mermaid blocks are
// left alone: useMermaidDiagrams replaces them with a figure and keeps the
// source in details.mermaid-source, which needs no copy button either.

const PRE_SELECTOR = ".article-segment-content pre";
const SKIP_SELECTOR = "figure.mermaid-diagram, details.mermaid-source";
const COPIED_MS = 2000;
const COPY_LABEL = "Copy code";
const COPIED_LABEL = "Copied";

// GitHub's octicons (copy-16 and check-16), MIT licence, as used on github.com
const COPY_ICON =
  '<svg class="code-copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>' +
  '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>' +
  "</svg>";
const CHECK_ICON =
  '<svg class="code-copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>' +
  "</svg>";

const isMermaidBlock = (pre) =>
  Boolean(pre.closest(SKIP_SELECTOR) || pre.querySelector(":scope > code.language-mermaid"));

// For pages served without a secure context, where navigator.clipboard is
// missing
const copyWithSelection = (text) => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("copy command failed");
  }
};

const writeClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  copyWithSelection(text);
};

const setButtonState = (button, status, copied) => {
  const label = copied ? COPIED_LABEL : COPY_LABEL;
  button.innerHTML = copied ? CHECK_ICON : COPY_ICON;
  button.classList.toggle("is-copied", copied);
  button.setAttribute("aria-label", label);
  button.title = label;
  status.textContent = copied ? COPIED_LABEL : "";
};

const decoratePre = (pre) => {
  const document = pre.ownerDocument;
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy-button";

  const status = document.createElement("span");
  status.className = "code-copy-status";
  status.setAttribute("aria-live", "polite");

  setButtonState(button, status, false);

  let resetTimer = null;
  button.addEventListener("click", async () => {
    try {
      await writeClipboard(pre.textContent.replace(/\n$/, ""));
    } catch (error) {
      console.debug("Copy code failed", error?.message || error);
      return;
    }
    setButtonState(button, status, true);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      if (button.isConnected) {
        setButtonState(button, status, false);
      }
    }, COPIED_MS);
  });

  pre.before(wrapper);
  wrapper.append(pre, button, status);
};

const decorateCodeBlocks = (container) => {
  for (const pre of container.querySelectorAll(PRE_SELECTOR)) {
    if (pre.parentElement?.classList.contains("code-block") || isMermaidBlock(pre)) {
      continue;
    }
    decoratePre(pre);
  }
};

/**
 * Adds a copy button to each code block inside containerRef every time the
 * segment changes. `segmentKey` is any value that changes with the rendered
 * segment.
 */
export const useCodeCopyButtons = (containerRef, segmentKey) => {
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      decorateCodeBlocks(container);
    }
  }, [containerRef, segmentKey]);
};
