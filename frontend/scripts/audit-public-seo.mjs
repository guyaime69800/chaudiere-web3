import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const exec = promisify(execFile);
const output = path.resolve("../../output/seo-20261020");
await fs.mkdir(output, { recursive: true });
const preview = process.env.SEO_PREVIEW_ORIGIN || "https://carnetpass-82n9a7dr4-chaudiere-web3.vercel.app";
const urls = ["https://carnetpass.fr/", "https://www.carnetpass.fr/", "https://www.carnetpass.fr/robots.txt", "https://www.carnetpass.fr/sitemap.xml", ...["/", "/faq", "/mentions-legales", "/confidentialite", "/cookies", "/conditions-utilisation", "/conditions-commerciales", "/robots.txt", "/sitemap.xml", "/espace-pro", "/administration-interne", "/api/billing"].map(route => preview + route)];
const checks = await Promise.allSettled(urls.map(async (url, index) => {
  const { stdout } = await exec("curl.exe", ["-sS", "-L", "--max-time", "20", "-D", path.join(output, `http-${index}.headers`), "-w", "\n%{http_code}", url], { maxBuffer: 512 * 1024, timeout: 25000 });
  const marker = stdout.lastIndexOf("\n"); const html = stdout.slice(0, marker); const status = Number(stdout.slice(marker + 1));
  const headers = await fs.readFile(path.join(output, `http-${index}.headers`), "utf8");
  const title = /<title>(.*?)<\/title>/s.exec(html)?.[1] || null;
  if (url.startsWith(preview) && ["/", "/faq", "/mentions-legales", "/confidentialite", "/cookies", "/conditions-utilisation", "/conditions-commerciales"].includes(new URL(url).pathname)) {
    if (status !== 200 || !/X-Robots-Tag: noindex, nofollow/i.test(headers) || (html.match(/<h1\b/g) || []).length !== 1) throw new Error(`Preview public check failed: ${url}`);
  }
  await fs.writeFile(path.join(output, `http-${index}.body`), html);
  return { url, status, title, h1Count: (html.match(/<h1\b/g) || []).length, description: /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || null, canonical: /rel="canonical" href="([^"]*)"/.exec(html)?.[1] || null, metaRobots: /name="robots" content="([^"]*)"/.exec(html)?.[1] || null, xRobots: /X-Robots-Tag: ([^\r\n]*)/i.exec(headers)?.[1] || null, structuredData: /application\/ld\+json/.test(html), moduleScript: /type="module"/.test(html) };
}));
await fs.writeFile(path.join(output, "audit-http.json"), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
console.log(JSON.stringify(checks.map(item => item.status === "fulfilled" ? item.value : { error: item.reason.message }), null, 2));
if (checks.some(item => item.status === "rejected")) process.exitCode = 1;
