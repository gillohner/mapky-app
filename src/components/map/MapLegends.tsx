import { useState } from "react";
import {
  Bike,
  TrainFront,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

interface LegendItem {
  label: string;
  /** Inline SVG sample so dashed/solid/colored variants render exactly
   *  the way the underlying overlay tiles do. */
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

const CYCLING_ITEMS: LegendItem[] = [
  {
    label: "Dedicated cycle path",
    sample: lineSample({ color: "#0011ff", outline: "#ffffff" }),
  },
  { label: "On-road cycle lane", sample: lineSample({ color: "#3b82f6" }) },
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

const RAILWAY_ITEMS: LegendItem[] = [
  {
    label: "Heavy rail / main line",
    sample: lineSample({ color: "#cd0000", width: 3.5 }),
  },
  {
    label: "Branch / regional line",
    sample: lineSample({ color: "#fc6e22", width: 3 }),
  },
  {
    label: "Subway / metro",
    sample: lineSample({ color: "#0033ff", width: 3 }),
  },
  { label: "Light rail", sample: lineSample({ color: "#3a87ff", width: 3 }) },
  { label: "Tram", sample: lineSample({ color: "#666666", width: 2.5 }) },
  {
    label: "Narrow gauge",
    sample: lineSample({ color: "#7c2d12", width: 2.5 }),
  },
  {
    label: "Construction / disused",
    sample: lineSample({ color: "#888888", dashed: true }),
  },
];

function LegendCard({
  icon,
  title,
  items,
  footerHref,
}: {
  icon: React.ReactNode;
  title: string;
  items: LegendItem[];
  footerHref: string;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="pointer-events-auto rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface"
        aria-expanded={expanded}
      >
        <span className="text-accent" aria-hidden>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted" aria-hidden />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 pb-2 pt-1.5">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
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
            href={footerHref}
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

/**
 * Stacked legend column for active overlays. Cards appear in the
 * bottom-left of the map and only when their overlay is actually on.
 * Multiple cards stack vertically so users can keep both rail and
 * cycling overlays enabled without UI collisions.
 */
export function MapLegends() {
  const cycling = useUiStore((s) => s.cyclingOverlayVisible);
  const metro = useUiStore((s) => s.metroOverlayVisible);

  if (!cycling && !metro) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[16rem] flex-col gap-2 md:left-16"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      {cycling && (
        <LegendCard
          icon={<Bike className="h-3.5 w-3.5" />}
          title="Cycling legend"
          items={CYCLING_ITEMS}
          footerHref="https://www.cyclosm.org/legend.html"
        />
      )}
      {metro && (
        <LegendCard
          icon={<TrainFront className="h-3.5 w-3.5" />}
          title="Rail & metro legend"
          items={RAILWAY_ITEMS}
          footerHref="https://wiki.openstreetmap.org/wiki/OpenRailwayMap/Manual"
        />
      )}
    </div>
  );
}
