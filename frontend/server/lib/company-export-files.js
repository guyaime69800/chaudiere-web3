import { get } from "@vercel/blob";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { responsibleCompany, EXPORT_TABLES } from "./account-export.js";
import { fail } from "./devis-security.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function exportCompanyFile(database, memberships, query, res, blobGet=get) {
  const companyId=responsibleCompany(memberships);
  if (!EXPORT_TABLES.includes(query.table) || !["equipment_private_attachments","thermodynamic_documents"].includes(query.table) || !uuid.test(query.id || "")) throw fail(400,"Fichier invalide.");
  const {data: row,error}=await database.from(query.table).select("*").eq("company_id",companyId).eq("id",query.id).maybeSingle();
  if(error || !row || row.company_id!==companyId || row.deleted_at) throw fail(404,"Fichier indisponible.");
  const attachment=query.table==="equipment_private_attachments";
  const pathname=attachment?row.blob_pathname:row.pdf_pathname;
  const prefix=attachment?"equipment-attachments/"+row.equipment_id+"/":"regulatory/"+companyId+"/"+row.equipment_id+"/"+row.id;
  if(!uuid.test(row.equipment_id) || !pathname?.startsWith(prefix) || pathname.includes("..")) throw fail(503,"Emplacement du fichier incompatible.");
  const file=await blobGet(pathname,{access:"private",useCache:false});
  const size=attachment?row.size_bytes:row.pdf_size_bytes;
  if(file?.statusCode!==200 || !file?.stream || file.blob?.pathname!==pathname || file.blob?.size!==size) throw fail(503,"Le fichier ne correspond pas au dossier.");
  res.setHeader("CDN-Cache-Control","no-store");
  res.setHeader("Vercel-CDN-Cache-Control","no-store");
  res.setHeader("Content-Type","application/octet-stream");
  res.setHeader("Content-Disposition",'attachment; filename="carnetpass-file"');
  res.setHeader("X-Content-Type-Options","nosniff");
  res.status(200);
  await pipeline(Readable.fromWeb(file.stream),res);
}
