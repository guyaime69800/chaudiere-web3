// Runs only after the signed upload callback has validated and saved the PDF.
export async function copyCompletedUploadToR2(db, pathname, environment, loadSource, migrate) {
  if (environment.name !== "production") return;
  const { data: entry, error } = await db.from("platform_document_intake")
    .select("id,blob_pathname,sha256,size_bytes").eq("blob_pathname", pathname).single();
  if (error || !entry) throw new Error("Upload tracking unavailable");
  // Await verification. A failure is surfaced to the callback for retry while
  // the saved intake record and original Blob remain intact.
  return migrate(db, entry, loadSource);
}
