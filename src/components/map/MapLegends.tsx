import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Bitcoin } from "lucide-react";
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
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
      {opts.outline && (
        <line
          x1="2"
          y1="4"
          x2="20"
          y2="4"
          stroke={opts.outline}
          strokeWidth={(opts.width ?? 3) + 2}
          strokeLinecap="round"
        />
      )}
      <line
        x1="2"
        y1="4"
        x2="20"
        y2="4"
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

interface LegendSection {
  /** Optional sub-header rendered as a small uppercase muted line.
   *  Omit on the first/Mapky section so the most-relevant items aren't
   *  preceded by a heading. */
  heading?: string;
  items: LegendItem[];
}

function LegendCard({
  icon,
  title,
  sections,
}: {
  icon: React.ReactNode;
  title: string;
  sections: LegendSection[];
}) {
  const [expanded, setExpanded] = useState(false);
  // Defaults collapsed — most users learn the symbols by seeing them
  // once. The pill stays available for newcomers and shared-link
  // viewers who want a key.
  return (
    <div className="pointer-events-auto rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur transition-colors hover:border-accent">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-xs font-medium text-foreground transition-colors"
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
        <div className="border-t border-border px-2.5 pb-1.5 pt-1">
          {sections.map((section, i) => (
            <div key={section.heading ?? i} className={i > 0 ? "mt-1.5" : ""}>
              {section.heading && (
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
                  {section.heading}
                </div>
              )}
              <ul className="flex flex-col">
                {section.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex h-6 items-center gap-2 text-[11px] leading-none text-foreground"
                  >
                    <span className="flex h-6 w-6 items-center justify-center">
                      {item.sample}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sample helpers ─────────────────────────────────────────────────

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";
const CAPTURE_BLUE = "#0284c7";

/** Wrap any node in a fixed-size slot, scaled to fit. The slot is
 *  20×24 px; at scale 0.4 the rated PlaceBalloon (53 px tall in real
 *  pixels, scaled to ~21 px) fits inside the row without overlapping
 *  neighboring rows. The marker is anchored to the slot's bottom —
 *  matches how it sits on its anchor on the map. */
function MarkerSlot({
  children,
  scale = 0.4,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  return (
    <span
      className="relative inline-block"
      style={{ width: 20, height: 24 }}
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
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
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
 * One unified legend card pinned next to the LayerSheetTrigger. Items
 * are conditioned on what's actually visible on the map: places,
 * captures, BTC overlay dots/clusters, the rail-overlay's tile
 * legend, the cycling-basemap's tile legend, and the per-interaction
 * selected pin.
 *
 * Earlier the cycling/rail tile legends sat in a separate column on
 * the bottom-left. They've been folded in here so the user only has
 * one legend to look at — the items appear or hide based on their
 * own layer's visibility, same as everything else.
 */
export function MapLegends() {
  const cycling = useMapStore((s) => s.basemap === "cycling");
  const metro = useUiStore((s) => s.metroOverlayVisible);

  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const capturesLayerVisible = useUiStore((s) => s.capturesLayerVisible);
  const btcOverlayVisible = useUiStore((s) => s.btcOverlayVisible);
  const selectedFeature = useUiStore((s) => s.selectedFeature);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // ─── Mapky section — places / BTC / captures / selection. ─────
  const mapkyItems: LegendItem[] = [];
  if (placesLayerVisible) {
    mapkyItems.push(
      {
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
    mapkyItems.push({
      label: "Selected place",
      sample: (
        <svg width="14" height="16" viewBox="-2 -2 32 44" aria-hidden>
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

  // Build the section list. Mapky comes first (the user's primary
  // signal), then any active overlay-tile legends below it.
  const sections: LegendSection[] = [];
  if (mapkyItems.length > 0) sections.push({ items: mapkyItems });
  if (cycling) sections.push({ heading: "Cycling", items: CYCLING_ITEMS });
  if (metro) sections.push({ heading: "Rail & metro", items: RAILWAY_ITEMS });

  if (sections.length === 0) return null;

  return (
    <div
      className={`pointer-events-none fixed z-20 flex max-w-[16rem] flex-col gap-2 transition-[left] duration-300 ${
        sidebarOpen
          ? "left-16 md:left-[30.75rem]"
          : "left-16 md:left-[6.75rem]"
      }`}
      style={{
        bottom:
          "calc(var(--mobile-sheet-vh, 0) * 1vh + 0.25rem + env(safe-area-inset-bottom))",
      }}
    >
      <LegendCard
        icon={<MapkyLegendIcon btc={btcOverlayVisible} />}
        title="Map legend"
        sections={sections}
      />
    </div>
  );
}

/** Header icon for the legend card. Picks the most visually-distinctive
 *  on-screen layer so the collapsed pill hints at what's inside. */
function MapkyLegendIcon({ btc }: { btc: boolean }) {
  if (btc) return <Bitcoin className="h-3.5 w-3.5" />;
  return <MapPin className="h-3.5 w-3.5" />;
}
