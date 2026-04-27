import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const failed = [];
page.on("response", (resp) => {
  const status = resp.status();
  if (status >= 400) {
    failed.push({
      status,
      url: resp.url(),
      method: resp.request().method(),
      from: resp.request().resourceType(),
    });
  }
});
page.on("requestfailed", (req) => {
  failed.push({
    status: "FAIL",
    url: req.url(),
    method: req.method(),
    from: req.resourceType(),
    error: req.failure()?.errorText,
  });
});

console.log("→ /");
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
console.log("→ /login");
await page.goto("http://localhost:5173/login", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
console.log("→ create test account");
const btn = page.getByRole("button", { name: /create test account/i });
if (await btn.count()) {
  await btn.click();
  // Wait for the SPA to auto-navigate post-signup. This is the real user
  // flow — a full-page goto before signup settles would abort in-flight
  // fetches and fill the trace with false ABORTED entries.
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}
// Belt-and-braces: give the SDK's background DHT republishing a moment to
// finish before any subsequent navigation aborts in-flight requests.
await page.waitForTimeout(3000);

console.log("→ /routes");
await page.goto("http://localhost:5173/routes", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
console.log("→ /routes/new");
await page.goto("http://localhost:5173/routes/new", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});

// Filter out non-user-facing noise. Three buckets:
//  - Test artifacts: Vite HMR script reloads aborting under us, SDK
//    background republishes aborted by ctx.close at end of test.
//  - SDK-internal: pkarr DHT lookup before the user is published returns
//    404; this is expected and the SDK retries.
//  - Intentional polling: ingestUserIntoNexus polls /v0/user/{pk} until
//    200, so a single 404 before the user becomes queryable is by design.
function isTestArtifact(f) {
  if (f.from === "script") return true;
  if (f.url.includes(":15411/") && f.method === "PUT") return true;
  if (f.url.includes(":6286/pub/pubky.app/") && f.method === "PUT") return true;
  if (f.url.includes("/v0/ingest/") && f.method === "PUT") return true;
  return false;
}

function isExpectedSdkOrPoll(f) {
  // pkarr DHT lookup before the user has published their record.
  if (f.url.includes(":15411/") && f.method === "GET" && f.status === 404) {
    return true;
  }
  // First attempt of the post-ingest poll inside ingestUserIntoNexus.
  if (
    f.url.includes("/v0/user/") &&
    f.method === "GET" &&
    f.status === 404
  ) {
    return true;
  }
  return false;
}

const real = failed.filter(
  (f) => !isTestArtifact(f) && !isExpectedSdkOrPoll(f),
);

console.log("\n=== User-facing failures (excluding SDK noise + intentional polling) ===");
if (real.length === 0) {
  console.log("(none)");
} else {
  for (const f of real) {
    console.log(`${f.status}  ${f.method.padEnd(5)} ${f.from.padEnd(8)} ${f.url}${f.error ? "  // " + f.error : ""}`);
  }
}
console.log(
  `\nUser-facing: ${real.length}  /  Test-artifact aborts: ${failed.filter(isTestArtifact).length}  /  SDK+poll: ${failed.filter(isExpectedSdkOrPoll).length}  /  Total: ${failed.length}`,
);

await ctx.close();
await browser.close();
