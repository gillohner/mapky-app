import { useState } from "react";
import {
  Bike,
  TrainFront,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Bitcoin,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";

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
  defaultExpanded = true,
}: {
  icon: React.ReactNode;
  title: string;
  items: LegendItem[];
  /** Optional external "Full legend" link. Omit for in-app legends
   *  where every visible symbol is already documented in the card. */
  footerHref?: string;
  /** Default false for the Mapky data card (most users learn it by
   *  seeing it once); default true for overlay-specific legends where
   *  the user explicitly turned the overlay on and wants the key. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 text-[11px] text-foreground"
              >
                <span className="flex h-4 w-7 items-center justify-center">
                  {item.sample}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </li>
            ))}
          </ul>
          {footerHref && (
            <a
              href={footerHref}
              target="_blank"
              rel="noopener"
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted hover:text-foreground"
            >
              Full legend
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mapky data legend samples ──────────────────────────────────────

const PLACE_ACCENT = "#0d9488"; // teal-600 — matches `--raw-accent`
const PLACE_MUTED = "#475569"; // slate-600 — non-rated places
const BTC_ORANGE = "#f7931a";
const SELECTED_RED = "#dc2626"; // red-600 — selected place pin
const CAPTURE_BLUE = "#0284c7"; // sky-600 — matches CaptureMarkersLayer light theme
const CLUSTER_BG = "#0d9488";

/** Tiny teardrop balloon sample — same SVG path PlaceBalloon uses, at
 *  a fraction of the size so it fits a 28×16 legend slot. */
function balloonSample({
  body,
  withBtcBadge = false,
  withRatingChip = false,
}: {
  body: string;
  withBtcBadge?: boolean;
  withRatingChip?: boolean;
}) {
  return (
    <svg
      width="22"
      height="16"
      viewBox="-2 -4 22 22"
      aria-hidden
      style={{ overflow: "visible" }}
    >
      {withRatingChip && (
        <g transform="translate(8, -4)">
          <rect
            x="-3"
            y="0"
            width="6"
            height="3"
            rx="1.5"
            fill="#fbbf24"
          />
        </g>
      )}
      <path
        d="M9 1 C5 1 1 5 1 9 C1 14 9 19 9 19 C9 19 17 14 17 9 C17 5 13 1 9 1 Z"
        fill={body}
        stroke="white"
        strokeWidth="1.5"
      />
      {withBtcBadge && (
        <circle cx="14" cy="4" r="2.5" fill={BTC_ORANGE} stroke="white" strokeWidth="0.6" />
      )}
    </svg>
  );
}

function dotSample({ color, stroke }: { color: string; stroke?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.5"
        fill={color}
        stroke={stroke ?? "white"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function clusterSample() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
      <circle cx="11" cy="8" r="6.5" fill={CLUSTER_BG} stroke="white" strokeWidth="1.5" />
      <text
        x="11"
        y="10.5"
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill="white"
      >
        12
      </text>
    </svg>
  );
}

/**
 * Stacked legend column for active overlays/basemaps. Cards appear
 * on the bottom-LEFT of the map (overlay-tile legends — cycling,
 * rail/metro) only when their layer is actually on. The Mapky-data
 * legend lives on the bottom-RIGHT, in its own column, so the user
 * can cross-reference what's drawn on the map without obscuring the
 * tile legends.
 *
 * Cycling is now a basemap (read from map-store); rail/metro and
 * Mapky data layers come from ui-store.
 */
export function MapLegends() {
  const cycling = useMapStore((s) => s.basemap === "cycling");
  const metro = useUiStore((s) => s.metroOverlayVisible);

  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const capturesLayerVisible = useUiStore((s) => s.capturesLayerVisible);
  const btcOverlayVisible = useUiStore((s) => s.btcOverlayVisible);
  const selectedFeature = useUiStore((s) => s.selectedFeature);

  // Mapky-data items, conditioned on each layer's visibility so the
  // card mirrors what's actually drawn. Order: balloon variants first,
  // then cluster, then non-place markers (BTC overlay, captures), then
  // the per-interaction selected pin.
  const mapkyItems: LegendItem[] = [];
  if (placesLayerVisible) {
    mapkyItems.push(
      {
        label: "Mapky-rated place",
        sample: balloonSample({ body: PLACE_ACCENT, withRatingChip: true }),
      },
      {
        label: "OSM place (no Mapky data yet)",
        sample: balloonSample({ body: PLACE_MUTED }),
      },
      {
        label: "Bitcoin-accepting place",
        sample: balloonSample({ body: PLACE_ACCENT, withBtcBadge: true }),
      },
      {
        label: "Place cluster (low zoom)",
        sample: clusterSample(),
      },
    );
  }
  if (btcOverlayVisible) {
    mapkyItems.push({
      label: "Bitcoin POI (BTCMap overlay)",
      sample: dotSample({ color: BTC_ORANGE, stroke: "#cc7700" }),
    });
  }
  if (capturesLayerVisible) {
    mapkyItems.push({
      label: "Capture (photo / panorama)",
      sample: dotSample({ color: CAPTURE_BLUE }),
    });
  }
  if (selectedFeature) {
    mapkyItems.push({
      label: "Selected place",
      sample: balloonSample({ body: SELECTED_RED }),
    });
  }

  if (!cycling && !metro && mapkyItems.length === 0) return null;

  return (
    <>
      {/* Bottom-LEFT — overlay tile legends (cycling, rail/metro). */}
      {(cycling || metro) && (
        <div
          className="pointer-events-none absolute bottom-20 left-14 z-20 flex max-w-[16rem] flex-col gap-2 sm:left-16"
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
      )}

      {/* Bottom-RIGHT — Mapky data legend. Defaults collapsed since
          most users learn the symbols by seeing them once; the dot
          stays available for newcomers and shared-link viewers. */}
      {mapkyItems.length > 0 && (
        <div
          className="pointer-events-none absolute bottom-20 right-3 z-20 flex max-w-[16rem] flex-col gap-2"
          style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
        >
          <LegendCard
            icon={<MapkyLegendIcon btc={btcOverlayVisible} />}
            title="Map legend"
            items={mapkyItems}
            defaultExpanded={false}
          />
        </div>
      )}
    </>
  );
}

/** Header icon for the Mapky data legend card. Picks the most
 *  visually-distinctive on-screen layer so the collapsed card hints
 *  at its content. */
function MapkyLegendIcon({ btc }: { btc: boolean }) {
  if (btc) return <Bitcoin className="h-3.5 w-3.5" />;
  return <MapPin className="h-3.5 w-3.5" />;
}
