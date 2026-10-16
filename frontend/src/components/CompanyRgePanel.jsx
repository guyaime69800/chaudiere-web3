import { useState } from "react";
import { devisRequest } from "../services/shibaDevisService";
import {
  uploadEquipmentAttachment,
  getEquipmentAttachments,
} from "../services/equipmentAttachmentsService";
import { qualifiedRge } from "../../shared/aid-engine.js";
export default function CompanyRgePanel({ equipments = [] }) {
  const [rows, setRows] = useState([]),
    [siret, setSiret] = useState(""),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
      organism: "",
      reference: "",
      domain: "heat_pump_air_water",
      validFrom: "",
      validUntil: "",
      equipmentId: "",
    }),
    [proof, setProof] = useState(null);
  const change = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await devisRequest("/api/company-rge");
      setRows(r.qualifications);
      setSiret(r.siret || "");
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let proofAttachmentId = null;
      if (proof) {
        if (!form.equipmentId)
          throw new Error(
            "Choisissez le dossier privé auquel joindre le justificatif.",
          );
        const title = `Qualification RGE ${form.reference} · ${crypto.randomUUID()}`;
        await uploadEquipmentAttachment({
          file: proof,
          equipmentId: form.equipmentId,
          documentKind: "proof",
          title,
        });
        const attachments = await getEquipmentAttachments(form.equipmentId);
        proofAttachmentId = attachments.find(
          (a) => a.title === title && a.originalFilename === proof.name,
        )?.id;
        if (!proofAttachmentId)
          throw new Error(
            "Justificatif chargé, mais son rattachement reste indisponible. Vous pouvez enregistrer la déclaration sans fichier puis joindre le justificatif depuis le dossier.",
          );
      }
      const r = await devisRequest("/api/company-rge", {
        body: { ...form, domains: [form.domain], proofAttachmentId },
      });
      setMessage(r.message);
      setProof(null);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="devis-panel">
      <summary>Qualifications RGE de mon entreprise</summary>
      <p>
        Le RGE est lié aux dispositifs et domaines de travaux ; il n’est pas
        obligatoire pour tout entretien. Une déclaration ou un justificatif ne
        vaut pas vérification.
      </p>
      <a
        href="https://france-renov.gouv.fr/annuaire-rge/identifier"
        target="_blank"
        rel="noreferrer"
      >
        Vérifier dans l’annuaire officiel →
      </a>
      <button type="button" disabled={busy} onClick={load}>
        Charger mes qualifications
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loaded && (
        <>
          <p>
            SIRET de l’entreprise :{" "}
            {siret || "À renseigner dans les paramètres"}
          </p>
          <ul>
            {rows.map((q) => (
              <li key={q.id}>
                {q.organism} · {q.qualification_reference} ·{" "}
                {q.domains.join(", ")} · {q.valid_from} → {q.valid_until}
                <br />
                {
                  qualifiedRge(q, {
                    siret,
                    domain: q.domains[0],
                    date: new Date().toISOString().slice(0, 10),
                  }).message
                }{" "}
                {q.verified_at &&
                  `Dernier contrôle : ${q.verified_at.slice(0, 10)}`}
              </li>
            ))}
          </ul>
          <div role="group" aria-label="Déclarer une qualification">
            <p>
              Seuls les propriétaires et administrateurs peuvent enregistrer une
              déclaration.
            </p>
            <div className="devis-grid">
              {[
                ["organism", "Organisme", "text"],
                ["reference", "Référence de qualification", "text"],
                ["validFrom", "Valide à partir du", "date"],
                ["validUntil", "Valide jusqu’au", "date"],
              ].map(([name, label, type]) => (
                <label className="devis-field" key={name}>
                  <span>{label}</span>
                  <input
                    name={name}
                    type={type}
                    value={form[name]}
                    onChange={change}
                    maxLength={160}
                  />
                </label>
              ))}
              <label className="devis-field">
                Domaine
                <select name="domain" value={form.domain} onChange={change}>
                  {[
                    "heat_pump_air_water",
                    "heat_pump_ground",
                    "insulation",
                    "ventilation",
                    "solar",
                    "audit",
                  ].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="devis-field">
                Dossier privé pour le justificatif
                <select
                  name="equipmentId"
                  value={form.equipmentId}
                  onChange={change}
                >
                  <option value="">Aucun justificatif à joindre</option>
                  {equipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.brand} {eq.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Justificatif privé facultatif
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setProof(e.target.files?.[0] || null)}
              />
            </label>
            <button type="button" disabled={busy} onClick={save}>
              Enregistrer la déclaration RGE
            </button>
          </div>
        </>
      )}
    </details>
  );
}
