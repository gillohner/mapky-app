# Mapky Backlog

Tracked items deferred from API/UX audits. Cross-repo items note which repo owns the change.

## API efficiency

- ~~**Place detail composite endpoint** (plugin + app)~~ — **shipped**.
  `GET /v0/mapky/place/{osm_type}/{osm_id}/full` returns `{detail, reviews, posts, tags, collections, routes}` in one envelope; sub-queries run in `tokio::try_join!`. Frontend's `PlaceReviews`, `PlaceComments`, `PlaceCollections`, `PlaceRoutes`, and `PlacePanel` itself read off shared composite cache via `usePlaceFull*` slice hooks. `staleTime: 60s` mitigates back-navigation refetches. **Not migrated**: `PlaceTags` — would require teaching `TagStrip` to do optimistic updates against a `PlaceFullResponse` shape (it currently writes a `PostTagDetails[]`-shaped value to the queryKey it's given). See follow-up below.

- **Migrate `PlaceTags` onto the composite** (app only)
  `PlaceTags` still hits `/place/.../tags` standalone, so a place open fires two requests instead of one. Either teach `TagStrip` to take an optimistic-update *callback* (rather than a raw `queryKey`), or add a slice-aware setQueryData utility. `onCountDelta` already mirrors `tag_count` into both caches so `PlaceHeader` reflects mutations.

- **Sequence captures batch endpoint** (plugin + app)
  `POST /v0/mapky/sequences/captures/by_ids` (mirrors pubky-nexus' `/v0/files/by_ids` and `/v0/stream/posts/by_ids`).
  `useSequenceMembersFanOut` (`src/lib/api/hooks.ts`) currently fires one request per visible sequence. Fine today; matters once sequence density in viewport grows. Defer until there's a screen with >5 sequences in view.

- ~~**`staleTime` on place detail hooks** (app only)~~ — **shipped** as part of the composite migration. The composite-backed slice hooks (`usePlaceFull*`) carry `staleTime: 60_000`. The legacy single-purpose hooks (`usePlaceDetail`, `usePlaceTags`, etc.) are still called by non-PlacePanel surfaces (e.g. `SelectedPlaceMarker`, `CollectionPlaces`); they could get the same staleTime if we see redundant refetches there.

- **Move `/v0/ingest/{id}` out of the query retry callback** (app only)
  `useUserProfile` (`src/lib/api/hooks.ts:240-258`) fires `ingestUserIntoNexus` from inside a `retry` callback. Works, but mixes mutation into a query and will get awkward under Suspense. Extract a `useEnsureIngested(userId)` hook that owns the once-per-session guard.

## UX — place layer & filters

- **Promote BTC to its own overlay layer** (app + plugin coordination)
  Today BTC is a boolean filter on `PlaceFilters` (ANDed with reviewed/tagged) and surfaces in place dots. Move it to a sibling of the rail/cycling/terrain overlays — independent toggle, independent styling, independent data source. Lets users see "Bitcoin-accepting places" without losing non-BTC Mapky data, and removes the impossible-intersection trap when all three filter pills are on.
  Plugin: `/btc/viewport` already exists (currently unused) — wire it up as the data source for the new overlay rather than letting BTC piggyback on `/viewport`.

- **OR-combined filter pills + min-rating dimension** (app + plugin)
  Replace the three-boolean AND filter (`bitcoin / reviewed / tagged`) with:
  - `activity[]` — multi-select OR (any of: `tagged`, `reviewed`, `posted`, `collected`); default empty = "any Mapky activity"
  - `min_rating` — slider 0–5
  A place with only posts (no reviews, no tags) currently can't be isolated; adding `posted` to the activity set fixes that. The Place node already exists in Neo4j whenever a post anchors to it (`(MapkyAppPost)-[:ABOUT]->(Place)`), so no schema change needed on the indexer side — only the viewport query predicate.

- **Tag filter on viewport** (app + plugin)
  Let users type a tag (e.g. "coffee") and narrow the place layer to that tag. Pubky-nexus has `/v0/search/posts/by_tag/{tag}`; we need the equivalent for Mapky places — likely a `tags=coffee,vegan` query param on `/v0/mapky/viewport` that ANDs/ORs with the activity filter.

## Plugin endpoints — defer cleanup

- **Incidents endpoints** (`/incidents/viewport`, `/incidents/{author}/{id}`, `/incidents/user/{id}`)
  Currently unused by the frontend. Per user direction, leave defined and improve later. Don't delete.

- **Sequences endpoints** (`/sequences/{a}/{s}`, `/sequences/{a}/{s}/tags`, `/sequences/user/{id}`)
  Only `/sequences/{a}/{s}/captures` is consumed today. Per user direction, leave defined and improve later.

- **BTC endpoints** (`/btc/viewport`, `/btc/status`)
  Will be consumed once the BTC layer split (above) ships. Keep.

## Considered, not building

- **`/v0/mapky/bootstrap/{user_id}`** — pubky-nexus has one for `/v0/bootstrap/{user_id}` because pubky.app's home is a feed (5+ user-keyed lists). Mapky's home is the map; the four viewport queries are bbox-keyed, not user-keyed, so a one-shot bootstrap doesn't collapse them. Revisit if/when a "my stuff" sidebar lands that needs collections + recent reviews + drafts in one payload.

- **Forking pubky-app-specs** — `mapky-app-specs` already pulls `pubky-app-specs = "0.4"` from crates.io and re-exports `PubkyAppPost` directly. Upstream changes within `^0.4` flow through after a `cargo update` + WASM rebuild + npm publish chain. No fork needed.
