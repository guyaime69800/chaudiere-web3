import { uploadPresigned } from "@vercel/blob/client";
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

async function readApiResponse(response, fallbackMessage) {
    const result = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(result?.error || fallbackMessage);
    }

    return result;
}

function getFileExtension(file) {
    const extensions = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    };

    return extensions[file?.type] || "bin";
}

export async function getEquipmentAttachments(equipmentId, interventionId = null) {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams({ equipmentId });

    if (interventionId) query.set("interventionId", interventionId);

    const response = await fetch(`${API_URL}?${query.toString()}`, { headers });
    const result = await readApiResponse(
        response,
        "Chargement des pièces jointes impossible.",
    );

    return result.attachments || [];
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
    const accessToken = headers.Authorization.replace(/^Bearer\s+/i, "");
    const pathname = `equipment-attachments/${equipmentId}/${crypto.randomUUID()}.${getFileExtension(file)}`;
    const clientPayload = JSON.stringify({
        equipmentId,
        interventionId,
        documentKind,
        title,
        description,
        mimeType: file.type,
        originalFilename: file.name,
        accessToken,
    });
    return uploadPresigned(pathname, file, {
        access: "private",
        clientPayload,
        handleUploadUrl: API_URL,
    });
}

export async function getAttachmentFile(attachmentId, action = "view") {
    const headers = await getAuthHeaders();
    const response = await fetch(
        `${API_URL}?attachmentId=${encodeURIComponent(attachmentId)}&action=${action}`,
        { headers },
    );

    if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Document inaccessible.");
    }

    return response.blob();
}

export async function openEquipmentAttachment(attachmentId) {
    const previewWindow = window.open("", "_blank");

    try {
        const blob = await getAttachmentFile(attachmentId, "view");
        const objectUrl = URL.createObjectURL(blob);

        if (!previewWindow) {
            URL.revokeObjectURL(objectUrl);
            throw new Error("Autorise l'ouverture des fenêtres pour consulter ce document.");
        }

        previewWindow.opener = null;
        previewWindow.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
        previewWindow?.close();
        throw error;
    }
}

export async function downloadEquipmentAttachment(attachment) {
    const blob = await getAttachmentFile(attachment.id, "download");
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = attachment.originalFilename || "document-carnetpass";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export async function deleteEquipmentAttachment(attachmentId) {
    const headers = await getAuthHeaders();
    const response = await fetch(
        `${API_URL}?attachmentId=${encodeURIComponent(attachmentId)}`,
        { method: "DELETE", headers },
    );

    return readApiResponse(response, "Suppression impossible.");
}
