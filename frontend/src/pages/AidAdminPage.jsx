import { useState } from "react";
import { Link } from "react-router-dom";
import { devisRequest } from "../services/shibaDevisService";
import { qualifiedRge } from "../../shared/aid-engine.js";
import "./ShibaDevisPage.css";
const statuses = {
  draft: "Brouillon",
  validated: "Validé",
  published: "Publié",
  suspended: "Suspendu",
  archived: "Archivé",
};
export default function AidAdminPage() {
  const [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState(""),
    [note, setNote] = useState(""),
    [verificationSources, setVerificationSources] = useState({});
  async function refresh() {
    setData({
      ...(await devisRequest("/api/aid-admin")),
      checkedAt: Date.now(),
    });
  }
  async function run(body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = body ? await devisRequest("/api/aid-admin", { body }) : null;
      await refresh();
      setMessage(
        r?.outcomes
          ? `Vérification terminée : ${r.outcomes.length} source(s) consultée(s). Aucun barème publié automatiquement.`
          : "Chargement ou action terminé.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function draft() {
    try {
      const rule = JSON.parse(editor);
      run({ action: "draft", rule });
    } catch {
      setError("Le JSON du dispositif est invalide.");
    }
  }
  return (
    <main className="devis-page">
      <Link to="/administration-interne">← Administration CarnetPass</Link>
      <h1>Référentiel des aides et vérification RGE</h1>
      <p>
        Accès réservé aux administrateurs autorisés. Chaque publication
        nécessite une validation des règles, plafonds, dates et sources
        officielles. Les textes détectés sont des propositions à examiner.
      </p>
      <p>La pause du site reste indépendante de cette page.</p>
      <div className="devis-actions">
        <button
          className="devis-secondary"
          disabled={busy}
          onClick={() => run()}
        >
          Charger / actualiser
        </button>
        <button
          className="devis-secondary"
          disabled={busy}
          onClick={() => run({ action: "watch" })}
        >
          Vérifier maintenant
        </button>
        {data && !data.versions.length && (
          <button
            className="devis-secondary"
            disabled={busy}
            onClick={() => run({ action: "seed" })}
          >
            Préparer les brouillons officiels à contrôler
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <section className="devis-panel">
            <h2>Versions et validation</h2>
            <label className="devis-field">
              <span>Note de contrôle (20 caractères minimum pour valider)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder="Conditions, plafonds, cumul, dates et différences contrôlées…"
              />
            </label>
            {data.versions.map((v) => {
              const stale =
                !v.validated_at ||
                data.checkedAt - Date.parse(v.validated_at) >
                  v.rule.freshnessDays * 86400000;
              const expired =
                v.rule.effectiveUntil &&
                v.rule.effectiveUntil < new Date().toISOString().slice(0, 10);
              return (
                <article className="devis-panel" key={v.id}>
                  <h3>
                    {v.rule.name} · v{v.version} · {statuses[v.status]}
                  </h3>
                  <p>
                    Période : {v.rule.effectiveFrom} →{" "}
                    {v.rule.effectiveUntil || "Sans fin définie"}. Validation :{" "}
                    {v.validated_at || "Absente"} · auteur{" "}
                    {v.validated_by || "Aucun"}.
                  </p>
                  {(stale || expired) && (
                    <p role="status">
                      À revoir :{" "}
                      {expired
                        ? "période expirée"
                        : "validation absente ou trop ancienne"}
                      .
                    </p>
                  )}
                  <p>Fraîcheur du dispositif : {v.rule.freshnessDays} jours.</p>
                  <details>
                    <summary>
                      Règles, plafonds et sources de cette version
                    </summary>
                    <pre className="devis-rule-json">
                      {JSON.stringify(v.rule, null, 2)}
                    </pre>
                  </details>
                  <div className="devis-actions">
                    <button
                      disabled={busy}
                      onClick={() => setEditor(JSON.stringify(v.rule, null, 2))}
                    >
                      Préparer une nouvelle version
                    </button>
                    {v.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "validate", id: v.id, note })
                        }
                      >
                        Valider après contrôle
                      </button>
                    )}
                    {v.status === "validated" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "publish", id: v.id, note })
                        }
                      >
                        Publier cette version validée
                      </button>
                    )}
                    {v.status === "published" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "suspend", id: v.id, note })
                        }
                      >
                        Suspendre
                      </button>
                    )}
                    {v.status === "archived" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "rollback", id: v.id, note })
                        }
                      >
                        Revenir à cette version si encore valide
                      </button>
                    )}
                    {["draft", "validated", "suspended"].includes(v.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "archive", id: v.id, note })
                        }
                      >
                        Archiver
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <h3>Nouveau brouillon structuré</h3>
            <p>
              Modifier le texte ne change jamais une version existante. Les
              sources doivent appartenir à la liste officielle autorisée ; leur
              période doit être confirmée.
            </p>
            <label className="devis-field">
              <span>Règles du dispositif (JSON)</span>
              <textarea
                className="devis-rule-json"
                rows={18}
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
                maxLength={100000}
              />
            </label>
            <button disabled={busy || !editor} onClick={draft}>
              Enregistrer une nouvelle version brouillon
            </button>
          </section>
          <section className="devis-panel">
            <h2>Veille et fraîcheur des sources</h2>
            <p>
              Vérification tous les 7 jours par défaut, exécutée par la tâche
              existante. Huit sources au maximum par passage ; les plus
              anciennes passent d’abord. Un échec conserve la date du dernier
              succès.
            </p>
            {data.sources.map((s) => (
              <SourceSettings key={s.url} source={s} busy={busy} run={run} />
            ))}
            {data.observations.map((o) => (
              <details key={o.id}>
                <summary>
                  {o.created_at} · {o.outcome} · {o.source_url}{" "}
                  {o.reviewed_at ? "· Examiné" : "· À examiner"}
                </summary>
                {o.detail && <p>{o.detail}</p>}
                <div className="devis-grid">
                  <div>
                    <h3>Texte précédent</h3>
                    <pre className="devis-rule-json">
                      {o.previous_text || "Aucun texte précédent"}
                    </pre>
                  </div>
                  <div>
                    <h3>Proposition détectée</h3>
                    <pre className="devis-rule-json">
                      {o.proposed_text || "Aucune consultation réussie"}
                    </pre>
                  </div>
                </div>
                <p>
                  Cette observation n’a modifié aucun barème. Préparez et
                  validez une nouvelle version si nécessaire.
                </p>
                <button
                  disabled={busy || !!o.reviewed_at}
                  onClick={() =>
                    run({ action: "review-observation", id: o.id })
                  }
                >
                  Marquer comme examiné
                </button>
              </details>
            ))}
          </section>
          <section className="devis-panel">
            <h2>Qualifications RGE à contrôler</h2>
            <a
              href="https://france-renov.gouv.fr/annuaire-rge/identifier"
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir l’annuaire officiel RGE
            </a>
            {data.qualifications.map((q) => (
              <article className="devis-panel" key={q.id}>
                <h3>
                  {q.siret} · {q.organism} · {q.qualification_reference}
                </h3>
                <p>
                  {q.domains.join(", ")} · {q.valid_from} → {q.valid_until}
                </p>
                <p>
                  {
                    qualifiedRge(q, {
                      siret: q.siret,
                      domain: q.domains[0],
                      date: new Date().toISOString().slice(0, 10),
                    }).message
                  }
                </p>
                <p>
                  Justificatif privé :{" "}
                  {q.proof_attachment_id
                    ? "Joint au dossier ; ne vaut pas vérification"
                    : "Non joint"}
                  . Source : {q.verification_source || "Non vérifiée"} · date{" "}
                  {q.verified_at || "Absente"}.
                </p>
                <label className="devis-field">
                  <span>
                    Lien officiel utilisé pour vérifier le SIRET, tous les
                    domaines et les dates
                  </span>
                  <input
                    type="url"
                    value={verificationSources[q.id] || ""}
                    onChange={(e) =>
                      setVerificationSources((s) => ({
                        ...s,
                        [q.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    run({
                      action: "verify-rge",
                      id: q.id,
                      source: verificationSources[q.id],
                      confirmOfficial: true,
                    })
                  }
                >
                  Confirmer mon contrôle manuel dans l’annuaire
                </button>{" "}
                <button
                  disabled={busy || !q.verified_at}
                  onClick={() => run({ action: "revoke-rge", id: q.id })}
                >
                  Retirer la vérification
                </button>
              </article>
            ))}
          </section>
          <section className="devis-panel">
            <h2>Historique des actions</h2>
            <ul>
              {data.events.map((e) => (
                <li key={e.id}>
                  {e.created_at} · {e.action} · {e.actor_id} · {e.note}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
function SourceSettings({ source: s, busy, run }) {
  const [interval, setInterval] = useState(s.check_interval_days),
    [freshness, setFreshness] = useState(s.freshness_days);
  return (
    <article>
      <h3>
        <a href={s.url} target="_blank" rel="noreferrer">
          {s.url}
        </a>
      </h3>
      <p>
        État : {s.status} · tentative {s.last_attempt_at || "Jamais"} · dernier
        succès {s.last_success_at || "Jamais"}
      </p>
      <div className="devis-grid">
        <label className="devis-field">
          Intervalle de vérification (jours)
          <input
            type="number"
            min={1}
            max={90}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </label>
        <label className="devis-field">
          Fraîcheur maximale de la source (jours)
          <input
            type="number"
            min={1}
            max={366}
            value={freshness}
            onChange={(e) => setFreshness(e.target.value)}
          />
        </label>
      </div>
      <button
        disabled={busy}
        onClick={() =>
          run({
            action: "source-settings",
            url: s.url,
            intervalDays: Number(interval),
            freshnessDays: Number(freshness),
          })
        }
      >
        Enregistrer la fréquence et la fraîcheur
      </button>
    </article>
  );
}
