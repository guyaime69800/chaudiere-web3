import { get } from "@vercel/blob";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import mcr2 from "../src/data/equipment/de-dietrich-7841749.json" with { type: "json" };

const MCR_DOCUMENT_URLS = new Map(mcr2.documents
  .filter((document) => document.storage === "private")
  .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]));

const DOCUMENTS = new Set([
  "saunier-duval/0010021497/03-Notice-d-installation-technique-THEMAPLUS-CONDENS-25-A.pdf",
  "saunier-duval/0010021497/04-Notice-d-utilisation-THEMAPLUS-CONDENS-25-A.pdf",
  "saunier-duval/0010021497/02-Vue-clat-e-THEMAPLUS-CONDENS-25-A.pdf",
  ...MCR_DOCUMENT_URLS.keys(),
]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;

  const pathname = req.query?.pathname;
  if (typeof pathname !== "string" || !DOCUMENTS.has(pathname)) {
    return res.status(404).json({ error: "Document introuvable." });
  }

  try {
    const result = await get(MCR_DOCUMENT_URLS.get(pathname) ?? pathname, { access: "private" });
    if (!result?.stream || result.statusCode !== 200) {
      return res.status(404).json({ error: "Document introuvable." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(result.blob.size));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    await pipeline(Readable.fromWeb(result.stream), res);
  } catch (error) {
    console.error("Ouverture du document technique impossible :", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Document momentanément indisponible." });
    }
  }
}