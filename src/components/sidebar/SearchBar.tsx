import { useMemo, useState, useRef, useEffect } from "react";
import {
  Search,
  User,
  X,
  MapPin,
  Tag,
  FolderHeart,
  MessageSquare,
  Route as RouteIcon,
  AlertTriangle,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useNominatimSearch,
  useTagSearch,
  useOsmLookup,
  useUserProfile,
} from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { getInitials, getPubkyAvatarUrl } from "@/lib/api/user";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import type {
  MapkyPostDetails,
  PlaceDetails,
  ReviewDetails,
  RouteDetails,
} from "@/types/mapky";
import { parseOsmCanonical, fallbackPlaceLabel } from "@/lib/map/osm-url";
import {
  placeStarsLabel,
  sortByRating,
  useEnrichedSearchResults,
  type EnrichedResult,
} from "@/lib/places/enrich-search";

type SearchMode = "places" | "tags";

export function SearchBar() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [mode, setMode] = useState<SearchMode>("places");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Search bar stays visible in street view — user can search to exit
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const searchParams = useRouterState({ select: (s) => s.location.search });
  const isOnSearchRoute = currentPath === "/search";

  // Mobile-only: the leading avatar button inside the search bar
  // doubles as the menu trigger (replacing the standalone hamburger).
  // On desktop the IconRail hosts the avatar separately, so this
  // button is hidden via `md:hidden` on the rendered element.
  const { isAuthenticated, publicKey } = useAuth();
  const profile = useUserProfile(publicKey);
  const [avatarErrored, setAvatarErrored] = useState(false);
  const hasAvatar = Boolean(profile.data?.image);
  const avatarUrl =
    isAuthenticated && publicKey && hasAvatar && !avatarErrored
      ? getPubkyAvatarUrl(publicKey)
      : null;
  const avatarInitials = getInitials(profile.data?.name);

  const { data: placeResults, isLoading: placesLoading } =
    useNominatimSearch(mode === "places" ? query : "");
  const { data: tagResults, isLoading: tagsLoading } = useTagSearch(
    mode === "tags" ? query : "",
  );

  // Decorate Nominatim results with rating + tags via the indexer's
  // PlaceDetails cache, then re-rank highly-rated places to the top.
  const enrichedPlaces = useEnrichedSearchResults(placeResults ?? []);
  const sortedEnrichedPlaces = useMemo(
    () => sortByRating(enrichedPlaces),
    [enrichedPlaces],
  );

  const isLoading = mode === "places" ? placesLoading : tagsLoading;

  // Flat list of selectable rows in the order they render. Powers
  // ArrowUp/Down navigation in the dropdown — each entry carries a
  // stable key (used for highlight matching) and the click handler
  // to fire on Enter.
  const selectableRows = useMemo<Array<{ key: string; select: () => void }>>(() => {
    if (mode === "places") {
      return sortedEnrichedPlaces.map((row) => ({
        key: `place-${row.result.osm_type}-${row.result.osm_id}`,
        select: () => handleSelectPlace(row.result),
      }));
    }
    if (mode === "tags" && tagResults) {
      const rows: Array<{ key: string; select: () => void }> = [];
      for (const p of tagResults.places ?? []) {
        rows.push({
          key: `tagPlace-${p.osm_type}-${p.osm_id}`,
          select: () => handleSelectTagPlace(p.osm_type, p.osm_id),
        });
      }
      for (const c of tagResults.collections ?? []) {
        const [authorId, collectionId] = c.id.split(":");
        rows.push({
          key: `collection-${c.id}`,
          select: () => handleSelectCollection(authorId, collectionId),
        });
      }
      for (const review of tagResults.reviews ?? []) {
        rows.push({
          key: `review-${review.author_id}-${review.id}`,
          select: () => handleSelectReview(review),
        });
      }
      for (const route of tagResults.routes ?? []) {
        rows.push({
          key: `route-${route.id}`,
          select: () => handleSelectRoute(route),
        });
      }
      for (const post of tagResults.posts ?? []) {
        rows.push({
          key: `post-${post.author_id}-${post.id}`,
          select: () => handleSelectPost(post),
        });
      }
      for (const incident of tagResults.incidents ?? []) {
        rows.push({
          key: `incident-${incident.author_id}-${incident.id}`,
          select: () =>
            handleSelectIncident(
              incident.author_id,
              incident.id.includes(":")
                ? incident.id.split(":").pop() ?? incident.id
                : incident.id,
            ),
        });
      }
      return rows;
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sortedEnrichedPlaces, tagResults]);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Reset highlight when the underlying row set changes (mode swap,
  // new query, etc.) so a stale index doesn't trigger the wrong row.
  useEffect(() => {
    setSelectedIndex(-1);
  }, [selectableRows]);
  const selectedKey =
    selectedIndex >= 0 ? selectableRows[selectedIndex]?.key : null;

  // Debounce input → query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (input.length < 2) {
      setQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(debounceRef.current);
  }, [input]);

  // Close dropdown on click outside
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Closing /search (X button) navigates to "/", but the SearchBar
  // still holds the typed query — and the "auto-push to /search" effect
  // below would immediately bounce the user back. When we detect a
  // /search → / transition, clear the input so the close actually
  // sticks. The user can re-type to start a new search.
  //
  // `setInput` / `setQuery` only apply on the next render, but the
  // auto-push effect runs in the same render as the leave-search
  // transition — so on its own this clear isn't enough; the auto-push
  // would still see the old query and re-navigate. The ref below is
  // read by the auto-push effect to suppress that one render.
  const prevOnSearchRef = useRef(isOnSearchRoute);
  const justLeftSearchRef = useRef(false);
  useEffect(() => {
    if (prevOnSearchRef.current && !isOnSearchRoute) {
      setInput("");
      setQuery("");
      setShowResults(false);
      justLeftSearchRef.current = true;
    }
    prevOnSearchRef.current = isOnSearchRoute;
  }, [isOnSearchRoute]);

  // Sync SearchBar input with /search route query param. The /search
  // route is what we navigate TO when the user types — so a reload of
  // either / or /search?q=... preserves the active search, and a copy of
  // the URL is shareable.
  useEffect(() => {
    if (isOnSearchRoute && typeof searchParams === "object" && searchParams !== null) {
      const sp = searchParams as Record<string, unknown>;
      const q = sp.q ? String(sp.q) : "";
      const m: SearchMode = sp.mode === "tags" ? "tags" : "places";
      if (q && q !== input) setInput(q);
      if (m !== mode) setMode(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnSearchRoute, searchParams]);

  // Push the active query into the URL so reload restores it. We only
  // navigate to /search when the user is NOT already on a place /
  // collection / route detail page — otherwise typing would yank them
  // out of whatever they were viewing. On those pages we'd lose state on
  // reload anyway; the search-stickiness sweet spot is the home / map
  // browsing flow.
  useEffect(() => {
    if (justLeftSearchRef.current) {
      justLeftSearchRef.current = false;
      return;
    }
    if (query.length < 2) return;
    if (isOnSearchRoute) {
      // Already on /search — keep params in sync without navigation.
      const sp =
        typeof searchParams === "object" && searchParams !== null
          ? (searchParams as Record<string, unknown>)
          : {};
      if (sp.q !== query || sp.mode !== mode) {
        navigate({
          to: "/search",
          search: { q: query, mode },
          replace: true,
        });
      }
      return;
    }
    // From the home page, push the query to /search so a reload restores
    // it. Skip when the user is in a focused detail view (place, route,
    // collection, etc.) so we don't snatch them away mid-read.
    if (currentPath === "/" || currentPath === "") {
      navigate({ to: "/search", search: { q: query, mode } });
    }
  }, [query, mode, isOnSearchRoute, currentPath, navigate, searchParams]);

  const handleSelectPlace = (result: NominatimSearchResult) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    if (map) {
      map.flyTo({ center: [result.lon, result.lat], zoom: 17, duration: 1500 });
    }

    navigate({
      to: "/place/$osmType/$osmId",
      params: {
        osmType: result.osm_type,
        osmId: String(result.osm_id),
      },
      search: { lat: result.lat, lon: result.lon },
    });
  };

  const handleSelectTagPlace = (osmType: string, osmId: number) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType, osmId: String(osmId) },
    });
  };

  const handleSelectCollection = (authorId: string, collectionId: string) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    navigate({
      to: "/collection/$authorId/$collectionId",
      params: { authorId, collectionId },
      search: {
        fromSearchQuery: input,
        fromSearchMode: mode,
      },
    });
  };

  const handleSelectReview = (review: ReviewDetails) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    const parsed = parseOsmCanonical(review.osm_canonical);
    if (!parsed) return;

    navigate({
      to: "/place/$osmType/$osmId",
      params: {
        osmType: parsed.osmType,
        osmId: String(parsed.osmId),
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowResults(false);
      setSelectedIndex(-1);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      if (selectableRows.length === 0) return;
      e.preventDefault();
      setShowResults(true);
      setSelectedIndex((i) => Math.min(i + 1, selectableRows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (selectableRows.length === 0) return;
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter") {
      // Highlighted row → fire its handler. Otherwise fall back to
      // the existing "open the full /search panel" behavior.
      if (selectedIndex >= 0 && selectableRows[selectedIndex]) {
        e.preventDefault();
        setShowResults(false);
        selectableRows[selectedIndex].select();
        return;
      }
      if (input.length >= 2) {
        setShowResults(false);
        navigate({ to: "/search", search: { q: input, mode } });
      }
    }
  };

  const switchMode = (newMode: SearchMode) => {
    setMode(newMode);
    // Re-trigger search with existing input in the new mode
    setQuery(input.length >= 2 ? input : "");
    inputRef.current?.focus();
  };

  const hasResults =
    mode === "places"
      ? placeResults && placeResults.length > 0
      : tagResults &&
        ((tagResults.places?.length ?? 0) > 0 ||
          (tagResults.collections?.length ?? 0) > 0 ||
          (tagResults.reviews?.length ?? 0) > 0 ||
          (tagResults.posts?.length ?? 0) > 0 ||
          (tagResults.routes?.length ?? 0) > 0 ||
          (tagResults.geo_captures?.length ?? 0) > 0 ||
          (tagResults.sequences?.length ?? 0) > 0 ||
          (tagResults.incidents?.length ?? 0) > 0);

  // Hide whenever the directions sidebar is actually visible — it
  // takes the same left slot and owns the search/picker UX. The store's
  // `isOpen` is only flipped by an explicit user action now (the route
  // detail's "Open in directions" button or landing on /directions), so
  // it's a reliable proxy for "DirectionsLayer is on screen". Pathname
  // alone wasn't enough: navigating /directions → /places → / leaves
  // directions visible at "/", and a pathname check would re-show this
  // SearchBar on top of the DirectionsBar input.
  const directionsOpen = useRouteCreationStore((s) => s.isOpen);
  if (directionsOpen) return null;

  return (
    <div
      ref={containerRef}
      // Mobile: flush left at `left-3` since the menu trigger now
      //   lives inside this same search bar (no standalone hamburger
      //   to dodge).
      // Desktop: past the IconRail at `md:left-14` (or past an open
      //   discover sidebar at `md:left-[440px]`).
      className={`pointer-events-auto absolute top-3 z-20 left-3 right-3 md:right-auto md:w-[380px] transition-[left] duration-300 ${
        sidebarOpen ? "md:left-[440px]" : "md:left-14"
      }`}
    >
      {/* Search input */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/90 px-2 py-2 shadow-lg backdrop-blur">
        {/* Mobile-only: avatar doubles as menu trigger. Hidden on
            desktop — IconRail hosts the avatar there. */}
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label={isAuthenticated ? "Open menu" : "Sign in"}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-accent transition-opacity hover:opacity-80 md:hidden"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarErrored(true)}
            />
          ) : isAuthenticated && avatarInitials ? (
            <span className="text-xs font-semibold">{avatarInitials}</span>
          ) : (
            <User className="h-4 w-4" />
          )}
        </button>

        {/* Mode toggle */}
        <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
          <button
            onClick={() => switchMode("places")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "places"
                ? "bg-background text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
            title="Search places"
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => switchMode("tags")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "tags"
                ? "bg-background text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
            title="Search by tag (places, collections, posts, routes, incidents)"
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
        </div>

        <Search className="h-4 w-4 flex-shrink-0 text-muted" />
        <input
          ref={inputRef}
          id="mapky-search-input"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "places" ? "Search places..." : "Search by tag..."
          }
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        {input && (
          <button
            onClick={() => {
              setInput("");
              setQuery("");
              setShowResults(false);
            }}
            className="flex-shrink-0 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && query.length >= 2 && !isOnSearchRoute && (
        <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-muted">Searching...</div>
          )}

          {!isLoading && !hasResults && (
            <div className="px-4 py-3 text-sm text-muted">No results found</div>
          )}

          {/* Places mode results — enriched with Mapky rating + tags. */}
          {mode === "places" &&
            sortedEnrichedPlaces.map((row) => {
              const k = `place-${row.result.osm_type}-${row.result.osm_id}`;
              return (
                <PlaceResultRow
                  key={k}
                  row={row}
                  highlighted={selectedKey === k}
                  onSelect={() => handleSelectPlace(row.result)}
                />
              );
            })}

          {/* Tags mode results */}
          {mode === "tags" && tagResults && (
            <>
              {tagResults.places?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Places
                  </div>
                  {tagResults.places.map((p) => {
                    const k = `tagPlace-${p.osm_type}-${p.osm_id}`;
                    return (
                      <TagPlaceResult
                        key={k}
                        place={p}
                        highlighted={selectedKey === k}
                        onSelect={() =>
                          handleSelectTagPlace(p.osm_type, p.osm_id)
                        }
                      />
                    );
                  })}
                </div>
              )}

              {tagResults.collections?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Collections
                  </div>
                  {tagResults.collections.map((c) => {
                    const [authorId, collectionId] = c.id.split(":");
                    const k = `collection-${c.id}`;
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          handleSelectCollection(authorId, collectionId)
                        }
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${selectedKey === k ? "bg-accent/10" : "hover:bg-surface"}`}
                      >
                        <FolderHeart className="h-4 w-4 flex-shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {c.name}
                          </p>
                          <p className="text-xs text-muted">
                            {c.items.length} places
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tagResults.reviews?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Reviews
                  </div>
                  {tagResults.reviews.map((review) => {
                    const k = `review-${review.author_id}-${review.id}`;
                    return (
                      <button
                        key={`${review.author_id}-${review.id}`}
                        onClick={() => handleSelectReview(review)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${selectedKey === k ? "bg-accent/10" : "hover:bg-surface"}`}
                      >
                        <MessageSquare className="h-4 w-4 flex-shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            {review.content
                              ? review.content.slice(0, 80) +
                                (review.content.length > 80 ? "..." : "")
                              : "Review"}
                          </p>
                          <p className="text-xs text-muted">
                            {`${(review.rating / 2).toFixed(1)} stars · `}
                            <OsmPlaceName osmCanonical={review.osm_canonical} />
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tagResults.routes?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Routes
                  </div>
                  {tagResults.routes.map((route) => {
                    const k = `route-${route.id}`;
                    return (
                      <button
                        key={route.id}
                        onClick={() => handleSelectRoute(route)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${selectedKey === k ? "bg-accent/10" : "hover:bg-surface"}`}
                      >
                        <RouteIcon className="h-4 w-4 flex-shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {route.name || "Untitled route"}
                          </p>
                          <p className="text-xs uppercase text-muted">
                            {route.activity}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tagResults.posts?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Posts
                  </div>
                  {tagResults.posts.map((post) => {
                    const k = `post-${post.author_id}-${post.id}`;
                    return (
                      <button
                        key={k}
                        onClick={() => handleSelectPost(post)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${selectedKey === k ? "bg-accent/10" : "hover:bg-surface"}`}
                      >
                        <MessageSquare className="h-4 w-4 flex-shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            {post.content
                              ? post.content.slice(0, 80) +
                                (post.content.length > 80 ? "..." : "")
                              : "Post"}
                          </p>
                          <p className="text-xs text-muted">{post.kind}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tagResults.incidents?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Incidents
                  </div>
                  {tagResults.incidents.map((incident) => {
                    const k = `incident-${incident.author_id}-${incident.id}`;
                    const incidentId = incident.id.includes(":")
                      ? incident.id.split(":").pop() ?? incident.id
                      : incident.id;
                    return (
                      <button
                        key={k}
                        onClick={() =>
                          handleSelectIncident(incident.author_id, incidentId)
                        }
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${selectedKey === k ? "bg-accent/10" : "hover:bg-surface"}`}
                      >
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {incident.description || incident.incident_type}
                          </p>
                          <p className="text-xs uppercase text-muted">
                            {incident.incident_type} · {incident.severity}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  function handleSelectPost(post: MapkyPostDetails) {
    setInput("");
    setQuery("");
    setShowResults(false);

    const visited = new Set<string>();
    let current: MapkyPostDetails | undefined = post;
    for (let i = 0; i < 5 && current; i++) {
      const parentUri: string | null = current.parent_uri;
      if (!parentUri) return;

      const osm = parentUri.match(
        /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/(\d+)\/?$/,
      );
      if (osm) {
        navigate({
          to: "/place/$osmType/$osmId",
          params: { osmType: osm[1], osmId: osm[2] },
        });
        return;
      }

      const matched = parentUri.match(
        /^pubky:\/\/([^/]+)\/pub\/mapky\.app\/(reviews|routes|collections|geo_captures|sequences|incidents|posts)\/([^/?#]+)/,
      );
      if (!matched) return;
      const parentAuthor: string = matched[1];
      const parentType: string = matched[2];
      const parentId: string = matched[3];

      if (parentType === "routes") {
        navigate({
          to: "/route/$authorId/$routeId",
          params: { authorId: parentAuthor, routeId: parentId },
        });
        return;
      }
      if (parentType === "collections") {
        navigate({
          to: "/collection/$authorId/$collectionId",
          params: { authorId: parentAuthor, collectionId: parentId },
        });
        return;
      }
      if (parentType === "geo_captures") {
        navigate({
          to: "/capture/$authorId/$captureId",
          params: { authorId: parentAuthor, captureId: parentId },
        });
        return;
      }
      if (parentType === "reviews") {
        const reviewCompound = `${parentAuthor}:${parentId}`;
        const review = tagResults?.reviews?.find(
          (r) =>
            r.id === reviewCompound ||
            (r.author_id === parentAuthor && r.id === parentId),
        );
        if (review) handleSelectReview(review);
        return;
      }
      if (parentType === "posts") {
        const key = `${parentAuthor}:${parentId}`;
        if (visited.has(key)) return;
        visited.add(key);
        current = tagResults?.posts?.find(
          (p) =>
            p.id === parentId &&
            (p.author_id === parentAuthor || p.id === key),
        );
        continue;
      }
      if (parentType === "sequences") {
        navigate({
          to: "/sequence/$authorId/$sequenceId",
          params: { authorId: parentAuthor, sequenceId: parentId },
        });
        return;
      }
      if (parentType === "incidents") {
        navigate({
          to: "/incident/$authorId/$incidentId",
          params: { authorId: parentAuthor, incidentId: parentId },
        });
        return;
      }
      return;
    }
  }

  function handleSelectIncident(authorId: string, incidentId: string) {
    setInput("");
    setQuery("");
    setShowResults(false);

    navigate({
      to: "/incident/$authorId/$incidentId",
      params: { authorId, incidentId },
    });
  }

  function handleSelectRoute(route: RouteDetails) {
    setInput("");
    setQuery("");
    setShowResults(false);
    const idx = route.id.indexOf(":");
    const routeId = idx >= 0 ? route.id.slice(idx + 1) : route.id;
    navigate({
      to: "/route/$authorId/$routeId",
      params: { authorId: route.author_id, routeId },
    });
  }
}

function PlaceResultRow({
  row,
  onSelect,
  highlighted,
}: {
  row: EnrichedResult;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  const { result, place, tags } = row;
  const typeLabel = result.type?.replace(/_/g, " ") || "";
  const categoryLabel = result.category?.replace(/_/g, " ") || "";
  const badge =
    typeLabel === "yes" || typeLabel === "unclassified"
      ? categoryLabel
      : typeLabel;
  const stars = placeStarsLabel(place);
  const topTags = tags.slice(0, 2);

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${highlighted ? "bg-accent/10" : "hover:bg-surface"}`}
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {result.name}
          </p>
          {badge && (
            <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {badge}
            </span>
          )}
          {stars && (
            <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {stars}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {result.display_name}
        </p>
        {topTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {topTags.map((t) => (
              <span
                key={t.label}
                className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted"
              >
                {t.label}
              </span>
            ))}
            {tags.length > topTags.length && (
              <span className="text-[10px] text-muted">
                +{tags.length - topTags.length}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function OsmPlaceName({ osmCanonical }: { osmCanonical: string }) {
  const parsed = parseOsmCanonical(osmCanonical);
  const { data: nominatim } = useOsmLookup(
    parsed?.osmType ?? "",
    parsed?.osmId ?? 0,
    !!parsed,
  );
  const fallback = parsed
    ? fallbackPlaceLabel(parsed.osmType, parsed.osmId)
    : osmCanonical;
  return (
    <>
      {nominatim?.name ||
        nominatim?.display_name?.split(",")[0] ||
        fallback}
    </>
  );
}

function TagPlaceResult({
  place,
  onSelect,
  highlighted,
}: {
  place: PlaceDetails;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  const { data: nominatim } = useOsmLookup(
    place.osm_type,
    place.osm_id,
    true,
  );

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    fallbackPlaceLabel(place.osm_type, place.osm_id);

  const typeLabel =
    nominatim?.type?.replace(/_/g, " ") ?? "";

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left ${highlighted ? "bg-accent/10" : "hover:bg-surface"}`}
    >
      <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{name}</p>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {place.tag_count > 0 && <span>{place.tag_count} tags</span>}
          {place.review_count > 0 && (
            <span>{place.review_count} reviews</span>
          )}
        </div>
      </div>
    </button>
  );
}
