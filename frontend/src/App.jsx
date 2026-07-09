import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "./blockchain/contract-address";
import BoilerRegistryABI from "./blockchain/BoilerRegistry.json";
// NOUVEAU : on importe notre hook de connexion wallet
import { useWallet } from "./blockchain/useWallet";

function App() {
  // --- Lecture (inchange) ---
  const [owner, setOwner] = useState("");
  const [boiler, setBoiler] = useState(null);
  const [searchId, setSearchId] = useState("");
  const [message, setMessage] = useState("");

  // Provider en LECTURE SEULE (dette #1 : URL en dur, a corriger avant Polygon)
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, BoilerRegistryABI.abi, provider);

  // --- NOUVEAU : la connexion wallet, geree par notre hook ---
  const {
    account,          // adresse connectee (null si pas connecte)
    connectWallet,    // fonction a appeler au clic du bouton
    isConnecting,     // true pendant la connexion
    error,            // message d'erreur du wallet
    isCorrectNetwork, // true si on est bien sur Hardhat 31337
  } = useWallet();

  // Au chargement : on lit l'administrateur (owner)
  useEffect(() => {
    async function lireOwner() {
      const adresseOwner = await contract.owner();
      setOwner(adresseOwner);
    }
    lireOwner();
  }, []);

  // Clic sur "Chercher"
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

  return (
    <div style={{ textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>
      <h1>CHAUDIERE-WEB3</h1>
      <p>Registre blockchain pour l'entretien des chaudieres</p>

      {/* NOUVEAU : zone de connexion wallet */}
      <div style={{ marginBottom: "20px" }}>
        {account ? (
          // Cas connecte : adresse en version courte + point vert
          <p>
            <span style={{ color: "green" }}>●</span>{" "}
            Connecté : <strong>{account.slice(0, 6)}...{account.slice(-4)}</strong>
          </p>
        ) : (
          // Cas non connecte : le bouton
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            style={{
              padding: "10px 20px", fontSize: "16px", cursor: "pointer",
              backgroundColor: "#f6851b", color: "white",
              border: "none", borderRadius: "8px",
            }}
          >
            {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
          </button>
        )}

        {/* Avertissement si connecte mais mauvais reseau */}
        {account && !isCorrectNetwork && (
          <p style={{ color: "orange" }}>
            ⚠️ Tu n'es pas sur le reseau Hardhat 31337. Change de reseau dans MetaMask.
          </p>
        )}

        {/* Message d'erreur eventuel */}
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>

      <p><strong>Administrateur (owner) :</strong> {owner}</p>

      {/* Zone de recherche (inchange) */}
      <div style={{ marginTop: "30px" }}>
        <input
          type="text"
          placeholder="Entrez un ID (ex: CHAUD-001)"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          style={{ padding: "10px", fontSize: "16px", width: "250px" }}
        />
        <button
          onClick={chercherChaudiere}
          style={{ padding: "10px 20px", fontSize: "16px", marginLeft: "10px", cursor: "pointer" }}
        >
          Chercher
        </button>
      </div>

      {message && <p style={{ color: "red", marginTop: "15px" }}>{message}</p>}

      {/* Fiche chaudiere */}
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