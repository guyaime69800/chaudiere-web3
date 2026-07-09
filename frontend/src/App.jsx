import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "./blockchain/contract-address";
import BoilerRegistryABI from "./blockchain/BoilerRegistry.json";
import { useWallet } from "./blockchain/useWallet";

function App() {
  // --- Lecture (inchange) ---
  const [owner, setOwner] = useState("");
  const [boiler, setBoiler] = useState(null);
  const [searchId, setSearchId] = useState("");
  const [message, setMessage] = useState("");

  // Provider LECTURE SEULE (dette #1 : URL en dur, a corriger avant Polygon)
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, BoilerRegistryABI.abi, provider);

  // --- Wallet ---
  const {
    account, connectWallet, isConnecting, error,
    isCorrectNetwork, getWriteContract,
  } = useWallet();

  // --- Les 4 champs du formulaire d'enregistrement ---
  const [formId, setFormId] = useState("");
  const [formQr, setFormQr] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState("");

  // Au chargement : on lit l'owner
  useEffect(() => {
    async function lireOwner() {
      const adresseOwner = await contract.owner();
      setOwner(adresseOwner);
    }
    lireOwner();
  }, []);

  // Recherche (inchange)
  async function chercherChaudiere() {
    setMessage("");
    const data = await contract.boilers(searchId);
    if (data.exists) {
      setBoiler(data);
    } else {
      setBoiler(null);
      setMessage("Aucune chaudiere trouvee avec cet identifiant.");
    }
  }

  // --- Enregistrer une chaudiere (ECRITURE) ---
  async function enregistrerChaudiere() {
    setWriteMsg("");

    if (!account) {
      setWriteMsg("⚠️ Connecte d'abord ton wallet.");
      return;
    }
    if (!isCorrectNetwork) {
      setWriteMsg("⚠️ Mauvais reseau. Passe sur Hardhat 31337 dans MetaMask.");
      return;
    }
    if (!formId || !formQr || !formOwner || !formLocation) {
      setWriteMsg("⚠️ Remplis les 4 champs.");
      return;
    }

    try {
      setIsWriting(true);
      setWriteMsg("Transaction en cours... confirme dans MetaMask.");

      const writeContract = getWriteContract(CONTRACT_ADDRESS, BoilerRegistryABI.abi);
      const tx = await writeContract.registerBoiler(formId, formQr, formOwner, formLocation);

      setWriteMsg("Transaction envoyee, attente de confirmation...");
      await tx.wait();

      setWriteMsg(`✅ Chaudiere ${formId} enregistree !`);
      setFormId(""); setFormQr(""); setFormOwner(""); setFormLocation("");
    } catch (err) {
      console.error(err);
      if (err.code === "ACTION_REJECTED") {
        setWriteMsg("❌ Signature refusee dans MetaMask.");
      } else if (err.reason) {
        setWriteMsg(`❌ Refuse par le contrat : ${err.reason}`);
      } else {
        setWriteMsg("❌ Echec de la transaction (voir console).");
      }
    } finally {
      setIsWriting(false);
    }
  }

  const champStyle = { padding: "10px", fontSize: "15px", width: "280px", marginBottom: "10px", display: "block", marginLeft: "auto", marginRight: "auto" };

  return (
    <div style={{ textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>
      <h1>CHAUDIERE-WEB3</h1>
      <p>Registre blockchain pour l'entretien des chaudieres</p>

      {/* Connexion wallet */}
      <div style={{ marginBottom: "20px" }}>
        {account ? (
          <p>
            <span style={{ color: "green" }}>●</span>{" "}
            Connecté : <strong>{account.slice(0, 6)}...{account.slice(-4)}</strong>
          </p>
        ) : (
          <button onClick={connectWallet} disabled={isConnecting}
            style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer",
              backgroundColor: "#f6851b", color: "white", border: "none", borderRadius: "8px" }}>
            {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
          </button>
        )}
        {account && !isCorrectNetwork && (
          <p style={{ color: "orange" }}>⚠️ Mauvais reseau. Passe sur Hardhat 31337 dans MetaMask.</p>
        )}
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>

      <p><strong>Administrateur (owner) :</strong> {owner}</p>

      {/* Formulaire d'enregistrement (affiche seulement si connecte) */}
      {account && (
        <div style={{ marginTop: "30px", padding: "20px", border: "2px solid #f6851b",
          borderRadius: "8px", display: "inline-block" }}>
          <h2 style={{ marginTop: 0 }}>Enregistrer une chaudiere</h2>
          <input style={champStyle} placeholder="ID (ex: CHAUD-002)"
            value={formId} onChange={(e) => setFormId(e.target.value)} />
          <input style={champStyle} placeholder="QR Code (ex: QR-002)"
            value={formQr} onChange={(e) => setFormQr(e.target.value)} />
          <input style={champStyle} placeholder="Proprietaire (ex: Marie Martin)"
            value={formOwner} onChange={(e) => setFormOwner(e.target.value)} />
          <input style={champStyle} placeholder="Emplacement (ex: Villeurbanne)"
            value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
          <button onClick={enregistrerChaudiere} disabled={isWriting}
            style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer",
              backgroundColor: "#f6851b", color: "white", border: "none", borderRadius: "8px" }}>
            {isWriting ? "Enregistrement..." : "Enregistrer"}
          </button>
          {writeMsg && <p style={{ marginBottom: 0 }}>{writeMsg}</p>}
        </div>
      )}

      {/* Recherche */}
      <div style={{ marginTop: "30px" }}>
        <input type="text" placeholder="Entrez un ID (ex: CHAUD-001)"
          value={searchId} onChange={(e) => setSearchId(e.target.value)}
          style={{ padding: "10px", fontSize: "16px", width: "250px" }} />
        <button onClick={chercherChaudiere}
          style={{ padding: "10px 20px", fontSize: "16px", marginLeft: "10px", cursor: "pointer" }}>
          Chercher
        </button>
      </div>

      {message && <p style={{ color: "red", marginTop: "15px" }}>{message}</p>}

      {boiler && (
        <div style={{ marginTop: "30px", padding: "20px", border: "1px solid #ccc",
          borderRadius: "8px", display: "inline-block", textAlign: "left" }}>
          <h2>Chaudiere : {boiler.boilerId}</h2>
          <p><strong>QR Code :</strong> {boiler.qrCode}</p>
          <p><strong>Proprietaire :</strong> {boiler.owner}</p>
          <p><strong>Emplacement :</strong> {boiler.location}</p>
          <p><strong>Existe :</strong> {boiler.exists ? "Oui" : "Non"}</p>
        </div>
      )}
    </div>
  );
}

export default App;