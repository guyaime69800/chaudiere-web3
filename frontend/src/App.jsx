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
    // On definit une 2e fonction async pour lire les infos de la chaudiere
    async function lireBoiler() {
      // On appuie sur le bouton "boilers" du contrat avec l'identifiant de la chaudiere
      const data = await contract.boilers("CHAUD-001");
      // On range le paquet d'infos recu dans la case memoire "boiler"
      setBoiler(data);
    }
    lireBoiler(); // on lance la lecture de la chaudiere
  }, []); // Le [] vide veut dire : "ne fais ceci qu'UNE SEULE fois, au chargement"
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