import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import equipmentIndex from "../data/equipment-index.json";
import {
  getPublicUserManual,
  PUBLIC_USER_MANUAL_MODELS,
} from "../lib/public-user-manuals.js";
import {
  HOUSING_TYPES,
  OCCUPANCY_TYPES,
  WORK_TYPES,
  EQUIPMENT_TYPES,
  EMPTY_PROJECT,
  readProject,
  saveProject,
  forgetProject,
  prepareProject,
  projectText,
} from "../lib/shiba-devis.js";
import "./ShibaDevisPage.css";
import ShibaDevisMascot from "../components/ShibaDevisMascot";
import DevisFinancialAssistant, {
  FINANCE_DRAFT_KEY,
} from "../components/DevisFinancialAssistant";

const models = [
  ...equipmentIndex.equipments,
  ...PUBLIC_USER_MANUAL_MODELS.filter(
    (model) =>
      !equipmentIndex.equipments.some(
        (entry) => entry.equipmentId === model.equipmentId,
      ),
  ),
];

function browserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function Choices({ name, label, choices, value, change, help }) {
  return (
    <label className="devis-field" htmlFor={`devis-${name}`}>
      <span>{label}</span>
      <select
        id={`devis-${name}`}
        name={name}
        value={value}
        onChange={change}
        aria-describedby={`devis-${name}-help`}
      >
        <option value="">Choisir…</option>
        {Object.entries(choices).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
      <small id={`devis-${name}-help`}>{help}</small>
    </label>
  );
}

export default function ShibaDevisPage() {
  const [params] = useSearchParams();
  const professional = params.get("profil") === "professionnel";
  const [project, setProject] = useState(() => readProject(browserStorage()));
  const [prepared, setPrepared] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftGeneration, setDraftGeneration] = useState(0);
  const result = prepareProject(project);
  const model = models.find(
    (entry) => entry.equipmentId === project.equipmentId,
  );
  const manual = model ? getPublicUserManual(model) : null;

  function change(event) {
    const next = { ...project, [event.target.name]: event.target.value };
    setProject(next);
    setStorageError(!saveProject(browserStorage(), next));
    setPrepared(false);
    setNotice("");
  }

  function clear() {
    const removed = forgetProject(browserStorage());
    try {
      browserStorage()?.removeItem(FINANCE_DRAFT_KEY);
    } catch {
      setStorageError(true);
    }
    setDraftGeneration((n) => n + 1);
    setProject({ ...EMPTY_PROJECT });
    setPrepared(false);
    setStorageError(!removed);
    setNotice(
      removed
        ? "Brouillon effacé dans cet onglet."
        : "Stockage inaccessible : effacez les données du site dans les réglages du navigateur.",
    );
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([projectText(result, professional)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "shiba-devis-dossier-preparatoire.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="devis-page">
      <nav className="devis-nav" aria-label="Navigation Shiba Devis">
        <Link to="/">← Accueil</Link>
        <Link to="/espace-particulier">Espace particulier</Link>
        {professional && <Link to="/espace-pro">Espace professionnel</Link>}
      </nav>
      <header className="devis-heading">
        <ShibaDevisMascot />
        <div>
          <span className="devis-eyebrow">
            Gratuit · sans paiement ni recharge
          </span>
          <h1>Shiba Devis</h1>
          <p>
            {professional
              ? "Préparez les éléments du devis et les questions à poser au client."
              : "Réunissez les informations de votre projet de travaux."}
          </p>
        </div>
      </header>
      <div className="devis-callout">
        <strong>
          Une orientation indicative, pas un accord de financement.
        </strong>
        <p>
          Les montants éventuels utilisent les règles publiées et validées par
          l’équipe. Si les informations ou les règles à jour manquent, aucune
          aide inconnue n’est considérée comme zéro euro.
        </p>
      </div>
      <p>
        Le brouillon est conservé dans cet onglet. Le bouton Calculer transmet
        les informations utiles à notre serveur, sans IA pour le calcul.
        L’enregistrement dans votre compte est facultatif. Ne saisissez pas
        d’adresse complète ni de justificatif fiscal.
      </p>
      {storageError && (
        <p role="alert">
          Votre navigateur ne permet pas de conserver ce brouillon. Gardez cette
          page ouverte ou téléchargez votre dossier.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        className="devis-panel"
        onSubmit={(event) => {
          event.preventDefault();
          setPrepared(true);
        }}
      >
        <h2>1. Les informations du projet</h2>
        <p>
          Vous pouvez laisser une réponse à préciser : elle apparaîtra dans les
          informations manquantes.
        </p>
        <div className="devis-grid">
          <Choices
            name="housing"
            label="Type de logement"
            choices={HOUSING_TYPES}
            value={project.housing}
            change={change}
            help="Pour organiser le dossier et distinguer les démarches individuelles et collectives."
          />
          <Choices
            name="occupancy"
            label="Statut par rapport au logement"
            choices={OCCUPANCY_TYPES}
            value={project.occupancy}
            change={change}
            help="Les démarches à vérifier peuvent dépendre de ce statut."
          />
          <Choices
            name="work"
            label="Travaux envisagés"
            choices={WORK_TYPES}
            value={project.work}
            change={change}
            help="Pour choisir les informations et pistes de financement à examiner."
          />
          <Choices
            name="currentEquipment"
            label="Équipement actuel"
            choices={EQUIPMENT_TYPES}
            value={project.currentEquipment}
            change={change}
            help="Pour préparer les questions techniques à confirmer avec l’artisan."
          />
          <label className="devis-field" htmlFor="devis-postalCode">
            <span>Code postal du logement (facultatif)</span>
            <input
              id="devis-postalCode"
              name="postalCode"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              value={project.postalCode}
              onChange={change}
              aria-describedby="devis-postal-help"
            />
            <small id="devis-postal-help">
              Pour repérer la localisation du projet. Aucune aide locale n’est
              calculée ici.
            </small>
          </label>
          <label className="devis-field" htmlFor="devis-equipmentId">
            <span>Modèle connu (facultatif)</span>
            <select
              id="devis-equipmentId"
              name="equipmentId"
              value={project.equipmentId}
              onChange={change}
            >
              <option value="">Modèle non sélectionné</option>
              {models.map((entry) => (
                <option key={entry.equipmentId} value={entry.equipmentId}>
                  {entry.brand} · {entry.model} · {entry.manufacturerReference}
                </option>
              ))}
            </select>
            <small>
              Seule une notice publique autorisée correspondant à ce modèle peut
              être proposée ici.
            </small>
          </label>
        </div>
        <div className="devis-actions">
          <button className="devis-button" type="submit">
            Préparer mon dossier gratuitement
          </button>
          <button className="devis-secondary" type="button" onClick={clear}>
            Effacer mon brouillon
          </button>
        </div>
      </form>
      <section className="devis-panel" aria-labelledby="devis-doc-title">
        <h2 id="devis-doc-title">2. Les documents de l’équipement</h2>
        {manual ? (
          <>
            <p>
              Notice publique du fabricant correspondant à {model.brand} ·{" "}
              {model.model}. Shiba Devis propose ce lien ; il n’a pas lu ni
              indexé cette notice pour votre projet.
            </p>
            <a
              href={`${manual.url}#page=40`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {manual.title} ↗
            </a>
            <p>
              Ce PDF contient aussi une partie installation réservée aux
              professionnels. Aucune prescription de réglage ou d’intervention
              n’est fournie ici.
            </p>
          </>
        ) : (
          <p>
            {model
              ? "Aucune notice publique autorisée pour ce modèle n’est disponible dans ce parcours. Aucune notice n’a été consultée."
              : "Sélectionnez le modèle si vous le connaissez. Sans modèle, aucune notice ne peut être associée au projet."}
          </p>
        )}
        {professional && (
          <p>
            Pour vos notices et documents privés autorisés, utilisez{" "}
            <Link to="/espace-pro">le dossier équipement et Shiba Bot</Link>.
            Leur accès et leurs quotas habituels continuent de s’appliquer.
          </p>
        )}
      </section>
      {prepared && (
        <section
          className="devis-panel devis-result"
          aria-label="Dossier préparatoire"
          aria-live="polite"
        >
          <h2>3. Votre dossier préparatoire</h2>
          <p>
            <strong>
              Montant potentiel : non calculé. Montant accordé : aucun accord
              évalué.
            </strong>
          </p>
          {result.missing.length > 0 && (
            <>
              <h3>Informations manquantes</h3>
              <ul>
                {result.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Hypothèses et limites</h3>
          <ul>
            {result.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Les étapes à vérifier</h3>
          <ol>
            {result.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {professional && (
            <>
              <h3>Trame de préparation du devis</h3>
              <ul>
                {result.quoteChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>
                Les prix, marges, performances et obligations doivent être
                vérifiés par le professionnel. Ce dossier ne constitue pas un
                devis final ni un diagnostic de sécurité.
              </p>
            </>
          )}
          <h3>Sources officielles d’orientation</h3>
          {result.sources.length === 0 ? (
            <p>
              Aucune source suffisamment récente n’est référencée. Les
              conditions et montants doivent être vérifiés auprès d’un
              conseiller France Rénov’ avant toute simulation chiffrée.
            </p>
          ) : (
            <>
              <p>
                Ces liens servent à vérifier votre projet ; ils ne constituent
                pas une validation de votre éligibilité. La date de mise à jour
                des pages n’est pas connue.
              </p>
              <ul>
                {result.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.name} ↗
                    </a>
                    <p>{source.purpose}</p>
                    <small>
                      Lien référencé le {source.referencedOn} ; mise à jour
                      éditoriale non connue.
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="devis-secondary" type="button" onClick={download}>
            Télécharger le dossier préparatoire
          </button>
        </section>
      )}
      <DevisFinancialAssistant
        key={draftGeneration}
        project={project}
        professional={professional}
        onRestoreProject={(input) => {
          const next = {
            ...EMPTY_PROJECT,
            ...Object.fromEntries(
              Object.keys(EMPTY_PROJECT).map((k) => [k, input[k] || ""]),
            ),
          };
          setProject(next);
          saveProject(browserStorage(), next);
        }}
      />
      <p className="devis-footer-note">
        Shiba Devis organise votre projet. Shiba Bot reste l’assistant
        documentaire et technique. L’éligibilité définitive relève du financeur
        et le devis final du professionnel.
      </p>
    </main>
  );
}
