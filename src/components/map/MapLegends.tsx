import { Info } from "lucide-react";
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
  heading?: string;
  items: LegendItem[];
}

// ── Sample helpers ─────────────────────────────────────────────────

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";
const CAPTURE_BLUE = "#0284c7";

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
 * Map-legend card — sibling of LayerSheet. Both share the same expand-
 * in-place behavior:
 *
 *   - **Collapsed**: round h-11 w-11 icon button (Info glyph). Sits
 *     just to the right of the Layers button when both are collapsed.
 *   - **Expanded**: card grows leftward to the Layers button's anchor
 *     and outward to a normal panel width — covering the Layers
 *     button's slot. The two are mutually exclusive (opening the
 *     legend auto-collapses Layers, and vice versa) so they share
 *     this single bottom-left slot.
 *
 * Items are conditioned on what's actually visible on the map: places,
 * captures, BTC overlay, the rail-overlay's tile legend, the cycling-
 * basemap's tile legend, and the per-interaction selected pin.
 */
export function MapLegends() {
  const cycling = useMapStore((s) => s.basemap === "cycling");
  const metro = useUiStore((s) => s.metroOverlayVisible);

  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const capturesLayerVisible = useUiStore((s) => s.capturesLayerVisible);
  const btcOverlayVisible = useUiStore((s) => s.btcOverlayVisible);
  const selectedFeature = useUiStore((s) => s.selectedFeature);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const expanded = useUiStore((s) => s.legendExpanded);
  const setExpanded = useUiStore((s) => s.setLegendExpanded);

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

  const sections: LegendSection[] = [];
  if (mapkyItems.length > 0) sections.push({ items: mapkyItems });
  if (cycling) sections.push({ heading: "Cycling", items: CYCLING_ITEMS });
  if (metro) sections.push({ heading: "Rail & metro", items: RAILWAY_ITEMS });

  if (sections.length === 0) return null;

  // Position math: collapsed sits next to the Layers button (left-16
  // mobile / md:left-[6.75rem] desktop). Expanded shifts to the same
  // anchor as the Layers button (left-3 / md:left-14) so the expanded
  // card visually covers the (now collapsed via mutual exclusion)
  // Layers slot — both panels share this same bottom-left slot when
  // either is open.
  const left = expanded
    ? sidebarOpen
      ? "left-3 md:left-[440px]"
      : "left-3 md:left-14"
    : sidebarOpen
      ? "left-16 md:left-[30.75rem]"
      : "left-16 md:left-[6.75rem]";
  const width = expanded ? "w-[calc(100%-1.5rem)] sm:w-80" : "w-11";

  return (
    <div
      className={`pointer-events-auto fixed z-30 flex max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur transition-[left,width] duration-300 hover:border-accent ${left} ${width}`}
      style={{
        bottom:
          "calc(var(--mobile-sheet-vh, 0) * 1vh + 0.25rem + env(safe-area-inset-bottom))",
        maxHeight: expanded ? "calc(100dvh - 6rem)" : undefined,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? "Close map legend" : "Open map legend"}
        aria-expanded={expanded}
        className="flex h-11 w-full flex-shrink-0 items-center justify-center text-foreground transition-colors"
      >
        <Info className="h-5 w-5 text-accent" />
      </button>
      {expanded && (
        <div className="flex flex-1 flex-col overflow-hidden border-t border-border px-2.5 pb-1.5 pt-1">
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
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
        </div>
      )}
    </div>
  );
}
