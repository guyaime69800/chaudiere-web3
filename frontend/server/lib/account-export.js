import { fail } from "./devis-security.js";
const JOINS = { maintenance_reminder_attempts: "maintenance_reminders", maintenance_reminder_audit: "maintenance_reminders", public_maintenance_reminder_attempts: "public_maintenance_reminders" };
export const EXPORT_TABLES = ["equipments", "interventions", "boiler_maintenance_certificates", "equipment_private_attachments", "thermodynamic_documents", "maintenance_reminders", "public_maintenance_reminders", "public_reminder_requests", "company_rge_qualifications", "equipment_plate_confirmations", "shiba_devis_simulations", "company_members", ...Object.keys(JOINS)];
const HIDDEN = new Set(["blob_url", "blob_pathname", "pdf_pathname", "verification_hash", "management_hash"]);
export function responsibleCompany(memberships) {
  if (memberships?.length !== 1 || !["admin", "owner"].includes(memberships[0].role))
    throw fail(403, "Seul le responsable peut gérer les dossiers de son entreprise.");
  return memberships[0].company_id;
}
export function cleanExportRow(row) { return Object.fromEntries(Object.entries(row).filter(([key]) => !HIDDEN.has(key))); }
export async function exportPage(database, memberships, table, offset = 0) {
  const companyId = responsibleCompany(memberships);
  if (!EXPORT_TABLES.includes(table) || !Number.isSafeInteger(offset) || offset < 0) throw fail(400, "Page d’export invalide.");
  const join=JOINS[table];
  const columns=table==="company_members"?"company_id,user_id,role":join?"*,"+join+"!inner(company_id)":"*";
  const { data, error } = await database.from(table).select(columns).eq(join?join+".company_id":"company_id", companyId)
    .order(table==="company_members"?"user_id":"id", { ascending: true }).range(offset, offset + 99);
  if (error || !Array.isArray(data) || data.some(row => (join?row[join]?.company_id:row.company_id) !== companyId))
    throw fail(503, "Export indisponible : aucune archive partielle ne sera annoncée comme complète.");
  const files = [];
  for (const row of data) {
    if (table === "equipment_private_attachments" && !row.deleted_at && row.blob_pathname)
      files.push({ table, id: row.id, equipmentId: row.equipment_id, name: row.original_filename, size: row.size_bytes, sha256: row.sha256 });
    if (table === "thermodynamic_documents" && row.pdf_pathname)
      files.push({ table, id: row.id, equipmentId: row.equipment_id, name: row.kind + ".pdf", size: row.pdf_size_bytes, sha256: row.pdf_sha256 });
  }
  return { rows: data.map(row=>{const clean=cleanExportRow(row);if(join){delete clean[join];clean.company_id=companyId;}return clean;}), files, next: data.length === 100 ? offset + 100 : null };
}
export async function exportManifest(database, user, memberships) {
  const companyId = responsibleCompany(memberships);
  const {data: company, error} = await database.from("companies")
    .select("id,name,siret,phone,email,address_line1,address_line2,postal_code,city,country,created_at").eq("id", companyId).single();
  if (error || company?.id !== companyId) throw fail(503, "Entreprise indisponible.");
  const {data: profile, error: profileError} = await database.from("profiles").select("id,full_name,job_title,created_at").eq("id", user.id).maybeSingle();
  if (profileError || (profile && profile.id !== user.id)) throw fail(503, "Profil indisponible.");
  return { format: "carnetpass-company-export-v2", exportedAt: new Date().toISOString(), account: {id: user.id, email: user.email, profile}, company, tables: EXPORT_TABLES,
    scope: "Dossiers techniques et fichiers privés de l’entreprise. Les notices constructeur partagées et les factures du service ne font pas partie de cette archive. Évitez de modifier les dossiers pendant l’export. Les factures restent téléchargeables depuis le compte." };
}
// Compatibility for callers expecting a single JSON. The browser uses pages to avoid response limits.
export async function buildCompanyExport(database, user, memberships) {
  const result = await exportManifest(database, user, memberships);
  result.records = {};
  let bytes=Buffer.byteLength(JSON.stringify(result));
  for (const table of EXPORT_TABLES) {
    const rows=[]; let offset=0;
    do { const page=await exportPage(database,memberships,table,offset); bytes+=Buffer.byteLength(JSON.stringify(page.rows));if(bytes>3*1024*1024)throw fail(413,"Utilisez le téléchargement complet en ZIP depuis les paramètres du compte.");rows.push(...page.rows); offset=page.next; } while(offset !== null);
    result.records[table]=rows;
  }
  return result;
}
