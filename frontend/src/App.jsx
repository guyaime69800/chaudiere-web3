import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom"; // lire l'ID dans l'URL + changer de page
// NOUVEAU (perf) : le scanner n'est telecharge QU'AU MOMENT du clic sur le bouton.
// Resultat : la page d'accueil s'ouvre bien plus vite, surtout en 4G faible.
const ScannerQR = lazy(() => import("./ScannerQR"));
import { QRCodeCanvas } from "qrcode.react"; // NOUVEAU (QR) : fabrique l'image du QR code
import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS } from "./blockchain/config";
import EquipmentRegistryABI from "./blockchain/EquipmentRegistry.json";
import { useWallet } from "./blockchain/useWallet";
import { findErrorCode } from "./services/equipmentKnowledge";
import "./App.css";

function App() {
  // Mode d'affichage : "public" (consultation, sans wallet) ou "pro" (technicien, avec wallet)
  const [mode, setMode] = useState("public");
  const [technicalResult, setTechnicalResult] = useState(null);


  // NOUVEAU (routeur) : si l'URL est /appareil/CHAUD-DEMO, on recupere l'ID ici.
  // Sur la page d'accueil "/", idDepuisURL vaut undefined (c'est normal).
  const { id: idDepuisURL } = useParams();
  // NOUVEAU (scan) : navigation interne + ouverture/fermeture de la camera
  const navigate = useNavigate();
  const [scanOuvert, setScanOuvert] = useState(false);

  const [owner, setOwner] = useState("");
  const [boiler, setBoiler] = useState(null);
  const [searchId, setSearchId] = useState("");
  const [message, setMessage] = useState("");

  // NOUVEAU (perf) : useMemo = "fabrique-le UNE fois, puis reutilise".
  // Sans ca, la connexion blockchain etait recreee a chaque lettre tapee dans un champ.
  const provider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);
  const contract = useMemo(
    () => new ethers.Contract(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, provider),
    [provider]
  );

  const {
    account, connectWallet, isConnecting, error, isCorrectNetwork,
    getWriteContract, addMaintenance, getMaintenances,
    isMobile, hasInjectedWallet, metamaskDeepLink,
  } = useWallet();

  // Formulaire d'enregistrement d'un appareil
  const [formId, setFormId] = useState("");
  const [formQr, setFormQr] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formProductReference, setFormProductReference] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState("");

  // Carnet d'entretien
  const [maintenances, setMaintenances] = useState([]);
  const [isLoadingCarnet, setIsLoadingCarnet] = useState(false);
  const [carnetError, setCarnetError] = useState("");

  // Formulaire d'ajout d'intervention
  const [mType, setMType] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mTech, setMTech] = useState("");
  const [mPart, setMPart] = useState("");
  const [isAddingM, setIsAddingM] = useState(false);
  const [mMsg, setMMsg] = useState("");

  // Au chargement : on lit l'administrateur (owner) du contrat
  useEffect(() => {
    async function lireOwner() {
      const adresseOwner = await contract.owner();
      setOwner(adresseOwner);
    }
    lireOwner();
  }, []);

  // Transforme un timestamp blockchain (secondes) en date lisible FR
  function formatDate(timestampBigInt) {
    const ms = Number(timestampBigInt) * 1000;
    return new Date(ms).toLocaleString("fr-FR");
  }
  // NOUVEAU (QR) : telecharge le QR affiche en fichier PNG (pret a imprimer)
  function telechargerQR(boilerId) {
    // On recupere l'image QR dessinee a l'ecran (une balise <canvas>)
    const canvas = document.getElementById(`qr-${boilerId}`);
    if (!canvas) return;
    // On la transforme en fichier image
    const url = canvas.toDataURL("image/png");
    // On cree un lien invisible et on "clique" dessus pour declencher le telechargement
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `QR-${boilerId}.png`; // nom du fichier : QR-CHAUD-DEMO.png
    lien.click();
  }

  // PARTAGE : ouvre le menu natif du téléphone (WhatsApp, SMS, Mail...)
  // Si le navigateur ne sait pas partager, on copie simplement le lien.
  async function partagerCarnetPass(url, titre, texte) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: titre,
          text: texte,
          url: url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("✅ Lien copié. Tu peux maintenant le partager.");
    } catch (err) {
      // Si l'utilisateur ferme simplement le menu de partage,
      // ce n'est pas considéré comme une erreur.
      if (err?.name !== "AbortError") {
        console.error("[partage] Échec :", err);
        setMessage("❌ Impossible de partager ce lien.");
      }
    }
  }
  // Charge le carnet d'un appareil
  async function chargerCarnet(boilerId) {
    setIsLoadingCarnet(true);
    setCarnetError("");
    try {
      const liste = await getMaintenances(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, boilerId);
      setMaintenances(liste);
    } catch (err) {
      console.error("[carnet] ECHEC :", err);
      setMaintenances([]);
      setCarnetError("Impossible de lire le carnet. La blockchain n'a pas repondu correctement.");
    } finally {
      setIsLoadingCarnet(false);
    }
  }

  // Recherche : on charge la fiche de l'appareil.
  // NOUVEAU : on accepte un ID explicite (venant du QR / de l'URL).
  // Sinon on prend celui tape dans le champ de recherche.
  async function chercherChaudiere(idExplicite) {
    const idAChercher = idExplicite ?? searchId;
    setMessage("");
    setMaintenances([]);
    setTechnicalResult(null);
    if (!idAChercher) return; // rien a chercher, on s'arrete
    const erreurTrouvee = findErrorCode(idAChercher);

    if (erreurTrouvee) {
      setBoiler(null);
      setTechnicalResult(erreurTrouvee);
      setMessage(`${erreurTrouvee.code} — ${erreurTrouvee.title}`);
      return;
    }
    const data = await contract.equipments(idAChercher);
    if (data.exists) {
      setBoiler(data);
    } else {
      setBoiler(null);
      setMessage("Aucun appareil trouve avec cet identifiant.");
    }
  }
  // NOUVEAU (scan) : appelee quand la camera a lu un QR CarnetPass valide
  function ouvrirDepuisScan(idScanne) {
    setScanOuvert(false);              // ferme la camera (et la coupe)
    setSearchId(idScanne);             // le champ de recherche affiche l'ID lu
    navigate(`/appareil/${idScanne}`); // l'adresse devient partageable, le bouton Retour marche
    chercherChaudiere(idScanne);       // charge la fiche tout de suite, meme si on est deja sur cette adresse
  }
  // Dès qu'un appareil est affiche, on charge son carnet automatiquement
  useEffect(() => {
    if (boiler && boiler.equipmentId) {
      chargerCarnet(boiler.equipmentId);
    }
  }, [boiler]);

  // NOUVEAU (QR/routeur) : arrivee via une URL directe (ou un QR scanne)
  // -> on ouvre la fiche de l'appareil automatiquement.
  useEffect(() => {
    if (idDepuisURL) {
      setSearchId(idDepuisURL);       // le champ affiche l'ID scanne
      chercherChaudiere(idDepuisURL); // ID passe explicitement = pas de course d'etat (le piege du "await")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDepuisURL]);

  // ECRITURE : enregistrer un nouvel appareil (reserve a l'admin, cote contrat)
  async function enregistrerChaudiere() {
    setWriteMsg("");

    if (!account) {
      setWriteMsg("⚠️ Connecte d'abord ton wallet.");
      return;
    }

    if (!isCorrectNetwork) {
      setWriteMsg("⚠️ Mauvais réseau.");
      return;
    }

    if (
      !formId ||
      !formQr ||
      !formBrand ||
      !formModel ||
      !formProductReference ||
      !formSerialNumber
    ) {
      setWriteMsg("⚠️ Remplis les 6 champs.");
      return;
    }

    try {
      setIsWriting(true);
      setWriteMsg("Transaction en cours... confirme dans MetaMask.");

      const writeContract = getWriteContract(
        CONTRACT_ADDRESS,
        EquipmentRegistryABI.abi
      );

      const tx = await writeContract.registerEquipment(
        formId,
        formQr,
        formBrand,
        formModel,
        formProductReference,
        formSerialNumber
      );

      setWriteMsg("Envoyée, attente de confirmation...");
      await tx.wait();

      setWriteMsg(`✅ Appareil ${formId} enregistré !`);

      setFormId("");
      setFormQr("");
      setFormBrand("");
      setFormModel("");
      setFormProductReference("");
      setFormSerialNumber("");
    } catch (err) {
      console.error(err);

      if (err.code === "ACTION_REJECTED") {
        setWriteMsg("❌ Signature refusée.");
      } else if (err.reason) {
        setWriteMsg(`❌ Refusé par le contrat : ${err.reason}`);
      } else {
        setWriteMsg("❌ Échec (voir console).");
      }
    } finally {
      setIsWriting(false);
    }
  }

  // ECRITURE : ajouter une intervention a l'appareil affiche
  async function ajouterIntervention() {
    setMMsg("");
    if (!account) { setMMsg("⚠️ Connecte d'abord ton wallet."); return; }
    if (!isCorrectNetwork) { setMMsg("⚠ Mauvais reseau. Passe sur Polygon (chainId 137)."); return; }
    if (!boiler) { setMMsg("⚠️ Cherche d'abord un appareil."); return; }
    if (!mType || !mDesc || !mTech) { setMMsg("⚠️ Type, description et technicien sont requis."); return; }
    // RGPD : bloque quelques formes évidentes de données personnelles
    // avant qu'elles ne soient inscrites de façon permanente sur Polygon.
    const texteIntervention = `${mType} ${mDesc} ${mTech}`;

    const contientEmail =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(texteIntervention);

    const contientAdresse =
      /\b(rue|avenue|boulevard|chemin|impasse|allée|allee|place)\b/i.test(
        texteIntervention
      );

    const contientTelephone =
      /(?:\+33[ .-]?[1-9](?:[ .-]?\d{2}){4}|0[1-9](?:[ .-]\d{2}){4})/.test(
        texteIntervention
      );

    if (contientEmail || contientAdresse || contientTelephone) {
      setMMsg(
        "❌ Donnée personnelle détectée. Retire toute adresse, téléphone ou e-mail avant l'inscription sur la blockchain."
      );
      return;
    }

    try {
      setIsAddingM(true);
      setMMsg("Transaction en cours... confirme dans MetaMask.");
      await addMaintenance(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, boiler.equipmentId, mType, mDesc, mTech, mPart);
      setMMsg("✅ Intervention ajoutee !");
      setMType(""); setMDesc(""); setMTech(""); setMPart("");
      chargerCarnet(boiler.equipmentId); // on rafraichit le carnet
    } catch (err) {
      console.error(err);
      if (err.code === "ACTION_REJECTED") setMMsg("❌ Signature refusee.");
      else if (err.reason) setMMsg(`❌ Refuse par le contrat : ${err.reason}`);
      else setMMsg("❌ Echec (voir console).");
    } finally {
      setIsAddingM(false);
    }
  }

  return (
    <div className="app">
      {/* ---------- BARRE DU HAUT ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff">
              <path d="M12 2c.5 3-1 4.3-2.2 5.8C8.4 9.5 7.5 10.8 7.5 13a4.5 4.5 0 0 0 9 0c0-1.4-.5-2.6-1.3-3.7 1.6.8 2.8 2.9 2.8 5.2a7 7 0 0 1-14 0c0-4.3 4-6.5 8-12.5z" />
            </svg>
          </span>
          <span className="brand-name">CarnetPass</span>
        </div>

        {mode === "public" ? (
          <button className="btn btn-ghost" onClick={() => setMode("pro")}>
            🔒 Espace pro
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setMode("public")}>
            ← Retour à la consultation
          </button>
        )}
      </header>

      {/* ---------- HERO + RECHERCHE (toujours visible) ---------- */}
      <section className="hero">
        <h1>Le carnet d'entretien infalsifiable de vos équipements</h1>
        <p>Chaudière, climatisation, pompe à chaleur, VMC — un registre vérifiable qui suit l'appareil, pas son propriétaire.</p>

        <div className="search">
          <input
            className="field"
            type="text"
            placeholder="Entrez un ID équipement (ex : CHAUD-DEMO)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") chercherChaudiere(); }}
          />
          {/* NOUVEAU : la fleche () => evite d'envoyer l'evenement du clic comme ID */}
          <button className="btn btn-primary" onClick={() => chercherChaudiere()}>Rechercher</button>
        </div>

        <div className="hero-foot">
          <button className="linklike" onClick={() => setScanOuvert(true)}>
            📷 ou scanner un QR code
          </button>
          <span className="trust">🛡️ Registre public vérifié sur Polygon · aligné DPP / ESPR</span>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() =>
            partagerCarnetPass(
              "https://www.carnetpass.fr",
              "CarnetPass",
              "Découvrez CarnetPass, le carnet d'entretien vérifiable de vos équipements."
            )
          }
        >
          📤 Partager CarnetPass
        </button>
      </section>

      {/* ---------- ESPACE PRO (uniquement en mode pro) ---------- */}
      {mode === "pro" && (
        <section className="pro-zone">
          <div className="pro-bar">
            {account ? (
              <span className="status-ok"><span className="dot" /> Connecté : {account.slice(0, 6)}...{account.slice(-4)}</span>
            ) : hasInjectedWallet ? (
              <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
              </button>
            ) : isMobile ? (
              <a className="btn btn-primary" href={metamaskDeepLink}>
                🦊 Ouvrir dans l'app MetaMask
              </a>
            ) : (
              <a className="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                🦊 Installer MetaMask
              </a>
            )}
            {account && !isCorrectNetwork && <span className="warn">⚠️ Passe sur Polygon (chainId 137).</span>}
            {error && <span className="err">{error}</span>}
            {isMobile && !hasInjectedWallet && (
              <span className="muted">Astuce : sur mobile, la connexion se fait dans le navigateur de l'app MetaMask.</span>
            )}
          </div>

          {account && (
            <div className="form-card">
              <h3>Enregistrer un appareil</h3>
              <input
                className="field"
                placeholder="ID équipement (ex : CHAUD-002)"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
              />

              <input
                className="field"
                placeholder="QR Code (ex : QR-002)"
                value={formQr}
                onChange={(e) => setFormQr(e.target.value)}
              />

              <input
                className="field"
                placeholder="Marque (ex : Saunier Duval)"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />

              <input
                className="field"
                placeholder="Modèle (ex : ThemaPlus Condens 30-A)"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />

              <input
                className="field"
                placeholder="Référence produit"
                value={formProductReference}
                onChange={(e) => setFormProductReference(e.target.value)}
              />

              <input
                className="field"
                placeholder="Numéro de série"
                value={formSerialNumber}
                onChange={(e) => setFormSerialNumber(e.target.value)}
              />
              <button className="btn btn-primary" onClick={enregistrerChaudiere} disabled={isWriting}>
                {isWriting ? "Enregistrement..." : "Enregistrer"}
              </button>
              {writeMsg && <p className="form-msg">{writeMsg}</p>}
            </div>
          )}
        </section>
      )}

      {/* ---------- MESSAGE "NON TROUVE" ---------- */}
      {message && !technicalResult && <p className="notfound">{message}</p>}
      {technicalResult && (
        <section className="technical-result">
          <h2>
            ⚠️ {technicalResult.code} — {technicalResult.title}
          </h2>

          <h3>Signification</h3>
          <p>{technicalResult.manufacturerData.meaning}</p>

          <h3>Causes possibles</h3>
          <ul>
            {technicalResult.manufacturerData.possibleCauses.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>

          <h3>Contrôles professionnels</h3>
          <ul>
            {technicalResult.manufacturerData.professionalChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>

          <h3>Consignes de sécurité</h3>
          <ul>
            {technicalResult.userGuidance.allowedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>

          <p>
            <strong>Source :</strong> document constructeur Saunier Duval —
            page {technicalResult.source.page}
          </p>
        </section>
      )}

      {/* ---------- FICHE APPAREIL + CARNET (si un appareil est trouve) ---------- */}
      {boiler && (
        <section className="result">
          <div className="appareil">
            <div className="appareil-head">
              <div>
                <span className="appareil-type">Équipement</span>
                <h2 className="appareil-name">{boiler.equipmentId}</h2>
                <p className="appareil-loc">{boiler.brand} · {boiler.model}</p>
              </div>
              <span className="badge-verified">✔ Vérifié</span>
            </div>

            <div className="appareil-grid">
              <div>
                <span className="k">QR Code</span>
                <span className="v">{boiler.qrCode}</span>
              </div>

              <div>
                <span className="k">Marque</span>
                <span className="v">{boiler.brand}</span>
              </div>

              <div>
                <span className="k">Modèle</span>
                <span className="v">{boiler.model}</span>
              </div>

              <div>
                <span className="k">Référence produit</span>
                <span className="v">{boiler.productReference}</span>
              </div>

              <div>
                <span className="k">Numéro de série</span>
                <span className="v">{boiler.serialNumber}</span>
              </div>
            </div>

            {/* NOUVEAU (QR) : le QR code physique a coller sur l'appareil.
                Il pointe vers l'adresse EN LIGNE de la fiche -> scannable depuis n'importe quel telephone. */}
            <div className="qr-zone">
              <p className="qr-title">QR à coller sur l'appareil</p>
              <div className="qr-box">
                <QRCodeCanvas
                  id={`qr-${boiler.equipmentId}`}
                  value={`https://carnetpass.fr/appareil/${boiler.equipmentId}`}
                  size={160}
                  level="M"                  /* niveau de correction d'erreur : lisible meme un peu abime */
                  includeMargin={true}
                />
              </div>
              <button className="btn btn-ghost" onClick={() => telechargerQR(boiler.equipmentId)}>
                ⬇️ Télécharger le QR
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  partagerCarnetPass(
                    `https://www.carnetpass.fr/appareil/${boiler.equipmentId}`,
                    `CarnetPass - ${boiler.brand} ${boiler.model}`,
                    `Consultez le carnet d'entretien de l'équipement ${boiler.equipmentId}.`
                  )
                }
              >
                📤 Partager cette fiche
              </button>
              <p className="qr-hint">Imprime-le et colle-le sur l'appareil. Un scan ouvre cette fiche.</p>
            </div>
          </div>

          {/* CARNET EN FRISE */}
          <div className="carnet">
            <p className="carnet-title">Carnet d'entretien</p>

            {isLoadingCarnet ? (
              <p className="muted">Chargement du carnet...</p>
            ) : carnetError ? (
              <p className="err">❌ {carnetError}</p>
            ) : maintenances.length === 0 ? (
              <p className="muted">Aucune intervention enregistrée pour cet appareil.</p>
            ) : (
              <div className="timeline">
                {maintenances.map((m, index) => (
                  <div className="tl-item" key={index}>
                    <div className="tl-marker">
                      <span className="tl-dot" />
                      {index < maintenances.length - 1 && <span className="tl-line" />}
                    </div>
                    <div className="tl-body">
                      <p className="tl-date">{formatDate(m.date)}</p>
                      <p className="tl-type">{m.interventionType}</p>
                      <p className="tl-desc">{m.description} — {m.technician}</p>
                      {m.partChanged && <p className="tl-part">Pièce changée : {m.partChanged}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AJOUT D'INTERVENTION (mode pro + wallet connecte) */}
            {mode === "pro" && account && (
              <div className="form-card">
                <h3>Ajouter une intervention</h3>

                <p className="muted">
                  🔒 Données techniques uniquement. N'indiquez aucun nom de client,
                  adresse, téléphone, e-mail ou autre donnée personnelle :
                  cette intervention sera inscrite sur la blockchain Polygon.
                </p>

                <input
                  className="field"
                  placeholder="Type d'intervention (ex : Entretien annuel)"
                  value={mType}
                  onChange={(e) => setMType(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Description technique uniquement (ex : Nettoyage brûleur)"
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Entreprise / identifiant technicien (sans nom ni prénom)"
                  value={mTech}
                  onChange={(e) => setMTech(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Pièce changée / référence (optionnel)"
                  value={mPart}
                  onChange={(e) => setMPart(e.target.value)}
                />
                <button className="btn btn-primary" onClick={ajouterIntervention} disabled={isAddingM}>
                  {isAddingM ? "Ajout en cours..." : "Ajouter au carnet"}
                </button>
                {mMsg && <p className="form-msg">{mMsg}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- SCANNER QR (plein ecran, uniquement quand ouvert) ---------- */}
      {scanOuvert && (
        <Suspense fallback={<div className="scan-loading">Ouverture de la caméra…</div>}>
          <ScannerQR
            onClose={() => setScanOuvert(false)}
            onCodeDetecte={ouvrirDepuisScan}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;