# MapKy E2E

Headless Playwright smoke tests for the routes feature. Drives the live
testnet stack end-to-end: signup → create route → save → verify indexer →
edit → GPX export/import → viewport layer.

## Prerequisites

1. Testnet stack running:
   ```bash
   ./scripts/start-mapky-testnet.sh
   ```
   This brings up homeserver, pkarr, Neo4j, Redis, nexus (with `mapky` plugin),
   and the Vite dev server on `:5173`.

2. Chromium binary (one-time):
   ```bash
   npx playwright install chromium
   ```

## Run

```bash
npm run e2e:routes
```

Output lands in `e2e/output/`:
- `01-landing.png` … `14-viewport-routes-layer.png` — visual proof of each
  phase.
- `exported.gpx` — the file used for the GPX round-trip.
- `results.json` — machine-readable assertions.

## Environment overrides

| Var | Default | Purpose |
|---|---|---|
| `MAPKY_APP_URL` | `http://localhost:5173` | Vite dev server |
| `NEXUS_URL` | `http://localhost:8080` | Nexus REST API |
| `NEO4J_URL` | `http://localhost:7474` | Neo4j HTTP API |
| `NEO4J_USER` / `NEO4J_PASS` | `neo4j` / `12345678` | Match `pubky-nexus/config-local/testnet/config.toml` |
