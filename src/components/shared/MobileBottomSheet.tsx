import { useEffect, useRef, useState } from "react";

export type SheetSnap = "collapsed" | "middle" | "expanded";

/**
 * Sheet element height (vh). Always rendered at this height; we
 * `translateY` it down to reveal only the snapped portion. Translate-
 * based animation is smoother than animating `height`, and the body
 * never has to reflow on snap changes.
 */
const SHEET_VH = 90;

/**
 * Visible portion of the sheet at each snap position (vh). Collapsed
 * shows the title row plus the first slice of body content (e.g. the
 * place name + type for a detail panel) so the peek is informative.
 * The user drags up for middle / expanded; middle is roughly half the
 * map visible — the "look at the map while picking from the list"
 * mode the unification is supposed to deliver across every panel.
 */
const VISIBLE_VH: Record<SheetSnap, number> = {
  collapsed: 22,
  middle: 50,
  expanded: 88,
};

interface Props {
  /** Snap position to use the first time the sheet mounts. */
  defaultSnap?: SheetSnap;
  /**
   * Always-visible portion (title row, tabs, toolbar). Stays inside
   * the visible peek when collapsed, so make sure the most important
   * controls live here.
   */
  header: React.ReactNode;
  /** Scrollable body — hidden when fully collapsed. */
  children: React.ReactNode;
}

/**
 * Unified mobile bottom sheet for Discover/Search/Directions panels.
 * Three snap positions (collapsed / middle / expanded) with a
 * draggable handle at the top — drag up for more content, drag down
 * to peek at the map. Uses transform-based snapping so animations
 * stay buttery and the body's scroll position doesn't reset between
 * snaps.
 *
 * Outer positioning (`bottom-0 left-12 right-0`) is owned here so all
 * three sheets sit in the same place; consumers only pass content.
 */
export function MobileBottomSheet({
  defaultSnap = "middle",
  header,
  children,
}: Props) {
  const [snap, setSnap] = useState<SheetSnap>(defaultSnap);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);

  const getVh = () =>
    typeof window === "undefined" ? 800 : window.innerHeight;
  const visiblePxFor = (s: SheetSnap) => (VISIBLE_VH[s] / 100) * getVh();
  const sheetPx = () => (SHEET_VH / 100) * getVh();

  // Translate (positive = pushed down). At rest, snap drives it; while
  // dragging, we offset by the user's finger delta.
  const baseTranslate = sheetPx() - visiblePxFor(snap);
  const translateY = Math.max(
    0,
    Math.min(sheetPx() - 60, baseTranslate + dragOffsetPx),
  );

  const startDrag = (clientY: number) => {
    dragStartRef.current = clientY;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (y: number) => {
      const start = dragStartRef.current;
      if (start === null) return;
      setDragOffsetPx(y - start);
    };
    const end = (y: number) => {
      const start = dragStartRef.current;
      if (start === null) return;
      const delta = y - start;
      const finalTranslate = baseTranslate + delta;
      const vh = getVh();
      const finalVisibleVh =
        ((sheetPx() - finalTranslate) / vh) * 100;
      const next: SheetSnap =
        finalVisibleVh < (VISIBLE_VH.collapsed + VISIBLE_VH.middle) / 2
          ? "collapsed"
          : finalVisibleVh < (VISIBLE_VH.middle + VISIBLE_VH.expanded) / 2
            ? "middle"
            : "expanded";
      setSnap(next);
      setDragOffsetPx(0);
      setDragging(false);
      dragStartRef.current = null;
    };
    const onMM = (e: MouseEvent) => move(e.clientY);
    const onMU = (e: MouseEvent) => end(e.clientY);
    const onTM = (e: TouchEvent) => {
      if (e.touches[0]) move(e.touches[0].clientY);
    };
    const onTE = (e: TouchEvent) => {
      if (e.changedTouches[0]) end(e.changedTouches[0].clientY);
    };
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
    window.addEventListener("touchmove", onTM, { passive: true });
    window.addEventListener("touchend", onTE);
    return () => {
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", onMU);
      window.removeEventListener("touchmove", onTM);
      window.removeEventListener("touchend", onTE);
    };
  }, [dragging, baseTranslate]);

  // Publish the current visible height (vh) on the document so that
  // floating UI elements anchored to the map (LayerSheetTrigger) can
  // sit just above the sheet without polling — pure CSS read on their
  // side. Cleared on unmount so the variable defaults back to 0 when
  // no sheet is open.
  useEffect(() => {
    const vh = getVh();
    const visibleVh = ((sheetPx() - translateY) / vh) * 100;
    document.documentElement.style.setProperty(
      "--mobile-sheet-vh",
      visibleVh.toFixed(2),
    );
  }, [translateY]);
  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--mobile-sheet-vh");
    };
  }, []);

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:hidden"
      style={{
        height: `${SHEET_VH}vh`,
        transform: `translateY(${translateY}px)`,
        transition: dragging ? "none" : "transform 250ms ease-out",
      }}
    >
      {/* Drag handle — full-width hit target so it's easy to grab on
          touch devices. `touch-action: none` stops the page from
          stealing the gesture as a scroll. */}
      <div
        className="flex flex-shrink-0 cursor-grab touch-none select-none justify-center py-2 active:cursor-grabbing"
        onMouseDown={(e) => {
          e.preventDefault();
          startDrag(e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) startDrag(e.touches[0].clientY);
        }}
      >
        <div className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="flex-shrink-0">{header}</div>
      {/* Body always renders. The sheet's translateY-controlled height
          clips it naturally — at the collapsed snap the user sees the
          first slice of the body (e.g. the place name + type for a
          detail panel), and the same content grows in place as they
          drag up. No duplication into a separate "peek" slot. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
