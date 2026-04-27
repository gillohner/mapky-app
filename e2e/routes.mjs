#!/usr/bin/env node
// Full E2E driver for the MapKy Routes feature with the Google-Maps-style
// directions UI. Headless Chromium via Playwright; screenshots in e2e/output/.
//
// Prereqs:
//   ./scripts/start-mapky-testnet.sh
//   npx playwright install chromium
//
// Run:  npm run e2e:routes

import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "output");
mkdirSync(OUTPUT_DIR, { recursive: true });

const BASE = process.env.MAPKY_APP_URL ?? "http://localhost:5173";
const NEXUS = process.env.NEXUS_URL ?? "http://localhost:8080";
const NEO4J_URL = process.env.NEO4J_URL ?? "http://localhost:7474";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS ?? "12345678";

const log = (...a) => console.log("[e2e]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const path = `${OUTPUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  log(`shot → ${path}`);
}

const results = {};

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));

// Helper: drive map clicks from inside the page so the test doesn't fight
// against the directions bar's hit-testing for clicks at fixed pixel coords.
async function pickOnMapAt(slotIndex, pixelX, pixelY) {
  await page.evaluate((idx) => {
    // @ts-expect-error — dev-only hook
    window.__route?.getState?.().setPickingForSlot?.(idx);
  }, slotIndex);
  await page.mouse.click(pixelX, pixelY);
  await sleep(400);
}

try {
  // ── Phase 1: signup ──────────────────────────────────────────────────────
  log("→ phase 1: load + signup");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await sleep(1000);
  await shot(page, "01-landing");

  await page.goto(`${BASE}/login`);
  await sleep(800);
  await shot(page, "02-login");
  const signupBtn = page.getByRole("button", { name: /create test account/i });
  if (!(await signupBtn.count())) throw new Error("testnet signup button missing");
  await signupBtn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await shot(page, "03-after-signup");

  results.signedIn = await page.evaluate(() =>
    localStorage.getItem("mapky-auth")?.includes("publicKey") ?? false,
  );
  const pubkey = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("mapky-auth");
      return JSON.parse(raw)?.state?.publicKey ?? null;
    } catch {
      return null;
    }
  });
  log("publicKey:", pubkey);
  results.publicKey = pubkey;
  if (!pubkey) throw new Error("signup did not populate auth store");

  // ── Phase 2: open directions via store (dev-only window.__route) ────────
  log("→ phase 2: open directions UI");
  await page.evaluate(() => {
    // @ts-expect-error — dev-only hook from route-creation-store.ts
    window.__route?.getState?.().open?.("create");
  });
  await sleep(1500);
  await shot(page, "04-directions-empty");

  // ── Phase 3: drop 3 waypoints via map clicks ─────────────────────────────
  log("→ phase 3: pick 3 waypoints");
  // Directions UI is a left sidebar (~380 px on md+) plus a 48 px icon
  // rail. Click safely inside the visible map area: x ≥ 480.
  const points = [
    { i: 0, x: 560, y: 480 }, // From
    { i: 1, x: 1100, y: 480 }, // To (we'll add a stop after)
  ];
  for (const p of points) {
    await pickOnMapAt(p.i, p.x, p.y);
  }
  await shot(page, "05-from-to-set");

  // Add a stop and pick it on the map
  await page.evaluate(() => {
    // @ts-expect-error — dev hook
    window.__route?.getState?.().addStop?.();
  });
  await sleep(300);
  // Stop is inserted before destination → index 1.
  await pickOnMapAt(1, 800, 350);
  await shot(page, "06-with-stop");

  log("  waiting for snap…");
  await sleep(7000);
  await shot(page, "07-after-snap");

  // ── Phase 4: switch to Cycling, observe re-snap ──────────────────────────
  log("→ phase 4: switch mode to Cycling");
  await page.getByRole("button", { name: /^Bike$/ }).first().click();
  await sleep(4000);
  await shot(page, "08-bike-snap");

  const summaryText = await page.evaluate(() => document.body.innerText);
  results.distanceVisible = /\d+(\.\d+)?\s*(km|m)/.test(summaryText);
  results.timeVisible = /\d+\s*(min|h)/.test(summaryText);
  log("  visible stats:", { distanceVisible: results.distanceVisible, timeVisible: results.timeVisible });

  // ── Phase 5: save (two-step) ─────────────────────────────────────────────
  log("→ phase 5: save (two-step)");
  // Step 1: click "Save to my routes" (visible because authed)
  // The primary save button: in the directions sidebar it's labeled
  // "Save" (icon + label). Match a permissive regex so a future label
  // tweak doesn't break the test.
  await page.getByRole("button", { name: /^Save$|^Sign in to save$/i }).first().click();
  await sleep(700);
  await shot(page, "09-save-form");
  // Step 2: fill name + click Save
  const nameInput = page.locator('input[placeholder="Route name"]').first();
  await nameInput.fill("E2E Smoke Loop");
  await page.getByRole("button", { name: /^Save route$/ }).click();
  await page.waitForURL(/\/route\/[^/]+\/[^/]+$/, { timeout: 15000 });
  await sleep(3000);
  const detailUrl = page.url();
  results.detailUrl = detailUrl;
  await shot(page, "10-detail");
  const routeId = detailUrl.split("/").pop();
  results.routeId = routeId;

  // ── Phase 6: verify nexus + neo4j ───────────────────────────────────────
  log("→ phase 6: verify indexer");
  let metaOk = false;
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`${NEXUS}/v0/mapky/routes/${pubkey}/${routeId}`);
    if (r.ok) {
      results.routeMeta = await r.json();
      metaOk = true;
      break;
    }
    await sleep(1000);
  }
  results.indexed = metaOk;
  log("  indexed:", metaOk, results.routeMeta?.name);

  const cypherRes = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString("base64"),
    },
    body: JSON.stringify({
      statements: [
        {
          statement:
            "MATCH (u:User {id: $uid})-[:CREATED]->(r:MapkyAppRoute) RETURN r.id, r.name, r.waypoint_count, r.distance_m",
          parameters: { uid: pubkey },
        },
      ],
    }),
  });
  const cypherJson = await cypherRes.json();
  results.neo4jRows = cypherJson?.results?.[0]?.data?.length ?? 0;
  log("  neo4j rows:", results.neo4jRows);

  // ── Phase 7: GPX export ──────────────────────────────────────────────────
  log("→ phase 7: GPX export");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.getByRole("button", { name: /^GPX$/ }).click(),
  ]);
  const gpxPath = `${OUTPUT_DIR}/exported.gpx`;
  await download.saveAs(gpxPath);
  const gpxText = readFileSync(gpxPath, "utf8");
  results.gpxBytes = gpxText.length;
  results.gpxHasRte = gpxText.includes("<rte>");
  results.gpxHasTrk = gpxText.includes("<trk>");
  log("  gpx:", { bytes: results.gpxBytes, hasRte: results.gpxHasRte, hasTrk: results.gpxHasTrk });

  // ── Phase 8: edit creates new ────────────────────────────────────────────
  log("→ phase 8: edit creates new");
  await page.getByRole("button", { name: /Edit \(creates new\)/i }).click();
  // After edit, we end up at "/" with directions opened, slots prefilled.
  await sleep(2500);
  await shot(page, "11-edit-loaded");
  // Tweak: switch to Walk via the FootPill (Walk/Run/Hike are grouped).
  // Both desktop and mobile variants exist in the DOM (md:hidden /
  // hidden md:flex), so scope to the first visible one.
  await page.getByLabel("Foot travel modes").first().click();
  await sleep(200);
  await page.getByRole("button", { name: /^Walk\b/ }).first().click();
  await sleep(4000);
  // The primary save button: in the directions sidebar it's labeled
  // "Save" (icon + label). Match a permissive regex so a future label
  // tweak doesn't break the test.
  await page.getByRole("button", { name: /^Save$|^Sign in to save$/i }).first().click();
  await sleep(500);
  await page.locator('input[placeholder="Route name"]').first().fill("E2E Smoke Loop v2");
  await page.getByRole("button", { name: /^Save route$/ }).click();
  await page.waitForURL(/\/route\/[^/]+\/[^/]+$/, { timeout: 15000 });
  await sleep(2000);
  const detail2Url = page.url();
  results.detail2Url = detail2Url;
  results.editIsNewId = !detail2Url.endsWith(routeId);
  log("  detail2:", detail2Url, "newId?", results.editIsNewId);
  await shot(page, "12-detail-v2");

  // ── Phase 9: place card "Directions" entry ───────────────────────────────
  log("→ phase 9: place-card Directions entry");
  await page.goto(`${BASE}/`);
  await sleep(1500);
  // Open directions from a known place (Zurich HB area) by navigating to
  // a place page directly, then clicking Directions.
  // Find any indexed place via the API to seed.
  const viewportPlaces = await fetch(
    `${NEXUS}/v0/mapky/viewport?min_lat=47.3&min_lon=8.4&max_lat=47.4&max_lon=8.6&limit=1`,
  ).then((r) => r.json());
  if (viewportPlaces?.[0]) {
    const p = viewportPlaces[0];
    await page.goto(`${BASE}/place/${p.osm_type}/${p.osm_id}`);
    await sleep(2000);
    const directionsBtn = page.getByRole("button", { name: /^Directions$/ });
    if (await directionsBtn.count()) {
      await directionsBtn.first().click();
      await sleep(1500);
      await shot(page, "13-directions-from-place");
      results.placeDirectionsOk = true;
    } else {
      log("  WARN: place-card Directions button not found");
      results.placeDirectionsOk = false;
    }
  } else {
    log("  WARN: no indexed place available for place-card test");
    results.placeDirectionsOk = false;
  }

  log("✓ E2E suite finished");
} catch (err) {
  results.error = err?.stack ?? String(err);
  log("✗ E2E error:", err?.message ?? err);
  await shot(page, "ERROR-final-state").catch(() => {});
}

results.consoleErrors = consoleErrors.slice(0, 30);
writeFileSync(`${OUTPUT_DIR}/results.json`, JSON.stringify(results, null, 2));
log(`results saved → ${OUTPUT_DIR}/results.json`);

await ctx.close();
await browser.close();

if (results.error) process.exitCode = 1;
