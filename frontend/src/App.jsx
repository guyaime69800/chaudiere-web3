import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS } from "./blockchain/config";
import BoilerRegistryABI from "./blockchain/BoilerRegistry.json";
import { useWallet } from "./blockchain/useWallet";
import "./App.css"; // NOUVEAU : on branche la feuille de style du relooking

function App() {
  // Mode d'affichage : "public" (consultation, sans wallet) ou "pro" (technicien, avec wallet)
  const [mode, setMode] = useState("public");

  const [owner, setOwner] = useState("");
  const [boiler, setBoiler] = useState(null);
  const [searchId, setSearchId] = useState("");
  const [message, setMessage] = useState("");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, BoilerRegistryABI.abi, provider);

  const {
    account, connectWallet, isConnecting, error, isCorrectNetwork,
    getWriteContract, addMaintenance, getMaintenances,
  } = useWallet();

  // Formulaire d'enregistrement d'un appareil
  const [formId, setFormId] = useState("");
  const [formQr, setFormQr] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formLocation, setFormLocation] = useState("");
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

  // Charge le carnet d'un appareil
  async function chargerCarnet(boilerId) {
    setIsLoadingCarnet(true);
    setCarnetError("");
    try {
      const liste = await getMaintenances(CONTRACT_ADDRESS, BoilerRegistryABI.abi, boilerId);
      setMaintenances(liste);
    } catch (err) {
      console.error("[carnet] ECHEC :", err);
      setMaintenances([]);
      setCarnetError("Impossible de lire le carnet. La blockchain n'a pas repondu correctement.");
    } finally {
      setIsLoadingCarnet(false);
    }
  }

  // Recherche : on charge la fiche de l'appareil
  async function chercherChaudiere() {
    setMessage("");
    setMaintenances([]);
    const data = await contract.boilers(searchId);
    if (data.exists) {
      setBoiler(data);
    } else {
      setBoiler(null);
      setMessage("Aucun appareil trouve avec cet identifiant.");
    }
  }

  // Dès qu'un appareil est affiche, on charge son carnet automatiquement
  useEffect(() => {
    if (boiler && boiler.boilerId) {
      chargerCarnet(boiler.boilerId);
    }
  }, [boiler]);

  // ECRITURE : enregistrer un nouvel appareil (reserve a l'admin, cote contrat)
  async function enregistrerChaudiere() {
    setWriteMsg("");
    if (!account) { setWriteMsg("⚠️ Connecte d'abord ton wallet."); return; }
    if (!isCorrectNetwork) { setWriteMsg("⚠ Mauvais reseau. Passe sur Polygon (chainId 137)."); return; }
    if (!formId || !formQr || !formOwner || !formLocation) { setWriteMsg("⚠️ Remplis les 4 champs."); return; }
    try {
      setIsWriting(true);
      setWriteMsg("Transaction en cours... confirme dans MetaMask.");
      const writeContract = getWriteContract(CONTRACT_ADDRESS, BoilerRegistryABI.abi);
      const tx = await writeContract.registerBoiler(formId, formQr, formOwner, formLocation);
      setWriteMsg("Envoyee, attente de confirmation...");
      await tx.wait();
      setWriteMsg(`✅ Appareil ${formId} enregistre !`);
      setFormId(""); setFormQr(""); setFormOwner(""); setFormLocation("");
    } catch (err) {
      console.error(err);
      if (err.code === "ACTION_REJECTED") setWriteMsg("❌ Signature refusee.");
      else if (err.reason) setWriteMsg(`❌ Refuse par le contrat : ${err.reason}`);
      else setWriteMsg("❌ Echec (voir console).");
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
    try {
      setIsAddingM(true);
      setMMsg("Transaction en cours... confirme dans MetaMask.");
      await addMaintenance(CONTRACT_ADDRESS, BoilerRegistryABI.abi, boiler.boilerId, mType, mDesc, mTech, mPart);
      setMMsg("✅ Intervention ajoutee !");
      setMType(""); setMDesc(""); setMTech(""); setMPart("");
      chargerCarnet(boiler.boilerId); // on rafraichit le carnet
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
          <span className="brand-name">CHAUDIÈRE-WEB3</span>
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
            placeholder="Entrez un ID ou n° de série (ex : CHAUD-DEMO)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") chercherChaudiere(); }}
          />
          <button className="btn btn-primary" onClick={chercherChaudiere}>Rechercher</button>
        </div>

        <div className="hero-foot">
          <button className="linklike" onClick={() => alert("📷 Le scan QR arrive à la prochaine étape.")}>
            ou scanner un QR code
          </button>
          <span className="trust">🛡️ Registre public vérifié sur Polygon · aligné DPP / ESPR</span>
        </div>
      </section>

      {/* ---------- ESPACE PRO (uniquement en mode pro) ---------- */}
      {mode === "pro" && (
        <section className="pro-zone">
          <div className="pro-bar">
            {account ? (
              <span className="status-ok"><span className="dot" /> Connecté : {account.slice(0, 6)}...{account.slice(-4)}</span>
            ) : (
              <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
              </button>
            )}
            {account && !isCorrectNetwork && <span className="warn">⚠️ Passe sur Polygon (chainId 137).</span>}
            {error && <span className="err">{error}</span>}
          </div>

          {owner && <p className="admin-line">Administrateur du registre : <code>{owner}</code></p>}

          {account && (
            <div className="form-card">
              <h3>Enregistrer un appareil</h3>
              <input className="field" placeholder="ID (ex : CHAUD-002)" value={formId} onChange={(e) => setFormId(e.target.value)} />
              <input className="field" placeholder="QR Code (ex : QR-002)" value={formQr} onChange={(e) => setFormQr(e.target.value)} />
              <input className="field" placeholder="Propriétaire (ex : Marie Martin)" value={formOwner} onChange={(e) => setFormOwner(e.target.value)} />
              <input className="field" placeholder="Emplacement (ex : Villeurbanne)" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
              <button className="btn btn-primary" onClick={enregistrerChaudiere} disabled={isWriting}>
                {isWriting ? "Enregistrement..." : "Enregistrer"}
              </button>
              {writeMsg && <p className="form-msg">{writeMsg}</p>}
            </div>
          )}
        </section>
      )}

      {/* ---------- MESSAGE "NON TROUVE" ---------- */}
      {message && <p className="notfound">{message}</p>}

      {/* ---------- FICHE APPAREIL + CARNET (si un appareil est trouve) ---------- */}
      {boiler && (
        <section className="result">
          <div className="appareil">
            <div className="appareil-head">
              <div>
                <span className="appareil-type">Chaudière</span>
                <h2 className="appareil-name">{boiler.boilerId}</h2>
                <p className="appareil-loc">📍 {boiler.location}</p>
              </div>
              <span className="badge-verified">✔ Vérifiée</span>
            </div>
            <div className="appareil-grid">
              <div><span className="k">QR Code</span><span className="v">{boiler.qrCode}</span></div>
              <div><span className="k">Propriétaire</span><span className="v">{boiler.owner}</span></div>
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
                <input className="field" placeholder="Type (ex : Entretien annuel)" value={mType} onChange={(e) => setMType(e.target.value)} />
                <input className="field" placeholder="Description (ex : Nettoyage brûleur)" value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
                <input className="field" placeholder="Technicien (ex : Servigaz)" value={mTech} onChange={(e) => setMTech(e.target.value)} />
                <input className="field" placeholder="Pièce changée (optionnel)" value={mPart} onChange={(e) => setMPart(e.target.value)} />
                <button className="btn btn-primary" onClick={ajouterIntervention} disabled={isAddingM}>
                  {isAddingM ? "Ajout en cours..." : "Ajouter au carnet"}
                </button>
                {mMsg && <p className="form-msg">{mMsg}</p>}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default App;