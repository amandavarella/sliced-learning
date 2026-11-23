import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export const MIN_CARD_WIDTH = 360;
export const MIN_VIEWPORT_WIDTH = 720;
export const MARGIN_STEP = 16;

const VIEWPORT_QUERY = `(min-width: ${MIN_VIEWPORT_WIDTH}px)`;

const matchesViewport = () =>
  typeof window === "undefined" || !window.matchMedia
    ? true
    : window.matchMedia(VIEWPORT_QUERY).matches;

// Width of the content area between its padding, which is the space the
// margins are measured in
const innerWidth = (node) => {
  const style = window.getComputedStyle(node);
  return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
};

/**
 * Keep both margins at 0 or more and the card at MIN_CARD_WIDTH or wider.
 * When the space shrinks, both margins give way in proportion.
 */
export const clampMargins = (margins, available) => {
  let left = Math.max(0, Math.round(margins.left));
  let right = Math.max(0, Math.round(margins.right));
  if (!Number.isFinite(available) || available <= 0) {
    return { left, right };
  }
  const maxTotal = Math.max(0, Math.floor(available - MIN_CARD_WIDTH));
  const total = left + right;
  if (total > maxTotal) {
    left = total > 0 ? Math.floor((left * maxTotal) / total) : 0;
    right = maxTotal - left;
  }
  return { left, right };
};

/**
 * Reading margins: measures the content area, clamps the stored margins to
 * it, and exposes what the drag handles need to change them.
 *
 * `margins` is the stored preference ({ left, right } or null). The stored
 * value is left alone on resize; only the applied value is clamped, so the
 * card goes back to the chosen width when the window grows again.
 */
export const useReadingMargins = (margins, setMargins) => {
  const [contentNode, setContentNode] = useState(null);
  const [available, setAvailable] = useState(0);
  const [enabled, setEnabled] = useState(matchesViewport);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined;
    }
    const query = window.matchMedia(VIEWPORT_QUERY);
    const handleChange = () => setEnabled(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // Re-measure whenever the content area changes size: window resizes, the
  // sidebar moving above the content on narrow screens, and so on
  useLayoutEffect(() => {
    if (!contentNode) {
      return undefined;
    }
    const measure = () => setAvailable(innerWidth(contentNode));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [contentNode]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    document.body.classList.add("is-resizing-margins");
    return () => document.body.classList.remove("is-resizing-margins");
  }, [dragging]);

  const applied = enabled && margins ? clampMargins(margins, available) : null;

  // Margins as the card sits right now, also when no margins are set yet and
  // the card is in its default centred position
  const measureCurrent = useCallback(
    (cardNode) => {
      if (applied) {
        return applied;
      }
      if (!contentNode || !cardNode) {
        return { left: 0, right: 0 };
      }
      const style = window.getComputedStyle(contentNode);
      const content = contentNode.getBoundingClientRect();
      const card = cardNode.getBoundingClientRect();
      const innerLeft = content.left + contentNode.clientLeft + parseFloat(style.paddingLeft);
      const innerRight = innerLeft + innerWidth(contentNode);
      return clampMargins(
        { left: card.left - innerLeft, right: innerRight - card.right },
        available,
      );
    },
    [applied, available, contentNode],
  );

  const update = useCallback(
    (next) => setMargins(clampMargins(next, available)),
    [available, setMargins],
  );

  const reset = useCallback(() => setMargins(null), [setMargins]);

  const contentProps = applied
    ? {
        className: "has-margins",
        style: {
          "--reading-margin-left": `${applied.left}px`,
          "--reading-margin-right": `${applied.right}px`,
        },
      }
    : { className: "", style: undefined };

  return {
    contentRef: setContentNode,
    contentProps,
    enabled,
    applied,
    available,
    dragging,
    setDragging,
    measureCurrent,
    update,
    reset,
  };
};
