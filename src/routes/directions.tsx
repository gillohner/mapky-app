import { useEffect, useRef } from "react";
import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import {
  buildDirectionsSearch,
  isRouteActivity,
  parseDirectionsSearch,
  type DirectionsSearchParams,
} from "@/lib/routing/url";
import { lookupOsmElement } from "@/lib/api/nominatim";

/**
 * /directions?from=lat,lon[@osmType:osmId]&via=...&to=...&mode=walk
 *
 * URL is the source of truth on initial mount: we hydrate the route
 * creation store from search params. After hydration, store changes are
 * mirrored back to the URL (replace mode, no history spam) so:
 *   1. Reloading the tab restores the directions
 *   2. Sharing the URL gives the recipient the same trip
 *   3. Browser history isn't polluted with every waypoint edit
 *
 * The visual UI is mounted at the root layout (DirectionsLayer); this
 * route component just owns the URL <-> store sync and renders null.
 */

export const Route = createFileRoute("/directions")({
  component: DirectionsRoute,
  validateSearch: (search): DirectionsSearchParams => ({
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    via: Array.isArray(search.via)
      ? (search.via as unknown[]).filter((v) => typeof v === "string").map(String)
      : typeof search.via === "string"
        ? [search.via]
        : undefined,
    mode:
      typeof search.mode === "string" && isRouteActivity(search.mode)
        ? search.mode
        : undefined,
  }),
});

function DirectionsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Last URL we wrote OR hydrated from, as a canonical key. Both
  // directions of the sync must produce the same string when the URL
  // reflects the store, otherwise they'll ping-pong: each navigate
  // re-fires the URL→store effect (which wipes computed/primary back to
  // null), and the next snap result gets clobbered before the user
  // ever sees a polyline.
  const lastSyncedRef = useRef<string>("");

  // URL → store: hydrate on initial mount AND when external navigation
  // (browser back/forward, paste-link) brings us a different URL.
  //
  // If the URL has no waypoint data, we still open directions but DO NOT
  // overwrite the store's slots — that lets users navigate to /directions
  // (e.g. via "Resume draft" or the Routes "+ New" button) without
  // wiping their in-progress draft.
  useEffect(() => {
    const key = canonicalSearchKey(search);
    if (key === lastSyncedRef.current) return;
    lastSyncedRef.current = key;

    const hasUrlData = Boolean(
      search.from ||
        search.to ||
        (search.via && search.via.length > 0),
    );

    if (!hasUrlData) {
      useRouteCreationStore.setState({ isOpen: true });
      return;
    }

    const { slots, activity } = parseDirectionsSearch(search);
    useRouteCreationStore.setState((s) => ({
      ...s,
      isOpen: true,
      mode: "create",
      slots,
      activity: activity ?? s.activity,
      computed: null,
      primary: null,
      alternates: [],
      selectedAlternate: 0,
      computeError: null,
      computeErrorHint: null,
      computeNonce: s.computeNonce + 1,
    }));
  }, [search]);

  // Store → URL: keep the URL in sync with the user's edits. Subscribe
  // imperatively (rather than via selector hooks) so we can compare
  // serialized values and skip writes that match what's already there.
  useEffect(() => {
    const sync = () => {
      const s = useRouteCreationStore.getState();
      if (!s.isOpen) return;
      const next = buildDirectionsSearch(s.slots, s.activity);
      const key = canonicalSearchKey(next);
      if (key === lastSyncedRef.current) return;
      lastSyncedRef.current = key;
      // replace: true so each waypoint edit doesn't fill browser history.
      navigate({ to: "/directions", search: next, replace: true });
    };
    // Run once on mount in case the store already drifted past the URL
    // (e.g. user opened directions via a non-URL entry point and then
    // clicked the share-link from the address bar).
    sync();
    return useRouteCreationStore.subscribe(sync);
  }, [navigate]);

  // Resolve placeholder OSM labels ("way/135207248") to friendly names
  // via Nominatim. parseSlotParam can't do this synchronously, so we
  // hydrate with the OSM ref as a placeholder and patch the slot's
  // label once Nominatim returns.
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const slots = useRouteCreationStore.getState().slots;
      for (const [i, slot] of slots.entries()) {
        if (slot.kind !== "place") continue;
        const placeholder = `${slot.osmType}/${slot.osmId}`;
        if (slot.label !== placeholder) continue;
        try {
          const nom = await lookupOsmElement(slot.osmType, slot.osmId);
          if (cancelled) return;
          const friendly =
            nom?.name ||
            nom?.display_name?.split(",")[0]?.trim() ||
            null;
          if (!friendly) continue;
          // Re-read the slot before writing — the user may have edited
          // it while Nominatim was in flight.
          const current = useRouteCreationStore.getState().slots[i];
          if (
            !current ||
            current.kind !== "place" ||
            current.id !== slot.id ||
            current.label !== placeholder
          ) {
            continue;
          }
          useRouteCreationStore
            .getState()
            .setSlot(i, { ...current, label: friendly });
        } catch {
          // Nominatim 404 / network — leave the OSM ref as the visible
          // label. User can re-pick from the search popover if they
          // want a friendlier name.
        }
      }
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [search]);

  // Closing the panel (X button) navigates away — but only on a true →
  // false transition. The store starts at isOpen=false on mount; without
  // tracking the previous value we'd see "false" on first render and
  // immediately bounce off /directions before hydration could open it.
  // We also skip the navigate when the user has already been moved off
  // /directions (e.g. by the save flow's `navigate('/route/...')`),
  // otherwise this effect would overwrite the save's destination.
  const isOpen = useRouteCreationStore((s) => s.isOpen);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const prevOpenRef = useRef(isOpen);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (wasOpen && !isOpen && currentPath === "/directions") {
      navigate({ to: "/", replace: true });
    }
  }, [isOpen, currentPath, navigate]);

  // Navigating away from /directions (clicking another rail tab,
  // back/forward, etc.) leaves the directions store with isOpen=true,
  // and DirectionsLayer is mounted at the root — so it would keep
  // painting in the same left slot under whatever sidebar the user
  // just opened. Clear isOpen on unmount so the layer drops cleanly.
  useEffect(() => {
    return () => {
      useRouteCreationStore.setState({ isOpen: false });
    };
  }, []);

  return null;
}

/**
 * Stable, order-independent key for a directions search-params object.
 * `Route.useSearch()` returns `{from, to, via, mode}` (validateSearch
 * order); `buildDirectionsSearch()` returns `{mode, from, to, via?}`.
 * Plain `JSON.stringify` would yield different strings for the same
 * content because of key order, so we serialize via a fixed sequence
 * to guarantee both sides round-trip to the same key.
 */
function canonicalSearchKey(s: DirectionsSearchParams): string {
  return JSON.stringify({
    mode: s.mode ?? "",
    from: s.from ?? "",
    to: s.to ?? "",
    via: s.via ?? [],
  });
}
