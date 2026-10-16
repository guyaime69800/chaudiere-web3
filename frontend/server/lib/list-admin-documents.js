export async function listAdminDocuments(client, columns) {
  const documents = [];
  const batchSize = 250;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client.from("platform_document_intake").select(columns)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + batchSize - 1);
    if (error) return { data: null, error };
    documents.push(...data);
    if (data.length < batchSize) return { data: documents, error: null };
  }
}
