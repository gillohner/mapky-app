# Mapky — Decentralized Social Map PWA

Vite + React + TypeScript PWA. Social layer on OpenStreetMap built on Pubky protocol.

## Architecture

- **Map**: MapLibre GL JS with Protomaps vector tiles (PMTiles format). Map is always mounted in `__root.tsx`, never remounts on navigation.
- **Routing**: TanStack Router (file-based, `src/routes/`). Route content renders as overlay panels on top of the map.
- **State**: Zustand for client state (`stores/`), TanStack Query for server state (`lib/api/hooks.ts`).
- **Auth**: `@synonymdev/pubky` SDK — three methods: recovery file, Pubky Ring QR, testnet signup.
- **CSS**: Tailwind CSS v4 with light/dark mode (`dark` class on `<html>`).

## File Structure

```
src/
├── routes/           # TanStack Router file-based routes
│   ├── __root.tsx    # Root layout: map + providers + outlet
│   ├── index.tsx     # Map HUD (auth status, sign-in button)
│   ├── login.tsx     # Auth page
│   ├── directions.tsx                  # /directions URL ⇄ store sync
│   ├── route/$authorId.$routeId.tsx    # Route detail (auto-loads into directions)
│   ├── place/...     # Place panels
│   ├── collection/.../etc.
│   └── search.tsx
├── components/
│   ├── map/          # MapView, layer + overlay components, pickers
│   ├── route/        # DirectionsBar, DirectionsLayer, WaypointInput,
│   │                 # RouteDetailPanel, RouteSummaryCard, RouteList, ...
│   ├── place/        # PlacePanel, PlacePosts, PlaceTags, ...
│   ├── capture/      # GeoCapture viewer, CaptureCreationPanel, ...
│   ├── collection/   # CollectionList, CollectionHeader, ...
│   ├── shared/       # TagStrip, MediaViewer, UserAvatar, ...
│   ├── sidebar/      # IconRail, SearchBar, MobileMenuTrigger
│   └── auth/, providers/, menu/
├── stores/
│   ├── auth-store.ts            # Auth state + session persistence
│   ├── map-store.ts             # Map instance, center/zoom, theme, basemap
│   ├── ui-store.ts              # Layer toggles, sidebar, dim state, layer sheet
│   ├── route-creation-store.ts  # Directions: slots, activity, computed, snap
│   └── capture-creation-store.ts
├── lib/
│   ├── api/                     # Axios client, TanStack Query hooks
│   ├── routing/                 # Valhalla client, costing, polyline, types, url
│   ├── map/                     # Style factory, picker, dim, feature-id, osm-url
│   ├── pubky/                   # Pubky SDK wrapper
│   ├── nexus/                   # Nexus ingestion utility
│   └── gpx/, hooks/, config.ts
├── hooks/
│   ├── use-url-sync.ts          # Mirrors layer / view state to URL params
│   └── use-auto-focus-layer.ts  # Detail-page layer dimming
├── styles/app.css               # Tailwind + MapLibre + theme tokens + balloon-pin
└── types/mapky.ts               # TypeScript DTOs matching the indexer
```

## Data Flow

- **Writes**: Browser → Pubky homeserver (via `@synonymdev/pubky` SDK)
- **Reads**: Browser → pubky-nexus REST API (`/v0/mapky/` plugin routes)
- **Indexing**: pubky-nexus watcher → mapky-nexus-plugin → Neo4j + Redis
- **Routing snap**: Browser → Valhalla (proxied at `/valhalla/*` in dev → `valhalla1.openstreetmap.de`) for waypoint-to-polyline snapping

## Backend API (mapky-nexus-plugin)

Mounted at `/v0/mapky/`. See the plugin README for the full table; the app currently consumes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/viewport` | Place dots in the current bbox |
| `GET` | `/place/{osm_type}/{osm_id}` | Single place detail |
| `GET` | `/place/{osm_type}/{osm_id}/posts` | Posts for a place |
| `GET` | `/place/{osm_type}/{osm_id}/tags` | Universal tags on a place |
| `GET` | `/place/{osm_type}/{osm_id}/routes` | Public routes passing near a place |
| `GET` | `/posts/{author_id}/{post_id}/tags` | Tags on a Mapky post |
| `GET` | `/posts/user/{user_id}` | A user's posts |
| `GET` | `/incidents/viewport` and `/{author_id}/{incident_id}` | Incident reports |
| `GET` | `/geo_captures/viewport`, `/nearby`, `/user/{user_id}` | Geo-captures (photos, panoramas, sequences) |
| `GET` | `/sequences/user/{user_id}` | A user's capture sequences |
| `GET` | `/collections/user/{user_id}` | A user's place collections |
| `GET` | `/routes/viewport` | Routes that intersect a bbox (metadata only — body fetched from homeserver) |
| `GET` | `/routes/{author_id}/{route_id}` | Route metadata |
| `GET` | `/routes/{author_id}/{route_id}/tags` | Tags on a route |
| `GET` | `/routes/user/{user_id}` | A user's routes |
| `GET` | `/search/tags?q=` | Cross-resource tag search (places / collections / posts) |

## Routes & Directions Subsystem

The directions UI is a left-anchored sidebar (Google-Maps-style) backed by `route-creation-store.ts`. It serves three flows:

1. **Plan a new route** — `/directions[?from=...&to=...&via=...&mode=hiking]`. URL is the source of truth on initial mount; the store mirrors it back via `replaceState` so reloads and shared links round-trip. Both directions of the sync use `canonicalSearchKey()` (fixed `mode → from → to → via` order) to stop the JSON-stringify ping-pong that previously refired the URL → store effect on every navigate and clobbered the snapped polyline back to `null`.
2. **View a saved route** — `/route/{authorId}/{routeId}`. `RouteDetailPanel` fetches the metadata from the indexer and the body (waypoints + polyline) from the author's homeserver. On load the directions sidebar auto-populates via `loadFromExisting()`, which decodes the saved `body.geometry.polyline` up front so `primary.decoded` is populated immediately — no wasted re-snap to fill it in. Owners get "Save changes / Save as new"; non-owners get "Save as my route" only.
3. **Discover community routes** — search-only. There is no map overlay for routes (the previous dot-per-route layer was removed because metadata-only dots were not actionable). Use the search bar (places / tags) and the `/routes/{author}/{id}` detail page.

### Snap pipeline

`DirectionsBar.tsx` runs the auto-snap. Inputs: slots, activity, preferences, `computeNonce`. The snap effect:

- Builds a content signature `JSON.stringify({ wps[lat,lon], activity, preferences })` and short-circuits when it matches `lastSnappedSigRef` (covers Zustand store replacement, persist hydration, URL-sync reactions, etc.).
- The first run on a saved route adopts the existing geometry instead of re-snapping when `state.computed.engine === "valhalla"` and the polyline is already populated.
- Real edits debounce (`RECOMPUTE_DEBOUNCE_MS`), abort the previous request, and call Valhalla via `requestRoute()` with the activity-specific costing.
- The debounce handle lives in a ref (`debounceHandleRef`), not the effect's cleanup closure — so a same-sig re-render no longer cancels an in-flight snap.

### Activity costing (`src/lib/routing/activity-costing.ts`)

All foot modes share the `pedestrian` Valhalla costing; they differ only in **speed** and **path tolerance**:

| Activity | walking_speed | max_hiking_difficulty (SAC) | Notes |
|---|---|---|---|
| Walk | 5 km/h | 1 (paved/easy) | `step_penalty: 4` |
| Run  | 10 km/h | 1 (paved/easy) | `step_penalty: 8` |
| Hike | 5 km/h | 6 (expert alpine) | `walkway_factor: 0.7` to prefer trails |
| Cycle | — | — | costing `bicycle` |
| Drive | — | — | costing `auto` |

Walk and Hike share a single 5 km/h baseline because trail slowness is a property of the trail (gradient, surface), not the activity label, and Valhalla's flat `walking_speed` knob can't model that. The meaningful Walk-vs-Hike difference is path choice.

### Map-click waypoint picker

When a slot is in "Choose on map" mode, `RouteMapClickHandler` resolves the click via the shared `pickFeature` (`src/lib/map/pick-feature.ts`) — same layered picker that `MapView` uses for POI navigation. POI hits and place-label hits become `place` slots anchored to the real OSM element (with the feature's own point geometry as the snap target); only when nothing decodable is under the cursor does it fall back to a bare `coords` slot.

## Layers, Overlays, Basemaps

The Layers sheet (top-right floating button) consolidates everything visual:

- **Mapky data** — Places / Captures / Routes are mostly always-on; toggles persist via `ui-store`'s `partialize` (key `mapky-layers`). Detail pages auto-dim non-focused Mapky layers via `useAutoFocusLayer`.
- **Basemap** — Light / Dark / Satellite (Esri World Imagery). Satellite has a "Show place & road labels" hybrid sub-toggle that overlays Protomaps' symbol-only layers from the dark flavor with a forced strong-halo paint for readability over varied imagery.
- **Overlays** — independent raster/extrusion layers, each its own component:
  - `RailOverlayLayer` — OpenRailwayMap raster (rail / metro / signals).
  - `CyclingOverlayLayer` — CyclOSM raster (cycle infrastructure).
  - `TerrainOverlayLayer` — AWS Terrarium DEM rendered as MapLibre `hillshade`. Exaggeration fades to 0 by z=16 to mask the inevitable overzoom past Terrarium's z=15 cap.
  - `Buildings3DLayer` — `fill-extrusion` reading the `height` / `min_height` already on Protomaps' `buildings` source-layer. Inserted before the first symbol layer so labels stay on top.

Each overlay attaches a `styledata` listener so the source/layers re-attach themselves when `setStyle()` (theme/basemap swap) wipes them.

`MapLegends.tsx` stacks legend cards in the bottom-left for any overlays that have one (currently cycling and rail).

### `useUrlSync` (`src/hooks/use-url-sync.ts`)

Mirrors layer toggles + theme + basemap + map view to URL search params via `replaceState` (no history entries, no route changes). Hydration runs at module load so `MapView` reads center/zoom from the URL on first mount. Param keys: `th, bm, sl, pl, ca, mt, cy, tr, b3, z, c`. Only non-default values are written.

## Commands

- `npm run dev` — dev server on :5173 (Vite proxies `/v0/mapky` → Nexus, `/valhalla` → `valhalla1.openstreetmap.de`)
- `npm run build` — TypeScript check + production build
- `npm run preview` — preview production build
- `npm run lint` — ESLint
- `npm test` — Vitest

## Environment Variables

See `.env.example`. Key vars:
- `VITE_PUBKY_ENV` — testnet | staging | production
- `VITE_NEXUS_URL` — Base URL for pubky-nexus API
- `VITE_PROTOMAPS_URL` — PMTiles tile source URL
- `VITE_PROTOMAPS_KEY` — Protomaps API key (optional for free tier)

## Code Style

- TypeScript strict mode, prefer `type` imports
- Functional components with hooks only
- Tailwind CSS for styling; use `dark:` variant for dark mode
- TanStack Query for server state; Zustand only for client state
- Theme tokens defined in `src/styles/app.css`
- In dev, `window.__route` and `window.__map` expose the directions and map stores for quick debugging (gated by `import.meta.env.DEV`).

## Auth Patterns

Three methods, adapted from Eventky (`/home/gil/Repositories/eventky/`):
- **Recovery file**: `Keypair.fromRecoveryFile(data, passphrase)` → `signer.signin()`
- **Pubky Ring QR**: `pubky.startAuthFlow(caps, AuthFlowKind.signin(), relay)` → `flow.awaitApproval()`
- **Testnet signup**: `Keypair.random()` → `signer.signup(homeserverKey, token)` → write profile → download recovery file

Session persistence: Zustand `persist` stores `publicKey` + `sessionExport` + `seed` in localStorage. On reload, AuthProvider restores from seed (recovery) or session export (QR).

## Related Repos

- `../mapky-app-specs/` — Rust data models (MapkyAppPost, Route, Collection, …)
- `../mapky-nexus-plugin/` — Neo4j indexer plugin (Rust, implements NexusPlugin)
- `../../pubky/pubky-nexus/` — Host indexer with plugin system
- `../../pubky/pubky-docker/` — Docker dev infrastructure
