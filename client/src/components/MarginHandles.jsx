import { useRef } from "react";
import { MARGIN_STEP, MIN_CARD_WIDTH } from "../hooks/useReadingMargins.js";

const LABELS = {
  left: "Left reading margin",
  right: "Right reading margin",
};

// Move one edge to `value`, keeping the other edge where it is and the card
// at least MIN_CARD_WIDTH wide
const moveEdge = (current, side, value, available) => {
  const other = side === "left" ? current.right : current.left;
  const max = Math.max(0, Math.floor(available - MIN_CARD_WIDTH - other));
  const next = Math.min(max, Math.max(0, Math.round(value)));
  return side === "left" ? { left: next, right: current.right } : { left: current.left, right: next };
};

const MarginHandle = ({ side, margins }) => {
  const dragRef = useRef(null);
  const { applied, available, measureCurrent, update, reset, setDragging } = margins;

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      start: measureCurrent(event.currentTarget.parentElement),
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    if (!drag.moved && dx === 0) {
      return;
    }
    drag.moved = true;
    // Dragging right grows the left margin and shrinks the right one
    const value = side === "left" ? drag.start.left + dx : drag.start.right - dx;
    update(moveEdge(drag.start, side, value, available));
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    // Stop the reader's own arrow-key segment navigation
    event.stopPropagation();
    const current = measureCurrent(event.currentTarget.parentElement);
    const delta = event.key === "ArrowRight" ? MARGIN_STEP : -MARGIN_STEP;
    // The left edge moves with the arrow; the right margin grows as its edge moves left
    const value = side === "left" ? current.left + delta : current.right - delta;
    update(moveEdge(current, side, value, available));
  };

  const value = applied ? applied[side] : undefined;

  return (
    <div
      className={`margin-handle is-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={LABELS[side]}
      aria-valuenow={value}
      aria-valuemin={value === undefined ? undefined : 0}
      tabIndex={0}
      title="Drag to set the reading width. Double-click to reset."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={reset}
      onKeyDown={handleKeyDown}
    >
      <span className="margin-handle-grip" aria-hidden="true" />
    </div>
  );
};

/**
 * Drag handles on both sides of the reading card. Render them inside the
 * card; they sit just outside its edges.
 */
const MarginHandles = ({ margins }) => {
  if (!margins.enabled) {
    return null;
  }
  return (
    <>
      <MarginHandle side="left" margins={margins} />
      <MarginHandle side="right" margins={margins} />
    </>
  );
};

export default MarginHandles;
