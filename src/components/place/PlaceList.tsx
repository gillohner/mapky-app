import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, Star, Tag as TagIcon } from "lucide-react";
import {
  useViewportPlaces,
  useNominatimSearch,
  useOsmLookup,
} from "@/lib/api/hooks";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useMapStore } from "@/stores/map-store";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverSearchInput } from "@/components/discover/SearchInput";
import type { PlaceDetails } from "@/types/mapky";
import type { NominatimSearchResult } from "@/lib/api/nominatim";

type Tab = "viewport" | "search";

/**
 * Places discover sidebar — viewport browse + Nominatim search.
 *
 * "Mine" is intentionally absent: the indexer doesn't yet expose
 * "places I've posted/captured at" as a first-class endpoint. Once it
 * does, wire it up next to the Viewport tab.
 */
export function PlaceList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("viewport");
  const [query, setQuery] = useState("");

  const bbox = useViewportBounds();
  const viewport = useViewportPlaces(tab === "viewport" ? bbox : null);
  const search = useNominatimSearch(tab === "search" ? query : "");

  const tabs: DiscoverTab[] = useMemo(
    () => [
      { id: "viewport", label: "In this area" },
      { id: "search", label: "Search" },
    ],
    [],
  );

  const close = () => navigate({ to: "/" });

  const toolbar =
    tab === "search" ? (
      <DiscoverSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search places worldwide…"
      />
    ) : undefined;

  return (
    <DiscoverSidebar
      title="Places"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
      toolbar={toolbar}
    >
      {tab === "viewport" ? (
        <ViewportPlaces query={viewport} />
      ) : (
        <SearchResults query={search} typed={query} />
      )}
    </DiscoverSidebar>
  );
}

function ViewportPlaces({
  query,
}: {
  query: ReturnType<typeof useViewportPlaces>;
}) {
  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-xs text-red-500">{(query.error as Error).message}</p>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <p className="text-xs text-muted">
        No indexed places in this area yet. Try zooming out or panning.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {query.data.map((p) => (
        <PlaceRow key={`${p.osm_type}-${p.osm_id}`} place={p} />
      ))}
    </div>
  );
}

function PlaceRow({ place }: { place: PlaceDetails }) {
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const { data: nominatim } = useOsmLookup(place.osm_type, place.osm_id, true);

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    place.osm_canonical;
  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";

  return (
    <button
      onClick={() => {
        if (map && place.lat && place.lon) {
          map.flyTo({
            center: [place.lon, place.lat],
            zoom: 17,
            duration: 800,
          });
        }
        navigate({
          to: "/place/$osmType/$osmId",
          params: { osmType: place.osm_type, osmId: String(place.osm_id) },
        });
      }}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-accent"
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{name}</p>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          {place.review_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3" />
              {place.review_count}
            </span>
          )}
          {place.tag_count > 0 && (
            <span className="flex items-center gap-0.5">
              <TagIcon className="h-3 w-3" />
              {place.tag_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SearchResults({
  query,
  typed,
}: {
  query: ReturnType<typeof useNominatimSearch>;
  typed: string;
}) {
  if (typed.length < 2) {
    return (
      <p className="text-xs text-muted">
        Type at least two characters to search places (powered by OpenStreetMap).
      </p>
    );
  }
  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Searching…
      </p>
    );
  }
  if (!query.data || query.data.length === 0) {
    return <p className="text-xs text-muted">No results found.</p>;
  }
  return (
    <div className="space-y-1.5">
      {query.data.map((r) => (
        <NominatimRow key={`${r.osm_type}-${r.osm_id}`} result={r} />
      ))}
    </div>
  );
}

function NominatimRow({ result }: { result: NominatimSearchResult }) {
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);

  const typeLabel = result.type?.replace(/_/g, " ") || "";
  const categoryLabel = result.category?.replace(/_/g, " ") || "";
  const badge =
    typeLabel === "yes" || typeLabel === "unclassified"
      ? categoryLabel
      : typeLabel;

  return (
    <button
      onClick={() => {
        if (map) {
          map.flyTo({
            center: [result.lon, result.lat],
            zoom: 17,
            duration: 800,
          });
        }
        navigate({
          to: "/place/$osmType/$osmId",
          params: {
            osmType: result.osm_type,
            osmId: String(result.osm_id),
          },
          search: { lat: result.lat, lon: result.lon },
        });
      }}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-accent"
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{result.name}</p>
          {badge && (
            <span className="flex-shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted line-clamp-2">
          {result.display_name}
        </p>
      </div>
    </button>
  );
}
