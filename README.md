# mapky-app

Vite + React + TypeScript PWA for [MapKy](https://github.com/gillohner/mapky), a decentralized social layer on OpenStreetMap built on the [Pubky](https://pubky.tech) protocol.

The app is a thin client: it writes user-owned blobs to a Pubky homeserver and reads indexed views from [`mapky-nexus-plugin`](https://github.com/gillohner/mapky-nexus-plugin). The map is MapLibre GL JS over Protomaps vector tiles.

## What's in the app

- **Places & POIs** — click any OSM POI / place / building to open a detail panel with tags, posts, reviews, photos, and routes that pass near it.
- **Posts, reviews & threads** — comments, ratings, replies on places.
- **Geo-captures** — photos, panoramas, video / 360, audio, point clouds. Sequences support a continuous-trajectory viewer.
- **Routes** — plan turn-by-turn directions (Walk / Run / Hike / Bike / Drive) via Valhalla. Save them, tag them, share via URL. Open someone else's route to auto-load it into the directions sidebar; owners can save edits in place, non-owners save as a copy.
- **Collections** — named lists of places, with map overlays.
- **Layers sheet** — top-right floating button. Toggles for Mapky data + basemap (Light / Dark / Satellite hybrid) + free overlays (rail, cycling, terrain hillshade, 3D buildings).
- **URL sync** — layer state, basemap, theme, and map view live in the URL so any view is shareable.

## Commands

```bash
npm install
npm run dev       # dev server on :5173
npm run build     # type-check + production build
npm run lint
npm test          # vitest
```

## Configure

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
|---|---|
| `VITE_PUBKY_ENV` | `testnet` / `staging` / `production` |
| `VITE_NEXUS_URL` | Base URL of the [pubky-nexus](https://github.com/pubky/pubky-nexus) instance running with `--features mapky` |
| `VITE_PROTOMAPS_URL` | PMTiles tile source URL |
| `VITE_PROTOMAPS_KEY` | Protomaps API key (optional for free tier) |

In dev, the Vite proxy maps:
- `/v0/mapky/*` → the configured Nexus URL
- `/valhalla/*` → `https://valhalla1.openstreetmap.de/` (used for routing snap)

## Architecture & deeper notes

See [`CLAUDE.md`](./CLAUDE.md) for the full file structure, route subsystem details (URL ⇄ store sync, snap dedup, POI-aware picker, walk-vs-hike costing), layer sheet wiring, and auth patterns.

## Related repos

- [`mapky-app-specs`](https://github.com/gillohner/mapky-app-specs) — Rust/WASM data models the app consumes
- [`mapky-nexus-plugin`](https://github.com/gillohner/mapky-nexus-plugin) — the Neo4j indexer this app reads from
