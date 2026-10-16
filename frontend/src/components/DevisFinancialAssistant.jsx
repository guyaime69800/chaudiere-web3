import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { devisRequest } from "../services/shibaDevisService";
import { projectInput, ESTIMATE_NOTICE } from "../../shared/aid-engine.js";
import {HOUSING_TYPES,OCCUPANCY_TYPES,WORK_TYPES,EQUIPMENT_TYPES} from '../lib/shiba-devis.js';
import ShibaDevisMascot from "./ShibaDevisMascot";
export const FINANCE_DRAFT_KEY = "carnetpass:shiba-devis:finance:v1";
const money = (n) =>
  n === null || n === undefined
    ? "Non évalué"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(n);
function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(FINANCE_DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}
const fieldNames = {
  budget: "Devis total TTC",
  eligibleCost: "Dépense éligible TTC",
  otherGrants: "Autres aides documentées",
  ceeAmount: "Offre CEE documentée",
  previousMpr: "MaPrimeRénov’ déjà perçue pour ce logement",
  householdSize: "Personnes dans le foyer",
  taxIncome: "Revenu fiscal de référence",
  taxYear: "Année des revenus",
  housingAge: "Âge du logement en années",
  workDate: "Date prévue des travaux",
  postalCode: "Code postal",
  occupancy:'Statut du demandeur',housing:'Logement',work:'Travaux',currentEquipment:'Équipement actuel',plannedEquipment:'Équipement envisagé',principalResidence:'Résidence principale',rgeDeclaration:'Déclaration RGE',technicalCriteria:'Critères techniques',equipmentId:'Modèle du catalogue',
};
const optionLabels={...HOUSING_TYPES,...OCCUPANCY_TYPES,...WORK_TYPES,...EQUIPMENT_TYPES,yes:'Oui',no:'Non',heat_pump_air_water:'Pompe à chaleur air/eau',heat_pump_ground:'Pompe à chaleur géothermique'};
export default function DevisFinancialAssistant({
  project,
  professional,
  onRestoreProject,
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(readDraft),
    [result, setResult] = useState(null),
    [ticket, setTicket] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [history, setHistory] = useState([]),
    [previousId, setPreviousId] = useState(null);
  const incomeNeeded =
    project.work === "heating" &&
    form.plannedEquipment === "heat_pump_air_water";
  function change(e) {
    const next = { ...form, [e.target.name]: e.target.value };
    setForm(next);
    setResult(null);
    setTicket(null);
    setNotice("");
    try {
      sessionStorage.setItem(FINANCE_DRAFT_KEY, JSON.stringify(next));
    } catch {
      setNotice("Brouillon non conservé : téléchargez votre récapitulatif.");
    }
  }
  async function simulate(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const input = { ...form, ...project };
      if (!incomeNeeded)
        for (const f of ["householdSize", "taxIncome", "taxYear"])
          delete input[f];
      const response = await devisRequest("/api/shiba-devis", {
        body: {
          action: "simulate",
          project: projectInput(input),
          siret: form.siret || null,
        },
      });
      setResult(response.result);
      setTicket(response.ticket || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await devisRequest("/api/shiba-devis", {
        body: { action: "save", ticket, previousId },
      });
      setNotice(
        "Simulation enregistrée dans votre compte. Les anciennes versions sont conservées.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    setBusy(true);
    setError("");
    try {
      const r = await devisRequest("/api/shiba-devis");
      setHistory(r.simulations || []);
      setNotice("Vos simulations enregistrées sont affichées ci-dessous.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    setBusy(true);
    setError("");
    try {
      await devisRequest("/api/shiba-devis", {
        method: "DELETE",
        query: { id },
      });
      setHistory((h) => h.filter((row) => row.id !== id));
      if (previousId === id) setPreviousId(null);
      setNotice("Simulation effacée de votre compte.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function restore(row) {
    setResult(row.snapshot);
    setForm(row.snapshot.input);
    onRestoreProject(row.snapshot.input);
    setPreviousId(row.id);
    setTicket(null);
    setNotice(
      "Ancien résultat affiché avec ses propres règles. Cliquez sur Calculer pour créer une nouvelle simulation.",
    );
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              project,
              simulation: result,
              questions: [
                "La qualification RGE couvre-t-elle ces travaux aux dates prévues ?",
                "Quelles dépenses du devis sont éligibles ?",
                "Quelle offre CEE écrite est proposée avant engagement ?",
                "Quelles démarches effectuer avant de signer le devis ?",
              ],
              professionalDraft: professional
                ? "Détailler équipements, quantités, pose, mise en service, TVA, délais, garanties et conditions commerciales ; prix et devis à valider par le professionnel."
                : null,
            },
            null,
            2,
          ),
        ],
        { type: "application/json;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "shiba-devis-simulation.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const number = (name, label = fieldNames[name]) => (
    <label className="devis-field" key={name}>
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min={name === "householdSize" ? 1 : 0}
        max={name === "householdSize" ? 20 : 10000000}
        step={
          ["householdSize", "taxYear", "housingAge"].includes(name) ? 1 : "0.01"
        }
        value={form[name] ?? ""}
        onChange={change}
      />
    </label>
  );
  const select = (name, label, options) => (
    <label className="devis-field">
      <span>{label}</span>
      <select name={name} value={form[name] || ""} onChange={change}>
        <option value="">À préciser</option>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="devis-panel" aria-labelledby="financial-title">
      <div className="devis-heading">
        <ShibaDevisMascot size={72} decorative />
        <h2 id="financial-title">3. Simulation et assistant du projet</h2>
      </div>
      <p>
        Le calcul utilise uniquement les règles publiées par l’équipe. Il
        fonctionne sans IA. Vos réponses sont transmises au serveur lorsque vous
        cliquez sur Calculer ; aucun avis d’imposition n’est demandé.
      </p>
      <form onSubmit={simulate}>
        <fieldset>
          <legend>Logement, équipement prévu et calendrier</legend>
          <div className="devis-grid">
            {number("housingAge")}
            {select("principalResidence", "Résidence principale", [
              ["yes", "Oui"],
              ["no", "Non"],
            ])}
            {select("plannedEquipment", "Équipement envisagé", [
              ["heat_pump_air_water", "Pompe à chaleur air/eau"],
              ["heat_pump_ground", "Pompe à chaleur géothermique"],
              ["other", "Autre / à déterminer"],
            ])}
            <label className="devis-field">
              <span>Date prévue des travaux</span>
              <input
                type="date"
                name="workDate"
                value={form.workDate || ""}
                onChange={change}
              />
            </label>
          </div>
        </fieldset>
        {incomeNeeded && (
          <fieldset>
            <legend>Ressources utiles à ce dispositif</legend>
            <p>
              Saisissez les revenus de l’année demandée par le référentiel (2025
              dans le brouillon 2026). Aucun justificatif fiscal à envoyer.
            </p>
            <div className="devis-grid">
              {number("householdSize")}
              {number("taxIncome")}
              {number("taxYear")}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>Budget et cumul des aides</legend>
          <p>
            Un champ vide signifie « inconnu ». Saisissez 0 seulement si vous
            avez confirmé l’absence de ce montant. Les CEE varient selon l’offre
            du fournisseur : utilisez un montant écrit et documenté.
          </p>
          <div className="devis-grid">
            {[
              "budget",
              "eligibleCost",
              "ceeAmount",
              "otherGrants",
              "previousMpr",
            ].map((n) => number(n))}
            {select(
              "technicalCriteria",
              "Performances techniques conformes au dispositif",
              [
                ["yes", "Confirmées avec le professionnel"],
                ["no", "Non confirmées"],
              ],
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>Entreprise et qualification RGE</legend>
          <p>
            Lorsqu’une aide l’exige, le domaine et les dates doivent
            correspondre aux travaux. Une déclaration ne vaut pas vérification.
          </p>
          <div className="devis-grid">
            <label className="devis-field">
              <span>SIRET de l’entreprise (facultatif)</span>
              <input
                name="siret"
                inputMode="numeric"
                pattern="[0-9]{14}"
                maxLength={14}
                value={form.siret || ""}
                onChange={change}
              />
            </label>
            {select("rgeDeclaration", "Qualification pour ces travaux", [
              ["yes", "Déclarée adaptée ; reste à vérifier"],
              ["unknown", "Non vérifiée"],
              ["no", "Absente ou inadaptée"],
            ])}
          </div>
          <a
            href="https://france-renov.gouv.fr/annuaire-rge/identifier"
            target="_blank"
            rel="noreferrer"
          >
            Annuaire officiel RGE
          </a>
        </fieldset>
        <div className="devis-actions">
          <button className="devis-button" disabled={busy}>
            Calculer gratuitement avec les règles publiées
          </button>
        </div>
      </form>
      {error && (
        <p role="alert">{error} Votre préparation locale reste utilisable.</p>
      )}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <div className="devis-result" aria-live="polite">
          <h3>Votre estimation</h3>
          <p>
            <strong>{ESTIMATE_NOTICE}</strong>
          </p>
          <p>
            Hypothèses utilisées :{" "}
            {Object.entries(result.input)
              .map(([k, v]) => `${fieldNames[k] || k} : ${optionLabels[v] || v}`)
              .join(" · ")}
          </p>
          {!result.aids.length && (
            <p>
              Aucun référentiel publié ne permet actuellement ce calcul.
              Consultez{" "}
              <a
                href="https://france-renov.gouv.fr/aides/simulation"
                target="_blank"
                rel="noreferrer"
              >
                le simulateur officiel France Rénov’
              </a>{" "}
              ; aucun montant fiable n’est proposé ici.
            </p>
          )}
          {result.sourceWarnings?.length > 0 && (
            <p role="status">
              Sources à revoir :{" "}
              {result.sourceWarnings.map((s) => s.url).join(", ")}. Les règles
              conservées ne sont utilisables que pendant leur période de
              validité et de fraîcheur.
            </p>
          )}
          {result.aids.map((a) => (
            <article key={a.id}>
              <h4>
                {a.name} · version {a.version}
              </h4>
              <p>
                Montant indicatif : <strong>{money(a.amount)}</strong>. Aucun
                accord de financement.
              </p>
              {a.rge && (
                <p>
                  RGE : {a.rge.message}{" "}
                  {a.rge.status !== "verified" &&
                    "L’estimation éventuelle suppose une qualification adaptée qui reste à vérifier."}
                </p>
              )}
              <ul>
                {a.missing.map((m) => (
                  <li key={m}>À préciser : {fieldNames[m] || m}</li>
                ))}
                {a.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {a.caps && (
                <p>
                  {a.caps.eligibleCost!==undefined&&<>Dépense éligible retenue au maximum : {money(a.caps.eligibleCost)}. </>}
                  {a.caps.lifetimeAmount!==undefined&&<>Plafond de prime, aides déjà perçues incluses : {money(a.caps.lifetimeAmount)}. </>}
                  {a.caps.mprCeeRates&&<>Le cumul prime et CEE est plafonné à {a.caps.mprCeeRates.map(n=>`${Math.round(n*100)} %`).join(' / ')} de la dépense éligible selon les ressources. </>}
                  {a.cumulation}
                </p>
              )}
              <p>
                Validation du référentiel :{" "}
                {a.validatedAt?.slice(0, 10) || "Non validé"}
              </p>
              <ul>
                {a.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title || s.url}
                    </a>{" "}
                    · consultation {s.consultedOn} · mise à jour éditoriale{" "}
                    {s.editorialUpdatedOn || "non connue"}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <p>
            Total des aides calculées : {money(result.subtotal)}. Reste à charge
            pour ce périmètre : {money(result.remaining)}.
          </p>
          <p>{result.scope}</p>
          <h4>Questions à poser à l’installateur</h4>
          <ul>
            <li>Le domaine RGE couvre-t-il ces travaux aux dates prévues ?</li>
            <li>Quelles dépenses et performances répondent au dispositif ?</li>
            <li>
              Quelle offre CEE écrite et quelles démarches avant signature ?
            </li>
            <li>Quels délais, garanties et postes détaillés dans le devis ?</li>
          </ul>
          {professional && (
            <p>
              Trame de devis : préciser équipements, quantités, pose, mise en
              service, TVA, délais, garanties et conditions commerciales. Les
              prix et engagements doivent être complétés et validés par le
              professionnel.
            </p>
          )}
          <div className="devis-actions">
            <button
              type="button"
              className="devis-secondary"
              onClick={download}
            >
              Télécharger le récapitulatif et les règles
            </button>
            {user && ticket && (
              <button
                type="button"
                disabled={busy}
                className="devis-secondary"
                onClick={save}
              >
                Enregistrer cette simulation dans mon compte
              </button>
            )}
          </div>
          <p>
            Sans compte, aucune simulation n’est enregistrée dans la base.
            Connecté, le résultat préparé est conservé temporairement 30 minutes
            pour permettre votre choix d’enregistrement.
          </p>
        </div>
      )}
      {user && (
        <>
          <button
            type="button"
            className="devis-secondary"
            disabled={busy}
            onClick={loadHistory}
          >
            Voir mes simulations enregistrées
          </button>
          <ul>
            {history.map((row) => (
              <li key={row.id}>
                {row.created_at?.slice(0, 10)} · {money(row.snapshot.subtotal)}{" "}
                <button type="button" onClick={() => restore(row)}>
                  Consulter / préparer un recalcul
                </button>{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(row.id)}
                >
                  Effacer cette simulation
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
