import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  // Measured height of the always-visible chrome (drag handle + header).
  // Subtracted from the sheet's on-screen portion to size the scrollable
  // body so its scrollbar engages whenever content overflows whatever's
  // currently visible — collapsed, middle, or expanded.
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromePx, setChromePx] = useState(0);

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

  // The scrollable body's max-height tracks what's actually on screen.
  // While dragging, follow the drag offset so the scroll area grows or
  // shrinks live with the user's finger; at rest it falls back to the
  // current snap. The chrome (handle + header) sits at the top of the
  // sheet so we subtract its measured height to leave room for it.
  const visibleSheetPx = sheetPx() - translateY;
  const bodyMaxPx = Math.max(0, visibleSheetPx - chromePx);

  useLayoutEffect(() => {
    if (!chromeRef.current) return;
    const measure = () => {
      if (chromeRef.current) setChromePx(chromeRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(chromeRef.current);
    return () => ro.disconnect();
  }, []);

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
  // floating UI elements anchored to the map (LayerSheetTrigger,
  // MapLegends) can sit just above the sheet without polling — pure
  // CSS read on their side.
  //
  // CRITICAL: only set the variable on mobile. The component is
  // `md:hidden` (display:none on desktop) but its effects still run,
  // and an unconditional set leaked the mobile sheet's height onto
  // desktop — pushing the legend pill 50 vh up the screen even though
  // the sheet was invisible. Subscribe to the matchMedia change so
  // resizes between mobile/desktop converge on the right value.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const apply = () => {
      if (!mq.matches) {
        document.documentElement.style.removeProperty("--mobile-sheet-vh");
        return;
      }
      const vh = getVh();
      const visibleVh = ((sheetPx() - translateY) / vh) * 100;
      document.documentElement.style.setProperty(
        "--mobile-sheet-vh",
        visibleVh.toFixed(2),
      );
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
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
      <div ref={chromeRef} className="flex-shrink-0">
        {/* Drag handle — full-width hit target so it's easy to grab on
            touch devices. `touch-action: none` stops the page from
            stealing the gesture as a scroll. */}
        <div
          className="flex cursor-grab touch-none select-none justify-center py-2 active:cursor-grabbing"
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
        {header}
      </div>
      {/* Body height tracks the on-screen portion of the sheet so
          overflow-y-auto engages whenever content runs past what's
          actually visible — at the collapsed snap that's just below
          the title row; at expanded it's the full sheet. Avoids the
          old behaviour where a 90vh-tall flex body never scrolled
          because typical content fit inside it even when most of it
          was off-screen. */}
      <div
        className="min-h-0 overflow-y-auto"
        style={{
          maxHeight: `${bodyMaxPx}px`,
          transition: dragging ? "none" : "max-height 250ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
