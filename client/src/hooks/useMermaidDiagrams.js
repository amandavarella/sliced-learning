import { useEffect } from "react";

// Draws Mermaid diagrams in the reader. Captured pages carry each diagram as
// <pre><code class="language-mermaid">source</code></pre> (the GitHub page
// renders it in a cross-origin iframe the capture cannot read). After a
// segment is in the DOM, each block becomes
//
//   <figure class="mermaid-diagram"><svg>...</svg></figure>
//   <details class="mermaid-source"><summary>Diagram source</summary><pre>source</pre></details>
//
// The SVG lives only in the reader DOM; stored trainings keep the source.
// The mermaid package is loaded with a dynamic import the first time a
// segment has a diagram, so it stays out of the main bundle.

const BLOCK_SELECTOR = ".article-segment-content pre > code.language-mermaid";
const FIGURE_SELECTOR = ".article-segment-content figure.mermaid-diagram";
const DARK_QUERY = "(prefers-color-scheme: dark)";

let mermaidPromise = null;
let initializedTheme = null;
let renderQueue = Promise.resolve();
let renderCount = 0;

// The source of every figure drawn here, for redrawing on a theme change
const figureSources = new WeakMap();
// Code blocks already being drawn (or that failed), so no block is drawn twice
const claimedBlocks = new WeakSet();

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidPromise;
};

export const effectiveMermaidTheme = () => {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") {
    return "dark";
  }
  if (!theme || theme === "system") {
    return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "default";
  }
  return "default";
};

// Mermaid keeps one global config, so renders run one at a time and each
// sets the theme it needs before drawing
const renderSvg = (source, theme) => {
  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    if (initializedTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme,
        suppressErrorRendering: true,
        logLevel: "fatal",
      });
      initializedTheme = theme;
    }
    renderCount += 1;
    const { svg } = await mermaid.render(`mermaid-diagram-${renderCount}`, source);
    return svg;
  });
  renderQueue = task.catch(() => {});
  return task;
};

const buildSourceDisclosure = (document, source) => {
  const details = document.createElement("details");
  details.className = "mermaid-source";
  const summary = document.createElement("summary");
  summary.textContent = "Diagram source";
  const pre = document.createElement("pre");
  pre.textContent = source;
  details.append(summary, pre);
  return details;
};

const drawBlock = async (code, theme) => {
  const pre = code.parentElement;
  const source = code.textContent;
  const svg = await renderSvg(source, theme);
  if (!pre.isConnected) {
    return;
  }
  const document = pre.ownerDocument;
  const figure = document.createElement("figure");
  figure.className = "mermaid-diagram";
  figure.dataset.mermaidTheme = theme;
  figure.innerHTML = svg;
  figureSources.set(figure, source);
  // The "Diagram rendered on GitHub" link, when present, stays where it is,
  // after the figure and its source
  pre.replaceWith(figure, buildSourceDisclosure(document, source));
};

const redrawFigure = async (figure, theme) => {
  const source = figureSources.get(figure);
  if (source === undefined) {
    return;
  }
  // Claim the figure for this theme first so overlapping passes skip it
  figure.dataset.mermaidTheme = theme;
  const svg = await renderSvg(source, theme);
  if (figure.isConnected && figure.dataset.mermaidTheme === theme) {
    figure.innerHTML = svg;
  }
};

const drawDiagrams = async (container) => {
  const theme = effectiveMermaidTheme();
  const blocks = Array.from(container.querySelectorAll(BLOCK_SELECTOR)).filter(
    (code) => !claimedBlocks.has(code),
  );
  const stale = Array.from(container.querySelectorAll(FIGURE_SELECTOR)).filter(
    (figure) => figure.dataset.mermaidTheme !== theme,
  );
  if (!blocks.length && !stale.length) {
    return;
  }
  blocks.forEach((code) => claimedBlocks.add(code));

  const results = await Promise.allSettled([
    ...blocks.map((code) => drawBlock(code, theme)),
    ...stale.map((figure) => redrawFigure(figure, theme)),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    // A block Mermaid cannot draw keeps its source as a code block
    console.debug(
      `Mermaid: ${failures.length} diagram(s) left as source`,
      failures[0].reason?.message || failures[0].reason,
    );
  }
  // The theme changed while these were drawing: bring the figures in line
  if (effectiveMermaidTheme() !== theme) {
    await drawDiagrams(container);
  }
};

/**
 * Draws the Mermaid code blocks inside containerRef each time the segment
 * changes, and redraws them when the reader theme or the OS colour scheme
 * changes. `segmentKey` is any value that changes with the rendered segment.
 */
export const useMermaidDiagrams = (containerRef, segmentKey) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const run = () => {
      drawDiagrams(container);
    };
    run();

    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia?.(DARK_QUERY);
    media?.addEventListener?.("change", run);

    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", run);
    };
  }, [containerRef, segmentKey]);
};
