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
    </div>
  );
}

// On "exporte" le composant App pour que le reste de l'appli puisse l'afficher
export default App;