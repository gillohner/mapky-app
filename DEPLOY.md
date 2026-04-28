# Deployment notes

Quick reference for the things production needs that dev doesn't. Most
of MapKy works the same in production as in dev; the entries below are
specifically about *external* services the frontend talks to.

## Routing engine — Valhalla CORS

In dev we hit `valhalla1.openstreetmap.de` through the Vite proxy at
`/valhalla` (see `vite.config.ts`). The FOSSGIS instance returns CORS
headers on `200 OK` but **omits them on rate-limit (`429`) and other
4xx responses**, so a direct browser fetch to it would surface as an
opaque `NetworkError` whenever the upstream throttles a request — the
user never sees the friendly "Routing temporarily rate-limited" message
the API actually returns.

Production has no Vite proxy. Pick one:

### Option A — server-side reverse proxy (cheapest)

Terminate CORS on your own origin. Caddy / nginx example (Caddyfile):

```
mapky.app {
  ...
  reverse_proxy /valhalla/* https://valhalla1.openstreetmap.de {
    rewrite /valhalla{uri}
  }
  header /valhalla/* Access-Control-Allow-Origin "*"
}
```

Then set:

```
VITE_VALHALLA_URL=/valhalla/route
```

You're still bound by FOSSGIS's fair-use rate limits, but at least
errors are now readable and not blocked by the browser. Free.

### Option B — self-hosted Valhalla

Full control, no rate limits, but real ops cost: ~10–20 GB OSM extract
per region, multi-hour build, ~4–8 GB RAM at runtime.

```
docker run -d --name valhalla \
  -v $(pwd)/valhalla_tiles:/custom_files \
  -e tile_urls=https://download.geofabrik.de/europe/switzerland-latest.osm.pbf \
  -p 8002:8002 \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```

Set:

```
VITE_VALHALLA_URL=https://valhalla.your-domain.example/route
```

(Still wrap in a reverse proxy for TLS + CORS.)

### Option C — paid hosted (Stadia Maps / Mapbox)

Stadia Maps provides a Valhalla-compatible API. Set
`VITE_VALHALLA_URL=https://api.stadiamaps.com/route/v1?api_key=…`. Money
trade for ops time. Routing model is still Valhalla so behavior matches.

## Other env vars

See `.env.example` for the full list. The ones likely to differ from dev:

| Var | Dev default | Prod typical |
|---|---|---|
| `VITE_PUBKY_ENV` | `staging` | `production` |
| `VITE_NEXUS_URL` | `http://localhost:8080` | `https://nexus.your-domain.example` |
| `VITE_PROTOMAPS_URL` | `https://api.protomaps.com/tiles/v4.pmtiles` | (same, with paid key) or self-hosted PMTiles |
| `VITE_VALHALLA_URL` | `/valhalla/route` (Vite proxy) | one of A / B / C above |

## Indexer migrations

Some plugin changes need an idempotent Cypher migration on the existing
Neo4j graph. See `../mapky-nexus-plugin/migrations/` for the list.

For the current branch, run before bringing the new plugin online:

```bash
cypher-shell -a $NEO4J_URI -u $NEO4J_USER -p $NEO4J_PASSWORD \
  -f migrations/2026-04-27-route-start-lat-lon.cypher
```

This backfills `r.start_lat` / `r.start_lon` scalars on `:MapkyAppRoute`
nodes that were indexed before the plugin started writing them. Without
it, the routes-viewport overlay plots route start-pins at `(0, 0)`.

## Browser feature requirements

- **Geolocation** — used by directions "Use your location" picker. Falls
  back gracefully on denial.
- **Service Worker** — not used yet (offline maps is on the roadmap).
- **WebGL** — required by MapLibre.
- **Storage** — `localStorage` for auth + directions draft persistence;
  graceful no-op if unavailable.
