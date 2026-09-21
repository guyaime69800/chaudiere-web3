import { upload } from "@vercel/blob/client";
import { supabase } from "./supabaseClient";

const API_URL = "/api/equipment-attachments";

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw new Error("Session utilisateur absente.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function uploadEquipmentAttachment({
  file,
  equipmentId,
  interventionId = null,
  documentKind,
  title,
  description = "",
}) {
  if (!file) throw new Error("Fichier manquant.");

  const headers = await getAuthHeaders();

  return upload(file.name, file, {
    access: "private",
    handleUpload: async (body) => {
      const response = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...body,
          payload: {
            ...body.payload,
            equipmentId,
            interventionId,
            documentKind,
            title,
            description,
            mimeType: file.type,
            originalFilename: file.name,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Autorisation d’envoi refusée.");
      }

      return result;
    },
  });
}

export async function getAttachmentUrl(attachmentId, action = "view") {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_URL}?attachmentId=${encodeURIComponent(
      attachmentId
    )}&action=${action}`,
    { headers }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Document inaccessible.");
  }

  return result;
}

export async function deleteEquipmentAttachment(attachmentId) {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_URL}?attachmentId=${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
      headers,
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Suppression impossible.");
  }

  return result;
}