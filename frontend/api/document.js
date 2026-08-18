import { issueSignedToken, presignUrl } from "@vercel/blob";

export default async function handler(request) {
  try {
    const url = new URL(request.url);
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

    const token = await issueSignedToken({
      operations: ["get"],
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: "get",
      validUntil: Date.now() + 5 * 60 * 1000,
    });

    return Response.redirect(presignedUrl, 302);
  } catch (error) {
    console.error("Erreur ouverture document :", error);

    return new Response("Erreur serveur", {
      status: 500,
    });
  }
}