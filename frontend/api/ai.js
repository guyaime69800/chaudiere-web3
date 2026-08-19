export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: "Méthode non autorisée",
        },
        {
          status: 405,
        }
      );
    }

    const body = await request.json();

    const equipmentId = String(body?.equipmentId ?? "").trim();
    const question = String(body?.question ?? "").trim();

    if (!equipmentId || !question) {
      return Response.json(
        {
          error: "Équipement ou question manquant",
        },
        {
          status: 400,
        }
      );
    }

    return Response.json({
      ok: true,
      message: "API IA CarnetPass opérationnelle",
      equipmentId,
      question,
    });
  } catch (error) {
    console.error("Erreur API IA CarnetPass :", error);

    return Response.json(
      {
        error: "Erreur serveur",
      },
      {
        status: 500,
      }
    );
  }
}