import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { useNominatimSearch } from "@/lib/api/hooks";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import {
  useRouteCreationStore,
  type WaypointSlot,
} from "@/stores/route-creation-store";

interface WaypointInputProps {
  index: number;
  slot: WaypointSlot;
  /** Visual A/B/1/… label drawn in the leading dot. */
  pinLabel: string;
  /** Hex color for the dot. */
  pinColor: string;
  placeholder: string;
  /** When true, show a remove button on the right (intermediate stops). */
  removable?: boolean;
}

const DEBOUNCE_MS = 300;

export function WaypointInput({
  index,
  slot,
  pinLabel,
  pinColor,
  placeholder,
  removable,
}: WaypointInputProps) {
  const setSlot = useRouteCreationStore((s) => s.setSlot);
  const clearSlot = useRouteCreationStore((s) => s.clearSlot);
  const removeSlot = useRouteCreationStore((s) => s.removeSlot);
  const pickingForSlot = useRouteCreationStore((s) => s.pickingForSlot);
  const setPickingForSlot = useRouteCreationStore((s) => s.setPickingForSlot);
  const isPicking = pickingForSlot === index;

  const userLoc = useUserLocation();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show only the typed query for searching; the slot's label is what's
  // displayed when the popover is closed.
  const { data: results, isLoading } = useNominatimSearch(open ? query : "");

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setQuery(draft.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, open]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleFocus = () => {
    setOpen(true);
    setDraft("");
    setQuery("");
  };

  const handleSelectResult = (r: NominatimSearchResult) => {
    setSlot(index, {
      kind: "place",
      id: slot.id,
      lat: r.lat,
      lon: r.lon,
      label: r.name || r.display_name.split(",")[0] || "Unnamed place",
      osmType: r.osm_type,
      osmId: r.osm_id,
    });
    setOpen(false);
  };

  const handleUseMyLocation = async () => {
    const loc = userLoc.location ?? (await userLoc.request());
    if (loc) {
      setSlot(index, {
        kind: "gps",
        id: slot.id,
        lat: loc.lat,
        lon: loc.lon,
        label: "Your location",
      });
      setOpen(false);
    }
  };

  const handlePickOnMap = () => {
    setPickingForSlot(index);
    setOpen(false);
    inputRef.current?.blur();
  };

  const displayedValue =
    slot.kind === "empty" ? "" : slot.label;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 transition-colors ${
          open || isPicking
            ? "border-accent ring-2 ring-accent/20"
            : "border-border hover:border-border/70"
        }`}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: pinColor }}
        >
          {pinLabel}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={open ? draft : displayedValue}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        {slot.kind === "gps" && !open && (
          <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex">
            <Navigation className="h-2.5 w-2.5" />
            GPS
          </span>
        )}
        {slot.kind !== "empty" && !open && (
          <button
            onClick={() => clearSlot(index)}
            className="rounded p-0.5 text-muted hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {removable && (
          <button
            onClick={() => removeSlot(index)}
            className="rounded p-0.5 text-muted hover:text-red-500"
            aria-label="Remove stop"
            title="Remove stop"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
          <button
            onClick={handleUseMyLocation}
            disabled={
              userLoc.status === "loading" || userLoc.status === "unsupported"
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-50"
          >
            {userLoc.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            ) : (
              <Crosshair className="h-4 w-4 text-emerald-500" />
            )}
            <span className="flex-1">Your location</span>
            {userLoc.status === "denied" && (
              <span className="text-[10px] text-muted">denied</span>
            )}
            {userLoc.status === "unsupported" && (
              <span className="text-[10px] text-muted">unavailable</span>
            )}
          </button>

          <button
            onClick={handlePickOnMap}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface"
          >
            <MapPin className="h-4 w-4 text-blue-500" />
            <span className="flex-1">Choose on map</span>
            <kbd className="rounded border border-border px-1 py-0.5 text-[9px] text-muted">
              click
            </kbd>
          </button>

          {query.length >= 2 && (
            <div className="my-1 h-px bg-border" aria-hidden />
          )}

          {query.length >= 2 && isLoading && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}

          {query.length >= 2 &&
            !isLoading &&
            results &&
            results.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted">No results.</p>
            )}

          {results?.slice(0, 7).map((r, ri) => (
            <button
              key={`${r.osm_type}-${r.osm_id}-${ri}`}
              onClick={() => handleSelectResult(r)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface"
            >
              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {r.name || r.display_name.split(",")[0]}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {r.display_name}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
