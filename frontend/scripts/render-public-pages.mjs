import fs from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { renderPublic } = await server.ssrLoadModule("/src/seo/render-public.jsx");
  const paths = ["/", "/faq", "/mentions-legales", "/confidentialite", "/cookies", "/conditions-utilisation", "/conditions-commerciales"];
  const pages = {};
  for (const pathname of paths) {
    pages[pathname] = {};
    for (const maintenance of [false, true]) {
      pages[pathname][maintenance ? "closed" : "open"] = renderPublic(pathname, maintenance)
        .replaceAll('/src/assets/simba-assistance-technique.webp', '/shiba-assistant.webp');
    }
  }
  const styles = (await Promise.all(["src/components/HomeLanding.css", "src/components/SiteFooter.css", "src/pages/InfoPages.css"].map(file => fs.readFile(file, "utf8")))).join("\n");
  await fs.mkdir("server/generated", { recursive: true });
  await fs.writeFile("server/generated/public-pages.js", `// Generated from the existing React pages by scripts/render-public-pages.mjs. No client data.\nexport const publicPages = ${JSON.stringify(pages)};\nexport const publicStyles = ${JSON.stringify(styles)};\n`);
  await fs.copyFile("src/assets/simba-assistance-technique.webp", "public/shiba-assistant.webp");
  console.log(`Pré-rendu : ${paths.length} pages publiques, maintenance ouverte/fermée.`);
} finally { await server.close(); }
