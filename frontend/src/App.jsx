import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS } from "./blockchain/config";
import BoilerRegistryABI from "./blockchain/BoilerRegistry.json";
import { useWallet } from "./blockchain/useWallet";

function App() {
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

  // Formulaire chaudiere
  const [formId, setFormId] = useState("");
  const [formQr, setFormQr] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState("");

  // NOUVEAU : carnet d'entretien
  const [maintenances, setMaintenances] = useState([]); // liste des interventions
  const [isLoadingCarnet, setIsLoadingCarnet] = useState(false);
  const [carnetError, setCarnetError] = useState(""); // NOUVEAU : erreur visible a l'ecran
  // NOUVEAU : formulaire intervention
  const [mType, setMType] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mTech, setMTech] = useState("");
  const [mPart, setMPart] = useState("");
  const [isAddingM, setIsAddingM] = useState(false);
  const [mMsg, setMMsg] = useState("");

  useEffect(() => {
    async function lireOwner() {
      const adresseOwner = await contract.owner();
      setOwner(adresseOwner);
    }
    lireOwner();
  }, []);

  // Transforme un timestamp blockchain (secondes) en date lisible FR
  function formatDate(timestampBigInt) {
    const ms = Number(timestampBigInt) * 1000; // secondes -> millisecondes
    return new Date(ms).toLocaleString("fr-FR");
  }

  // Charge le carnet d'une chaudiere
  async function chargerCarnet(boilerId) {
    setIsLoadingCarnet(true);
    setCarnetError("");

    try {
      const liste = await getMaintenances(CONTRACT_ADDRESS, BoilerRegistryABI.abi, boilerId);

      setMaintenances(liste);
    } catch (err) {
      // On n'avale plus l'erreur en silence : elle part dans la console ET a l'ecran
      console.error("[carnet] ECHEC :", err);
      setMaintenances([]);
      setCarnetError("Impossible de lire le carnet. La blockchain n'a pas repondu correctement.");
    } finally {

      setIsLoadingCarnet(false);
    }
  }

  // Recherche : on charge la fiche ET le carnet
  async function chercherChaudiere() {
    setMessage("");
    setMaintenances([]);
    const data = await contract.boilers(searchId);
    if (data.exists) {
      setBoiler(data);
    } else {
      setBoiler(null);
      setMessage("Aucune chaudiere trouvee avec cet identifiant.");
    }
  }
  // Charge le carnet automatiquement dès qu'une chaudiere est affichee
  useEffect(() => {
    if (boiler && boiler.boilerId) {
      chargerCarnet(boiler.boilerId);
    }
  }, [boiler]);
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
      setWriteMsg(`✅ Chaudiere ${formId} enregistree !`);
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

  // NOUVEAU : ajouter une intervention a la chaudiere actuellement affichee
  async function ajouterIntervention() {
    setMMsg("");
    if (!account) { setMMsg("⚠️ Connecte d'abord ton wallet."); return; }
    if (!isCorrectNetwork) { setMMsg("⚠ Mauvais reseau. Passe sur Polygon (chainId 137)."); return; }
    if (!boiler) { setMMsg("⚠️ Cherche d'abord une chaudiere."); return; }
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

  const champStyle = { padding: "10px", fontSize: "15px", width: "280px", marginBottom: "10px", display: "block", marginLeft: "auto", marginRight: "auto" };
  const btnOrange = { padding: "10px 20px", fontSize: "16px", cursor: "pointer", backgroundColor: "#f6851b", color: "white", border: "none", borderRadius: "8px" };

  return (
    <div style={{ textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>
      <h1>CHAUDIERE-WEB3</h1>
      <p>Registre blockchain pour l'entretien des chaudieres</p>

      <div style={{ marginBottom: "20px" }}>
        {account ? (
          <p><span style={{ color: "green" }}>●</span>{" "}Connecté : <strong>{account.slice(0, 6)}...{account.slice(-4)}</strong></p>
        ) : (
          <button onClick={connectWallet} disabled={isConnecting} style={btnOrange}>
            {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
          </button>
        )}
        {account && !isCorrectNetwork && <p style={{ color: "orange" }}>⚠️ Passe sur Polygon (chainId 137).</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>

      <p><strong>Administrateur (owner) :</strong> {owner}</p>

      {account && (
        <div style={{ marginTop: "30px", padding: "20px", border: "2px solid #f6851b", borderRadius: "8px", display: "inline-block" }}>
          <h2 style={{ marginTop: 0 }}>Enregistrer une chaudiere</h2>
          <input style={champStyle} placeholder="ID (ex: CHAUD-002)" value={formId} onChange={(e) => setFormId(e.target.value)} />
          <input style={champStyle} placeholder="QR Code (ex: QR-002)" value={formQr} onChange={(e) => setFormQr(e.target.value)} />
          <input style={champStyle} placeholder="Proprietaire (ex: Marie Martin)" value={formOwner} onChange={(e) => setFormOwner(e.target.value)} />
          <input style={champStyle} placeholder="Emplacement (ex: Villeurbanne)" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
          <button onClick={enregistrerChaudiere} disabled={isWriting} style={btnOrange}>
            {isWriting ? "Enregistrement..." : "Enregistrer"}
          </button>
          {writeMsg && <p style={{ marginBottom: 0 }}>{writeMsg}</p>}
        </div>
      )}

      <div style={{ marginTop: "30px" }}>
        <input type="text" placeholder="Entrez un ID (ex: CHAUD-001)" value={searchId}
          onChange={(e) => setSearchId(e.target.value)} style={{ padding: "10px", fontSize: "16px", width: "250px" }} />
        <button onClick={chercherChaudiere} style={{ padding: "10px 20px", fontSize: "16px", marginLeft: "10px", cursor: "pointer" }}>
          Chercher
        </button>
      </div>

      {message && <p style={{ color: "red", marginTop: "15px" }}>{message}</p>}

      {boiler && (
        <div style={{ marginTop: "30px", padding: "20px", border: "1px solid #ccc", borderRadius: "8px", display: "inline-block", textAlign: "left" }}>
          <h2>Chaudiere : {boiler.boilerId}</h2>
          <p><strong>QR Code :</strong> {boiler.qrCode}</p>
          <p><strong>Proprietaire :</strong> {boiler.owner}</p>
          <p><strong>Emplacement :</strong> {boiler.location}</p>
          <p><strong>Existe :</strong> {boiler.exists ? "Oui" : "Non"}</p>
        </div>
      )}

      {/* NOUVEAU : carnet d'entretien (visible seulement si une chaudiere est affichee) */}
      {boiler && (
        <div style={{ marginTop: "30px" }}>
          <h2>📖 Carnet d'entretien</h2>
          {isLoadingCarnet ? (
            <p>Chargement du carnet...</p>
          ) : carnetError ? (
            <p style={{ color: "red" }}>❌ {carnetError}</p>
          ) : maintenances.length === 0 ? (
            <p style={{ color: "#888" }}>Aucune intervention enregistree pour cette chaudiere.</p>
          ) : (
            <div style={{ display: "inline-block", textAlign: "left", maxWidth: "600px" }}>
              {maintenances.map((m, index) => (
                <div key={index} style={{ padding: "15px", marginBottom: "10px", border: "1px solid #ddd", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                  <p style={{ margin: "0 0 5px" }}><strong>🗓️ {formatDate(m.date)}</strong></p>
                  <p style={{ margin: "0 0 5px" }}><strong>Type :</strong> {m.interventionType}</p>
                  <p style={{ margin: "0 0 5px" }}><strong>Description :</strong> {m.description}</p>
                  <p style={{ margin: "0 0 5px" }}><strong>Technicien :</strong> {m.technician}</p>
                  <p style={{ margin: 0 }}><strong>Piece changee :</strong> {m.partChanged || "—"}</p>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire d'ajout d'intervention (si wallet connecte) */}
          {account && (
            <div style={{ marginTop: "20px", padding: "20px", border: "2px solid #4caf50", borderRadius: "8px", display: "inline-block" }}>
              <h3 style={{ marginTop: 0 }}>➕ Ajouter une intervention</h3>
              <input style={champStyle} placeholder="Type (ex: Entretien annuel)" value={mType} onChange={(e) => setMType(e.target.value)} />
              <input style={champStyle} placeholder="Description (ex: Nettoyage bruleur)" value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
              <input style={champStyle} placeholder="Technicien (ex: Servigaz)" value={mTech} onChange={(e) => setMTech(e.target.value)} />
              <input style={champStyle} placeholder="Piece changee (optionnel)" value={mPart} onChange={(e) => setMPart(e.target.value)} />
              <button onClick={ajouterIntervention} disabled={isAddingM}
                style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer", backgroundColor: "#4caf50", color: "white", border: "none", borderRadius: "8px" }}>
                {isAddingM ? "Ajout en cours..." : "Ajouter au carnet"}
              </button>
              {mMsg && <p style={{ marginBottom: 0 }}>{mMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;