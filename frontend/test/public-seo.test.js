import test from "node:test";
import assert from "node:assert/strict";
import middleware from "../middleware.js";
import { publicHtml, publicResource } from "../server/lib/public-site.js";
import { publicMetadata } from "../shared/public-site-metadata.js";

test("public HTML carries content, unique metadata, canonical URLs and truthful structured data", () => {
  const titles = new Set();
  for (const [path, meta] of Object.entries(publicMetadata)) {
    const html = publicHtml(path, { production: true, maintenance: true });
    titles.add(meta.title);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.ok(html.includes(`<title>${meta.title}</title>`));
    assert.ok(html.includes(`rel="canonical" href="https://www.carnetpass.fr${path}"`));
    assert.match(html, /name="description"/);
    assert.match(html, /rel="icon" type="image\/png" href="\/icon-192\.png\?v=3"/);
    assert.doesNotMatch(html, /href="\/favicon\.svg"/);
    assert.match(html, /name="robots" content="index,follow"/);
    assert.doesNotMatch(html, /src="\/src\/|type="module"|connexion-interne|administration-interne|Accès équipe/);
  }
  assert.equal(titles.size, 7);
  const home = publicHtml("/", { production: true, maintenance: true });
  assert.match(home, /chaudières, pompes à chaleur, climatisations et VMC/);
  assert.match(home, /temporairement fermé/);
  assert.doesNotMatch(home, /href="\/(?:inscription|connexion|espace-pro)"/);
  const structured = JSON.parse(home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(structured.map(item => item["@type"]), ["Organization", "WebSite", "WebApplication"]);
  assert.doesNotMatch(JSON.stringify(structured), /aggregateRating|review|offers/);
  assert.match(publicResource("/robots.txt", true).body, /Allow: \/\n/);
  assert.doesNotMatch(publicResource("/robots.txt", true).body, /Disallow: \/assets/);
  const sitemap = publicResource("/sitemap.xml", true).body;
  assert.equal((sitemap.match(/<loc>/g) || []).length, 7);
  assert.doesNotMatch(sitemap, /appareil|api\/|token|administration|espace-pro/);
  assert.equal((publicResource("/sitemap.xml", false).body.match(/<loc>/g) || []).length, 0);
});

test("maintenance leaves only exact public pages open, preserves API/space restrictions, and Preview stays noindex", async () => {
  const previous = { env: { ...process.env }, fetch: globalThis.fetch };
  try {
    Object.assign(process.env, { VERCEL_ENV: "production", UPSTASH_REDIS_REST_KV_REST_API_URL: "https://redis.invalid", UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "test" });
    globalThis.fetch = async () => Response.json({ result: JSON.stringify({ enabled: true }) });
    for (const path of ["/", "/faq", "/mentions-legales", "/robots.txt", "/sitemap.xml"]) {
      const response = await middleware(new Request(`https://www.carnetpass.fr${path}`));
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
      assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
      assert.match(response.headers.get("Cache-Control"), /no-store/);
    }
    for (const path of ["/espace-pro", "/espace-particulier", "/rechercher-appareil", "/inscription", "/appareil/token-secret", "/api/billing", "/api/platform-admin-documents"]) {
      const response = await middleware(new Request(`https://www.carnetpass.fr${path}`));
      assert.equal(response.status, path === '/api/platform-admin-documents' ? 401 : 503, path);
      assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    }
    const admin = await middleware(new Request("https://www.carnetpass.fr/administration-interne"));
    assert.equal(admin.status, 401);
    assert.doesNotMatch(await admin.text(), /Entreprises|Importer|maintenance-control/);
    const login = await middleware(new Request("https://www.carnetpass.fr/connexion-interne"));
    assert.equal(login.headers.get("x-middleware-next"), "1");
    assert.equal(login.headers.get("X-Robots-Tag"), "noindex, nofollow");
    const trailing = await middleware(new Request("https://www.carnetpass.fr/faq/"));
    assert.equal(trailing.status, 308);
    const head = await middleware(new Request("https://www.carnetpass.fr/", { method: "HEAD" }));
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    // Unavailable maintenance storage may not open any app; public presentation remains safe.
    globalThis.fetch = async () => { throw new Error("unavailable"); };
    assert.equal((await middleware(new Request("https://www.carnetpass.fr/"))).status, 200);
    assert.equal((await middleware(new Request("https://www.carnetpass.fr/espace-pro"))).status, 503);
    process.env.VERCEL_ENV = "preview";
    const preview = await middleware(new Request("https://preview.vercel.app/"));
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.match(await preview.text(), /name="robots" content="noindex,nofollow"/);
    assert.equal((await middleware(new Request("https://preview.vercel.app/assets/main.js"))).headers.get("X-Robots-Tag"), "noindex, nofollow");
  } finally {
    globalThis.fetch = previous.fetch;
    for (const key of Object.keys(process.env)) if (!(key in previous.env)) delete process.env[key];
    Object.assign(process.env, previous.env);
  }
});
