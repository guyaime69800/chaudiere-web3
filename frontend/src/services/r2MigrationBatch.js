// Each request is persisted by the server before the next one begins.
// Resume can revisit documents safely: verified content is reused server-side.
export async function runR2MigrationBatch(documents, { copy, stopped = () => false, progress = () => {} }) {
  const unique = new Map(documents.filter(document => document.status === "approved"
    && document.distribution_confirmed_at && document.rag_error !== "deleted_by_admin")
    .map(document => [document.id, document]));
  const state = { total: unique.size, processed: 0, copied: 0, reused: 0, outcome: "running", current: null };
  for (const document of unique.values()) {
    if (stopped()) { state.outcome = "stopped"; progress({ ...state }); return state; }
    state.current = document;
    progress({ ...state });
    try {
      const result = await copy(document);
      if (result?.ok !== true || !["verified", "reused"].includes(result.outcome)) throw new Error("Résultat de copie incertain.");
      state.processed++;
      if (result.outcome === "verified") state.copied++;
      else state.reused++;
    } catch (cause) {
      state.outcome = "failed";
      state.reason = cause.message || "Copie interrompue.";
      progress({ ...state });
      return state;
    }
    progress({ ...state });
  }
  state.outcome = "completed";
  state.current = null;
  progress({ ...state });
  return state;
}
