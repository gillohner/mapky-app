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
│   └── login.tsx     # Auth page (3 methods)
├── components/
│   ├── map/          # MapView, MapkyPlacesLayer
│   ├── auth/         # AuthProvider, PubkyAuthWidget
│   ├── providers/    # QueryProvider
│   └── ThemeToggle   # Light/dark mode toggle
├── stores/
│   ├── auth-store.ts # Zustand: auth state + session persistence
│   └── map-store.ts  # Zustand: map instance, center/zoom, theme
├── lib/
│   ├── api/          # Axios client, TanStack Query hooks, API functions
│   ├── config.ts     # Environment config (Vite env vars)
│   ├── map/          # Protomaps protocol, map style
│   ├── pubky/        # Pubky SDK wrapper
│   └── nexus/        # Nexus ingestion utility
├── styles/app.css    # Tailwind + maplibre CSS + theme tokens
└── types/mapky.ts    # TypeScript types matching backend DTOs
```

## Data Flow

- **Writes**: Browser → Pubky homeserver (via `@synonymdev/pubky` SDK)
- **Reads**: Browser → pubky-nexus REST API (`/v0/mapky/` plugin routes)
- **Indexing**: pubky-nexus watcher → mapky-nexus-plugin → Neo4j + Redis

## Backend API (mapky-nexus-plugin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v0/mapky/viewport?min_lat&min_lon&max_lat&max_lon&limit` | Places in bounding box |
| GET | `/v0/mapky/place/{osm_type}/{osm_id}` | Single place detail |
| GET | `/v0/mapky/place/{osm_type}/{osm_id}/posts?skip&limit&reviews_only` | Posts for a place |
| GET | `/v0/mapky/posts/{author_id}/{post_id}/tags` | Tags on a post |

## Commands

- `npm run dev` — dev server on :5173
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
- Theme tokens defined in `src/styles/app.css` as `--color-mapky-*`

## Auth Patterns

Three methods, adapted from Eventky (`/home/gil/Repositories/eventky/`):
- **Recovery file**: `Keypair.fromRecoveryFile(data, passphrase)` → `signer.signin()`
- **Pubky Ring QR**: `pubky.startAuthFlow(caps, AuthFlowKind.signin(), relay)` → `flow.awaitApproval()`
- **Testnet signup**: `Keypair.random()` → `signer.signup(homeserverKey, token)` → write profile → download recovery file

Session persistence: Zustand `persist` stores `publicKey` + `sessionExport` + `seed` in localStorage. On reload, AuthProvider restores from seed (recovery) or session export (QR).

## Related Repos

- `../mapky-app-specs/` — Rust data models (MapkyAppPost, OsmRef, etc.)
- `../mapky-nexus-plugin/` — Neo4j indexer plugin (Rust, implements NexusPlugin)
- `../../pubky-nexus/` — Host indexer with plugin system
