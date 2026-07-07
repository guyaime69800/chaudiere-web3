// On importe les deux outils React : useState (case memoire) et useEffect (lancement auto)
import { useState, useEffect } from "react";
// App.jsx = l'ecran principal de ton application (ce qui s'affiche dans le navigateur)
// On importe "ethers", notre traducteur entre la page web et la blockchain
import { ethers } from "ethers";

// On importe l'adresse "postale" de notre contrat (rangee dans le dossier blockchain)
import { CONTRACT_ADDRESS } from "./blockchain/contract-address";

// On importe l'ABI, le "mode d'emploi" du contrat (la liste de ses boutons)
import BoilerRegistryABI from "./blockchain/BoilerRegistry.json";
// "App" est un composant React : une fonction qui retourne ce qu'on veut afficher a l'ecran (du "JSX")
function App() {
  // Case memoire : elle contiendra l'adresse de l'administrateur (owner) une fois lue
  // Au depart, elle est vide (chaine ""). Quand on change sa valeur, l'ecran se met a jour tout seul.
  const [owner, setOwner] = useState("");
  // Case memoire n2 : elle contiendra les infos de la chaudiere CHAUD-001.
  // Au depart "null" = rien de charge encore (le contrat n'a pas encore repondu).
  const [boiler, setBoiler] = useState(null);
  // Case memoire : le texte tape dans le champ de recherche (ex: "CHAUD-001")
  const [searchId, setSearchId] = useState("");
  // Message affiche si la chaudiere cherchee n'existe pas
  const [message, setMessage] = useState("");
  // On cree le "fil branche" (provider) vers notre blockchain locale (porte 8545)
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  // On fabrique la "telecommande" du contrat : adresse + mode d'emploi (ABI) + fil (provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, BoilerRegistryABI.abi, provider);
  // useEffect = bloc qui se lance tout seul au chargement de la page
  useEffect(() => {
    // On definit une petite fonction "async" car lire la blockchain prend un peu de temps
    async function lireOwner() {
      // On appuie sur le bouton "owner" du contrat et on ATTEND (await) la reponse
      const adresseOwner = await contract.owner();
      // On range la reponse dans la case memoire -> l'ecran se met a jour tout seul
      setOwner(adresseOwner);
    }
    // On lance la fonction qu'on vient de definir
    lireOwner();
    
  }, []); // Le [] vide veut dire : "ne fais ceci qu'UNE SEULE fois, au chargement"
  // Fonction lancee quand on clique sur "Chercher"
  async function chercherChaudiere() {
    setMessage("");                               // on vide l'ancien message
    const data = await contract.boilers(searchId); // on lit l'ID tape
    if (data.exists) {
      setBoiler(data);                            // trouvee -> on affiche
    } else {
      setBoiler(null);                            // rien a afficher
      setMessage("Aucune chaudiere trouvee avec cet identifiant.");
    }
  }
  return (
    <div style={{ textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>

      {/* Le titre principal de ton projet */}
     <h1>🔧 CHAUDIERE-WEB3</h1>

      {/* Un sous-titre qui explique ton projet */}


      <p>Registre blockchain pour l'entretien des chaudieres</p>
{/* On affiche l'adresse de l'administrateur (owner) lue depuis le contrat */}
        <p>
          <strong>Administrateur (owner) :</strong> {owner}
        </p>
        {/* Zone de recherche d'une chaudiere par son identifiant */}
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

        {/* Message affiche si aucune chaudiere n'est trouvee */}
        {message && <p style={{ color: "red", marginTop: "15px" }}>{message}</p>}
        {/* On affiche les infos de la chaudiere CHAUD-001, mais SEULEMENT si elle est chargee */}
        {boiler && (
          <div style={{ marginTop: "30px", padding: "20px", border: "1px solid #ccc", borderRadius: "8px", display: "inline-block", textAlign: "left" }}>
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

// On "exporte" le composant App pour que le reste de l'appli puisse l'afficher
export default App;