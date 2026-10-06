import { get } from "@vercel/blob";
import elmLeblanc from "../src/data/equipment/elm-leblanc-7716704261.json" with { type: "json" };
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { technicalDocumentBlobLocation } from "../server/lib/technical-document-store.js";
import { platformDocumentCatalogAllowed, platformDocumentEnvironment } from "../server/lib/platform-document-environment.js";
import { discoveryDocumentsQuotaAvailable } from "../server/lib/shiba-quota.js";
import mcr2 from "../src/data/equipment/de-dietrich-7841749.json" with { type: "json" };
import naia from "../src/data/equipment/atlantic-021272.json" with { type: "json" };
import mira25 from "../src/data/equipment/chaffoteaux-3310543.json" with { type: "json" };
import mira30 from "../src/data/equipment/chaffoteaux-3310544.json" with { type: "json" };
import mira35 from "../src/data/equipment/chaffoteaux-3310545.json" with { type: "json" };
import frisquet from "../src/data/equipment/frisquet-hydromotrix-vent-23-2000.json" with { type: "json" };
import frisquet32 from "../src/data/equipment/frisquet-hydromotrix-vent-32.json" with { type: "json" };
import frisquet322000 from "../src/data/equipment/frisquet-hydromotrix-vent-32-2000.json" with { type: "json" };

const MCR_DOCUMENT_URLS = new Map(mcr2.documents
  .filter((document) => document.storage === "private")
  .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]));

const NAIA_DOCUMENT_URLS = new Map(naia.documents
  .filter((document) => document.storage === "private")
  .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]));

const CHAFFOTEAUX_DOCUMENT_URLS = new Map(
  [mira25, mira30, mira35].flatMap((equipment) =>
    equipment.documents
      .filter((document) => document.storage === "private")
      .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]),
  ),
);

const ELM_DOCUMENT_URLS = new Map(elmLeblanc.documents
  .filter((document) => document.storage === "private")
  .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]));

const FRISQUET_DOCUMENT_URLS = new Map([frisquet, frisquet32, frisquet322000].flatMap((equipment) => equipment.documents)
  .filter((document) => document.storage === "private")
  .map((document) => [new URL(document.documentUrl).pathname.slice(1), document.documentUrl]));

const DOCUMENTS = new Set([
  ...ELM_DOCUMENT_URLS.keys(),
  "saunier-duval/0010021497/03-Notice-d-installation-technique-THEMAPLUS-CONDENS-25-A.pdf",
  "saunier-duval/0010021497/04-Notice-d-utilisation-THEMAPLUS-CONDENS-25-A.pdf",
  "saunier-duval/0010021497/02-Vue-clat-e-THEMAPLUS-CONDENS-25-A.pdf",
  ...MCR_DOCUMENT_URLS.keys(),
  ...NAIA_DOCUMENT_URLS.keys(),
  ...CHAFFOTEAUX_DOCUMENT_URLS.keys(),
  ...FRISQUET_DOCUMENT_URLS.keys(),
]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  const environment = platformDocumentEnvironment(process.env);
  if (environment.status) return res.status(environment.status).json({ error: "Documents indisponibles." });
  if (!platformDocumentCatalogAllowed(environment.name, professional.accessKind)) {
    return res.status(403).json({ error: "Documents indisponibles pour ce compte." });
  }
  try {
    if (!await discoveryDocumentsQuotaAvailable(professional)) {
      return res.status(403).json({ code: "DISCOVERY_QUOTA_REACHED", error: "Les 20 questions de votre essai Découverte ont été utilisées. L’accès aux documents est terminé." });
    }
  } catch {
    return res.status(503).json({ error: "Vérification de l’accès aux documents momentanément indisponible." });
  }

  const pathname = req.query?.pathname;
  if (typeof pathname !== "string" || !DOCUMENTS.has(pathname)) {
    return res.status(404).json({ error: "Document introuvable." });
  }

  try {
    const documentUrl = ELM_DOCUMENT_URLS.get(pathname)
      ?? FRISQUET_DOCUMENT_URLS.get(pathname)
      ?? MCR_DOCUMENT_URLS.get(pathname)
      ?? NAIA_DOCUMENT_URLS.get(pathname)
      ?? CHAFFOTEAUX_DOCUMENT_URLS.get(pathname)
      ?? pathname;
    const result = await get(technicalDocumentBlobLocation(documentUrl, process.env), { access: "private" });

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
