import { Readable } from "node:stream";
import { get } from "@vercel/blob";

export default async function handler(request, response) {
  try {
    const pathname = Array.isArray(request.query.pathname)
      ? request.query.pathname[0]
      : request.query.pathname;

    if (!pathname) {
      return response.status(400).send("Document non précisé");
    }

    // Sécurité : pour l'instant, seuls les documents
    // de cette chaudière sont autorisés.
    const allowedPrefixes = [
      "saunier-duval/0010017388/notice/",
      "saunier-duval/0010017388/vue-eclatee/",
    ];

    const documentAutorise =
      allowedPrefixes.some((prefix) => pathname.startsWith(prefix)) &&
      pathname.toLowerCase().endsWith(".pdf");

    if (!documentAutorise) {
      return response.status(403).send("Document non autorisé");
    }

    const result = await get(pathname, {
      access: "private",
    });

    if (!result || result.statusCode !== 200) {
      return response.status(404).send("Document introuvable");
    }

    response.setHeader(
      "Content-Type",
      result.blob.contentType || "application/pdf"
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-cache");

    Readable.fromWeb(result.stream).pipe(response);
  } catch (error) {
    console.error("Erreur ouverture document :", error);
    return response.status(500).send("Erreur serveur");
  }
}