import { get } from "@vercel/blob";

export default async function handler(request) {
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.searchParams.get("pathname");

    if (!pathname) {
      return new Response("Document non précisé", {
        status: 400,
      });
    }

    const allowedPrefixes = [
      "saunier-duval/0010017388/notice/",
      "saunier-duval/0010017388/vue-eclatee/",
    ];

    const documentAutorise =
      allowedPrefixes.some((prefix) => pathname.startsWith(prefix)) &&
      pathname.toLowerCase().endsWith(".pdf");

    if (!documentAutorise) {
      return new Response("Document non autorisé", {
        status: 403,
      });
    }

    const result = await get(pathname, {
      access: "private",
    });

    if (!result || result.statusCode !== 200) {
      return new Response("Document introuvable", {
        status: 404,
      });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/pdf",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Erreur ouverture document :", error);

    return new Response("Erreur serveur", {
      status: 500,
    });
  }
}