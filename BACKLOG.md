# Mapky Backlog

Tracked items deferred from API/UX audits. Cross-repo items note which repo owns the change.

## API efficiency

- ~~**Place detail composite endpoint** (plugin + app)~~ — **shipped**.
  `GET /v0/mapky/place/{osm_type}/{osm_id}/full` returns `{detail, reviews, posts, tags, collections, routes}` in one envelope; sub-queries run in `tokio::try_join!`. Frontend's `PlaceReviews`, `PlaceComments`, `PlaceCollections`, `PlaceRoutes`, `PlaceTags`, and `PlacePanel` all read off the shared composite cache via `usePlaceFull*` slice hooks.

- ~~**Migrate `PlaceTags` onto the composite** (app only)~~ — **shipped**.
  `TagStrip` grew an optional `mutate` + `refresh` callback API alongside the existing `queryKey` path. `PlaceTags` now reads tags from `usePlaceFullTags` and patches the `PlaceFullResponse.tags` slice via the callback. Place open fires one request instead of two. Other `*Tags` callers stay on the simple `queryKey` path.

- ~~**Sequence captures batch endpoint** (plugin + app)~~ — **shipped**.
  `POST /v0/mapky/sequences/captures/by_ids` accepts a list of sequence URIs and returns every member capture in one Cypher round-trip (`WHERE g.sequence_uri IN $uris`). `useSequenceMembersFanOut` switched from a `useQueries` fan-out to a single batched query; per-sequence cache is seeded from the response so detail-panel hits stay free.

- ~~**`staleTime` on place detail hooks** (app only)~~ — **shipped** as part of the composite migration. `usePlaceFull*` slice hooks carry `staleTime: 60_000`.

- ~~**Move `/v0/ingest/{id}` out of the query retry callback** (app only)~~ — **shipped**.
  New `useEnsureIngested(userId)` hook in `src/lib/nexus/use-ensure-ingested.ts` owns the once-per-session de-dup via `useEffect`. `useUserProfile` is back to a plain `useQuery` with `noRetryOn404`. The 3 surfaces that render unknown authors (`PlaceComments`, `PlaceReviews`, `ReplyThread`) mount the hook alongside their profile fetch. Current-user surfaces don't need it — login already ingests the signed-in user.

## UX — place layer & filters

- ~~**Promote BTC to its own overlay layer** (app + plugin)~~ — **shipped**.
  `<BtcOverlayLayer />` renders BTC merchants as orange dots (high zoom) / orange cluster bubbles (low zoom) sourced from `/v0/mapky/btc/viewport`'s zoom-aware envelope. Independent toggle in the LayerSheet's Overlays tab. Cell-midpoints used to drift between layers; now both Mapky and BTC clusters use centroid (avg lat/lon) and the BTC overlay markers carry a `(+22, -22)` pixel offset so the bubbles sit side-by-side rather than stacking when both layers have data in the same area.

- ~~**OR-combined filter pills + min-rating dimension** (app + plugin)~~ — **shipped**.
  `PlaceFilters = { activities: PlaceActivity[]; minRating? }`. Plugin's `/v0/mapky/viewport` accepts comma-separated `?activity=tagged,reviewed,posted,collected` (OR) + `?min_rating=4`. Empty `activities` defaults to "any Mapky engagement" (OR of all four) so unengaged BTCMap merchants don't flood the place layer. `?include_unengaged=true` is the escape hatch. `<PlaceFilterControls />` mounts in both the LayerSheet's Mapky tab AND the Places sidebar.

- ~~**Tag filter on viewport** (app + plugin)~~ — **already covered by global search**.
  `<SearchBar />` / `<SearchPanel />` already do tag-driven map filtering: typing a tag hits `/v0/mapky/search/tags?q=`, the search panel calls `useAutoFocusLayer(null, { hide: true })` to clear the regular Places layer, and `<SearchResultsOverlay />` renders the matching places as the same teardrop balloons. No separate viewport-level `?tags=` predicate needed.

## Geocaptures + sequences

- ~~**Sequence display on map** (plugin + app)~~ — **shipped** (mapky-nexus-plugin#3 + mapky-app#16).
  `<SequenceMarkersLayer />` renders one violet pill marker per sequence at the bbox centroid. Polyline lifted 0.35→0.55. Backend: `/v0/mapky/sequences/viewport` (bbox-overlap query) + `/v0/mapky/sequences/{a}/{id}/full` composite.

- ~~**Sequence detail + tag/post on sequences as a whole** (plugin + app)~~ — **shipped**.
  `/sequence/$author/$id` route + `<SequenceDetailPanel />` (header, description, capture grid, tags, reply thread). Composite cache → 1 round-trip per panel open. `<SequenceTags />` reuses TagStrip's composite-cache callbacks. `ResourceDiscussion` already supported `resourceType: "sequences"` — backend was ready, just wired the UI.

- ~~**Sequence discovery sidebar + search navigation** (app)~~ — **shipped**.
  `/sequences` route with Mine + In-this-area tabs. IconRail entry. SearchPanel: sequence rows clickable + post-parent resolution.

- ~~**Capture upload UX polish** (app)~~ — **shipped**.
  Drag-drop on empty PickStep zone. EXIF GPS-coverage banner when picked set has a mix.

- **Capture markers in `<SearchResultsOverlay />`** (app, deferred)
  Captures and sequences don't currently render as map balloons during search (only places, routes, collections, reviews). Search list nav covers most of the UX, but adding map balloons would close the gap. Low-priority polish.

- **Sequence rename / delete** (app)
  Owner-only edit affordances on the SequenceDetailPanel. Deferred.

- **Reorder captures within a published sequence** (app + plugin)
  Currently `sequence_index` is fixed at upload. UI for re-sorting members is a larger refactor — deferred.

## Plugin endpoints — defer cleanup

- **Incidents endpoints** (`/incidents/viewport`, `/incidents/{author}/{id}`, `/incidents/user/{id}`)
  Currently unused by the frontend. Per user direction, leave defined and improve later. Don't delete.

- **BTC endpoints** (`/btc/viewport`, `/btc/status`)
  `/btc/viewport` is the BTC overlay layer's data source. `/btc/status` exposes BTCMap sync state — still unused but cheap to keep.

## Considered, not building

- **`/v0/mapky/bootstrap/{user_id}`** — pubky-nexus has one for `/v0/bootstrap/{user_id}` because pubky.app's home is a feed (5+ user-keyed lists). Mapky's home is the map; the four viewport queries are bbox-keyed, not user-keyed, so a one-shot bootstrap doesn't collapse them. Revisit if/when a "my stuff" sidebar lands that needs collections + recent reviews + drafts in one payload.

- **Forking pubky-app-specs** — `mapky-app-specs` already pulls `pubky-app-specs = "0.4"` from crates.io and re-exports `PubkyAppPost` directly. Upstream changes within `^0.4` flow through after a `cargo update` + WASM rebuild + npm publish chain. No fork needed.
