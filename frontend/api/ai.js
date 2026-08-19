export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return response.status(405).json({
        error: "Méthode non autorisée",
      });
    }

    const body = request.body ?? {};

    const equipmentId = String(body?.equipmentId ?? "").trim();
    const question = String(body?.question ?? "").trim();

    if (!equipmentId || !question) {
      return response.status(400).json({
        error: "Équipement ou question manquant",
      });
    }

    return response.status(200).json({
      ok: true,
      message: "API IA CarnetPass opérationnelle",
      equipmentId,
      question,
    });
  } catch (error) {
    console.error("Erreur API IA CarnetPass :", error);

    return response.status(500).json({
      error: "Erreur serveur",
    });
  }
}