import { publicPages, publicStyles } from "../generated/public-pages.js";
import { PUBLIC_ORIGIN, publicMetadata, isPublicPresentation } from "../../shared/public-site-metadata.js";

const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const baseStyles = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#faf7f2;color:#29211c;font:16px/1.65 system-ui,sans-serif}a{color:#9b320e;text-underline-offset:3px}a:focus-visible{outline:3px solid #245b9b;outline-offset:4px}main,.seo-header,.site-footer{width:min(1200px,100%);margin-inline:auto}main{padding:0 20px}.seo-header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:22px}.seo-header>a{font-size:24px;font-weight:800}.seo-header nav{display:flex;gap:22px;flex-wrap:wrap}.seo-skip{position:absolute;left:-9999px}.seo-skip:focus{left:10px;top:10px;background:white;padding:12px;z-index:10}img{max-width:100%;height:auto}p,a,h1,h2,h3{overflow-wrap:anywhere}.home-hero__visual{transform:none}.home-final a{color:#9b320e}@media(max-width:480px){main{padding:0 12px}.home-hero{padding:24px}.home-hero__copy h1{font-size:36px}.seo-header nav{gap:14px}}`;

export function publicHtml(pathname, { maintenance = true, production = false } = {}) {
  if (!isPublicPresentation(pathname)) throw new Error("Unknown public page");
  const { title, description } = publicMetadata[pathname];
  const canonical = PUBLIC_ORIGIN + (pathname === "/" ? "/" : pathname);
  const structured = pathname === "/" ? [
    { "@context": "https://schema.org", "@type": "Organization", "@id": `${PUBLIC_ORIGIN}/#organization`, name: "CarnetPass", url: `${PUBLIC_ORIGIN}/`, email: "contact@carnetpass.fr" },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${PUBLIC_ORIGIN}/#website`, name: "CarnetPass", url: `${PUBLIC_ORIGIN}/`, inLanguage: "fr-FR", publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } },
    { "@context": "https://schema.org", "@type": "WebApplication", name: "CarnetPass", url: `${PUBLIC_ORIGIN}/`, applicationCategory: "BusinessApplication", operatingSystem: "Navigateur Web", description },
  ] : [];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${production ? "index,follow" : "noindex,nofollow"}"><link rel="canonical" href="${canonical}"><link rel="icon" type="image/png" href="/icon-192.png?v=3"><meta property="og:type" content="website"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="CarnetPass"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${PUBLIC_ORIGIN}/icon-512.png"><meta property="og:image:alt" content="CarnetPass"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><style>${baseStyles}\n${publicStyles}</style>${structured.length ? `<script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script>` : ""}</head><body>${publicPages[pathname][maintenance ? "closed" : "open"]}</body></html>`;
}

export function publicResource(pathname, production) {
  if (pathname === "/robots.txt") return { type: "text/plain; charset=utf-8", body: production
    ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /appareil/\nDisallow: /rappel/\nDisallow: /administration-\nDisallow: /connexion\nDisallow: /inscription\nDisallow: /espace-\nDisallow: /parametres-compte\nDisallow: /securite-compte\nDisallow: /reinitialiser-mot-de-passe\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n" };
  if (pathname === "/sitemap.xml") return { type: "application/xml; charset=utf-8", body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${production ? Object.keys(publicMetadata).map(path => `<url><loc>${PUBLIC_ORIGIN}${path}</loc></url>`).join("") : ""}</urlset>` };
  return null;
}
