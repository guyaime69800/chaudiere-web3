import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import middleware from "../middleware.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/dev/carnetpass-documents/node_modules/playwright");
const output = path.resolve("../../output/seo-20261020");
await fs.mkdir(output, { recursive: true });
Object.assign(process.env, { VERCEL_ENV: "production", UPSTASH_REDIS_REST_KV_REST_API_URL: "https://redis.invalid", UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "isolated-test" });
const realFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ result: JSON.stringify({ enabled: true }) });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "https://www.carnetpass.fr");
    const result = await middleware(new Request(url, { method: req.method, headers: req.headers }));
    if (result.headers.get("x-middleware-next") === "1") {
      const asset = { "/shiba-assistant.webp": "image/webp", "/favicon.svg": "image/svg+xml", "/icon-512.png": "image/png" }[url.pathname];
      if (!asset) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": asset });
      res.end(await fs.readFile(path.join("public", url.pathname))); return;
    }
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch { res.writeHead(500); res.end("Isolated check error"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const target = process.env.SEO_PREVIEW_ORIGIN || origin;
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe" });
  for (const javaScriptEnabled of [true, false]) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ javaScriptEnabled, viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      const response = await page.goto(target, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator("h1").count(), 1);
      assert.match(await page.locator("body").innerText(), /temporairement fermé/);
      assert.equal(await page.locator('a[href="/inscription"],a[href="/connexion-interne"],a[href="/administration-interne"]').count(), 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false);
      const html = await response.text();
      const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
      assert.equal(JSON.parse(jsonLd).length, 3);
      assert.equal(await page.locator('script[src]').count(), 0);
      if (process.env.SEO_PREVIEW_ORIGIN) {
        assert.equal(response.headers()["x-robots-tag"], "noindex, nofollow");
        assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
      }
      const suffix = `${viewport.width}-${javaScriptEnabled ? "js" : "no-js"}`;
      await page.screenshot({ path: path.join(output, `accueil-${suffix}.png`), fullPage: true });
      await page.getByRole("link", { name: "Questions fréquentes", exact: true }).click();
      await page.getByRole("heading", { name: "Questions fréquentes", exact: true }).waitFor();
      assert.match(await page.title(), /Questions fréquentes/);
      assert.equal(await page.locator("h1").count(), 1);
      const privateResponse = await page.goto(target + "/espace-pro");
      assert.equal(privateResponse.status(), 503);
      assert.deepEqual(errors, []);
      results.push({ viewport, javaScriptEnabled, homeStatus: 200, privateStatus: 503, horizontalOverflow: overflow, htmlBytes: Buffer.byteLength(html), jsonLdValid: true, scriptBundleCount: 0, screenshot: `accueil-${suffix}.png` });
      await context.close();
    }
  }
  await fs.writeFile(path.join(output, process.env.SEO_PREVIEW_ORIGIN ? "verification-navigateur-preview.json" : "verification-navigateur-local.json"), JSON.stringify({ environment: process.env.SEO_PREVIEW_ORIGIN || "isolated local middleware, production policy, maintenance on, no real database", results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve)); globalThis.fetch = realFetch;
}
