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
import { PlaceBalloon } from "./PlaceBalloon";

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
//
// The samples below render the *actual* PlaceBalloon component scaled
// down inside a fixed-size slot, so what the user sees in the legend
// is pixel-identical to what they see on the map. Earlier hand-drawn
// SVGs drifted from the real markers as the balloon design evolved;
// reusing the component keeps them in lockstep.

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";
const CAPTURE_BLUE = "#0284c7"; // matches CaptureMarkersLayer light theme

/** Wrap any node in a fixed-size slot, scaled to fit. The legend slot
 *  is 24×24 px; the marker is anchored to the bottom (matches how it
 *  sits on its anchor on the map). */
function MarkerSlot({
  children,
  scale = 0.5,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  return (
    <span
      className="relative inline-block"
      style={{ width: 24, height: 24 }}
      aria-hidden
    >
      <span
        className="absolute left-1/2 bottom-0"
        style={{
          transform: `translate(-50%, 0) scale(${scale})`,
          transformOrigin: "bottom center",
        }}
      >
        {children}
      </span>
    </span>
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
  // card mirrors what's actually drawn. Each balloon sample reuses
  // the *real* PlaceBalloon component scaled down — exactly what
  // the map renders, never a hand-drawn approximation.
  const mapkyItems: LegendItem[] = [];
  if (placesLayerVisible) {
    mapkyItems.push(
      {
        // Mapky-engaged places use the accent variant (place-btc body)
        // when accepts_bitcoin is true; the badge appears alongside.
        // Either way the body is teal/accent — that's the signal.
        label: "Place with Mapky data",
        sample: (
          <MarkerSlot>
            <PlaceBalloon variant="place-btc" rating={null} Icon={null} />
          </MarkerSlot>
        ),
      },
      {
        label: "Place with a rating",
        sample: (
          <MarkerSlot>
            <PlaceBalloon variant="place-btc" rating="4.6" Icon={null} />
          </MarkerSlot>
        ),
      },
    );
  }
  if (btcOverlayVisible) {
    mapkyItems.push({
      label: "Bitcoin POI (BTCMap overlay)",
      sample: dotSample({ color: BTC_ORANGE, stroke: BTC_ORANGE_DARK }),
    });
  }
  if (capturesLayerVisible) {
    mapkyItems.push({
      label: "Capture (photo / panorama)",
      sample: dotSample({ color: CAPTURE_BLUE }),
    });
  }
  if (selectedFeature) {
    // The selected pin uses its own teardrop SVG (mapky-place-pin in
    // SelectedPlaceMarker), tinted red. Sample it with a small inline
    // copy of the same path to stay accurate.
    mapkyItems.push({
      label: "Selected place",
      sample: (
        <svg width="20" height="22" viewBox="-2 -2 32 44" aria-hidden>
          <path
            d="M14 2 C7 2 2 7 2 14 C2 22 14 38 14 38 C14 38 26 22 26 14 C26 7 21 2 14 2 Z"
            fill="#dc2626"
            stroke="white"
            strokeWidth="2"
          />
        </svg>
      ),
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
          stays available for newcomers and shared-link viewers.
          Sits ABOVE MapLibre's NavigationControl + GeolocateControl
          stack (4 buttons ≈ 150 px) so it doesn't cover zoom / rotate /
          locate, and aligns at right-3 like the controls themselves. */}
      {mapkyItems.length > 0 && (
        <div
          className="pointer-events-none absolute right-3 z-20 flex max-w-[16rem] flex-col gap-2"
          style={{
            // 11rem ≈ 176 px — clears the four stacked maplibre controls
            // plus their 10 px bottom margin. The safe-area inset adds
            // bottom-padding on iOS where the home-indicator pushes
            // controls up too.
            bottom: "calc(11rem + env(safe-area-inset-bottom))",
          }}
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
