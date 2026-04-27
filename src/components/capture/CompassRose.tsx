import { useCallback, useEffect, useRef, useState } from "react";

interface CompassRoseProps {
  value: number | null;
  onChange: (heading: number | null) => void;
  /** If true, show skip button instead of a clear button */
  skippable?: boolean;
}

/** Compute bearing (0..360) from center to pointer in degrees clockwise from north. */
function bearingFromCenter(cx: number, cy: number, px: number, py: number): number {
  const dx = px - cx;
  const dy = py - cy;
  // atan2 gives angle from +x axis, CCW. We want CW from +y (north).
  const rad = Math.atan2(dx, -dy);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

export function CompassRose({ value, onChange, skippable = true }: CompassRoseProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFromPointer = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const bearing = bearingFromCenter(cx, cy, e.clientX, e.clientY);
      onChange(Math.round(bearing));
    },
    [onChange],
  );

  // Track global pointer while dragging
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => handleFromPointer(e);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, handleFromPointer]);

  const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    setDragging(true);
    handleFromPointer(e);
  };

  const onKeyDown: React.KeyboardEventHandler<SVGSVGElement> = (e) => {
    if (value == null) return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      onChange((value + step) % 360);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      onChange((value - step + 360) % 360);
      e.preventDefault();
    }
  };

  const heading = value ?? 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        className="aspect-square w-full max-w-[14rem] touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Heading"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={value ?? undefined}
      >
        {/* Outer ring */}
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="rgb(2 132 199 / 0.04)"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1"
        />
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeWidth="1"
        />

        {/* Tick marks every 15° */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const isCardinal = i % 6 === 0;
          const r1 = isCardinal ? 72 : 82;
          const r2 = 90;
          const x1 = 100 + Math.sin(a) * r1;
          const y1 = 100 - Math.cos(a) * r1;
          const x2 = 100 + Math.sin(a) * r2;
          const y2 = 100 - Math.cos(a) * r2;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={isCardinal ? 0.5 : 0.2}
              strokeWidth={isCardinal ? 1.5 : 1}
            />
          );
        })}

        {/* Cardinal labels */}
        <text x="100" y="22" textAnchor="middle" className="fill-current text-[10px] font-semibold">N</text>
        <text x="184" y="104" textAnchor="middle" className="fill-current text-[10px] font-semibold opacity-60">E</text>
        <text x="100" y="188" textAnchor="middle" className="fill-current text-[10px] font-semibold opacity-60">S</text>
        <text x="16" y="104" textAnchor="middle" className="fill-current text-[10px] font-semibold opacity-60">W</text>

        {/* Heading arrow */}
        {value != null && (
          <g transform={`rotate(${heading} 100 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="22"
              stroke="rgb(14 165 233)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon
              points="100,14 93,30 107,30"
              fill="rgb(14 165 233)"
            />
          </g>
        )}

        {/* Center dot */}
        <circle cx="100" cy="100" r="5" fill="rgb(14 165 233)" />
      </svg>

      <div className="flex items-center gap-3 text-sm">
        <div className="rounded-lg bg-surface px-3 py-1 font-mono text-foreground">
          {value != null ? `${Math.round(value)}°` : "—"}
        </div>
        {skippable ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Skip heading
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
