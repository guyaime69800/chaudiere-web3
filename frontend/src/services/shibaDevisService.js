import { supabase } from "./supabaseClient";
export async function devisRequest(path, { body, method, query } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Connexion indisponible.");
  const response = await fetch(
    path + (query ? `?${new URLSearchParams(query)}` : ""),
    {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(path === "/api/aid-admin" ? 100000 : 35000),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error ||
        "Service indisponible. Vous pouvez continuer manuellement.",
    );
  return result;
}
export async function compressPlate(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file?.type) ||
    file.size > 10485760
  )
    throw new Error(
      "Choisissez une image JPEG, PNG ou WebP de moins de 10 Mo.",
    );
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 20000000)
      throw new Error("Photo trop grande : réduisez sa résolution.");
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size > 2000000)
      throw new Error("Image trop volumineuse après compression.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return {
      dataUrl,
      file: new File([blob], "plaque-confirmee.jpg", { type: "image/jpeg" }),
    };
  } finally {
    bitmap.close();
  }
}
