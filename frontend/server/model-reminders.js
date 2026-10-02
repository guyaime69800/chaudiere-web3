import { createClient } from "@supabase/supabase-js";
import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { summarizeModelReminders } from "./model-reminder-summary.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

async function readAll(query) {
  const rows = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await query().order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (rows.length > MAX_ROWS) throw new Error("MODEL_REMINDERS_LIMIT");
    if ((data || []).length < PAGE_SIZE) return rows;
  }
  throw new Error("MODEL_REMINDERS_LIMIT");
}

async function readForEquipmentIds(db, table, companyId, ids) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    rows.push(...await readAll(() => db.from(table)
      .select(table === "maintenance_reminders"
        ? "id,equipment_id,description,reminder_type,due_on,lead_days,status,notification_state"
        : "id,equipment_id,due_on,lead_days,status,notification_state")
      .eq("company_id", companyId)
      .in("equipment_id", batch)
      .in("status", ["active", "review_required"])));
    if (rows.length > MAX_ROWS) throw new Error("MODEL_REMINDERS_LIMIT");
  }
  return rows;
}

export default async function modelReminders(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée." });

  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  if (!["owner", "admin"].includes(professional.role)) {
    return res.status(403).json({ error: "Seul un administrateur de l’entreprise peut voir l’ensemble des rappels du modèle." });
  }

  const equipmentId = Array.isArray(req.query?.equipmentId) ? "" : req.query?.equipmentId;
  if (typeof equipmentId !== "string" || !UUID.test(equipmentId)) {
    return res.status(400).json({ error: "Équipement invalide." });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(503).json({ error: "Liste des rappels indisponible." });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: equipment, error: equipmentError } = await db.from("equipments")
      .select("id,brand,model,equipment_type")
      .eq("id", equipmentId).eq("company_id", professional.companyId).maybeSingle();
    if (equipmentError) throw equipmentError;
    if (!equipment) return res.status(404).json({ error: "Équipement introuvable dans votre entreprise." });

    const equipments = await readAll(() => db.from("equipments")
      .select("id,serial_number")
      .eq("company_id", professional.companyId)
      .eq("equipment_type", equipment.equipment_type)
      .eq("brand", equipment.brand)
      .eq("model", equipment.model));
    const ids = equipments.map((item) => item.id);
    const [professionalReminders, publicReminders] = await Promise.all([
      readForEquipmentIds(db, "maintenance_reminders", professional.companyId, ids),
      readForEquipmentIds(db, "public_maintenance_reminders", professional.companyId, ids),
    ]);

    return res.status(200).json({
      model: { brand: equipment.brand, name: equipment.model, equipmentType: equipment.equipment_type },
      ...summarizeModelReminders(equipments, professionalReminders, publicReminders),
    });
  } catch (error) {
    console.error("Rappels du modèle indisponibles :", error);
    return res.status(error.message === "MODEL_REMINDERS_LIMIT" ? 413 : 503)
      .json({ error: error.message === "MODEL_REMINDERS_LIMIT"
        ? "Ce modèle comporte trop de rappels pour cette vue. Contactez l’assistance."
        : "Les rappels de ce modèle sont momentanément indisponibles." });
  }
}
