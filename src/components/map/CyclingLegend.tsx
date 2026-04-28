import { useState } from "react";
import { Bike, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

interface LegendItem {
  label: string;
  /** Inline-styled SVG sample so dashed/solid/colored variants render
   *  exactly as on the actual CyclOSM tiles. */
  sample: React.ReactNode;
}

function lineSample(opts: {
  color: string;
  width?: number;
  dashed?: boolean;
  outline?: string;
}) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      {opts.outline && (
        <line
          x1="2"
          y1="5"
          x2="26"
          y2="5"
          stroke={opts.outline}
          strokeWidth={(opts.width ?? 3) + 2}
          strokeLinecap="round"
        />
      )}
      <line
        x1="2"
        y1="5"
        x2="26"
        y2="5"
        stroke={opts.color}
        strokeWidth={opts.width ?? 3}
        strokeLinecap="round"
        strokeDasharray={opts.dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

const ITEMS: LegendItem[] = [
  {
    label: "Dedicated cycle path",
    sample: lineSample({ color: "#0011ff", outline: "#ffffff" }),
  },
  {
    label: "On-road cycle lane",
    sample: lineSample({ color: "#3b82f6" }),
  },
  {
    label: "Shared with pedestrians",
    sample: lineSample({ color: "#0011ff", dashed: true }),
  },
  {
    label: "Bike-friendly road",
    sample: lineSample({ color: "#7dd3fc", width: 4 }),
  },
  {
    label: "MTB / trail",
    sample: lineSample({ color: "#b45309", dashed: true }),
  },
  {
    label: "Forbidden for cyclists",
    sample: lineSample({ color: "#dc2626" }),
  },
];

/**
 * Floating legend that appears in the bottom-left when the CyclOSM
 * overlay is active. CyclOSM's color coding is dense enough that
 * users need a key to interpret it; without this the overlay is just
 * "some blue lines."
 */
export function CyclingLegend() {
  const visible = useUiStore((s) => s.cyclingOverlayVisible);
  const [expanded, setExpanded] = useState(true);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 z-20 max-w-[16rem] rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur-sm md:left-16"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface"
        aria-expanded={expanded}
      >
        <Bike className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span className="flex-1">Cycling legend</span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted" aria-hidden />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 pb-2 pt-1.5">
          <ul className="flex flex-col gap-1">
            {ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 text-[11px] text-foreground"
              >
                <span className="flex h-3 w-7 items-center justify-center">
                  {item.sample}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </li>
            ))}
          </ul>
          <a
            href="https://www.cyclosm.org/legend.html"
            target="_blank"
            rel="noopener"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted hover:text-foreground"
          >
            Full legend
            <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
