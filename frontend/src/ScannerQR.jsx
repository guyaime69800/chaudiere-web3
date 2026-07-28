// ScannerQR.jsx
// -----------------------------------------------------------------------------
// Scanner de QR code par la camera du telephone.
// Ce composant fait UNE seule chose : lire un QR et renvoyer l'identifiant
// de l'appareil. C'est App.jsx qui decide ensuite quoi en faire.
// -----------------------------------------------------------------------------

import { Scanner } from "@yudiel/react-qr-scanner";
import { useState } from "react";

const CUIVRE = "#B87333"; // couleur de l'identite CarnetPass

export default function ScannerQR({ onClose, onCodeDetecte }) {
  const [erreur, setErreur] = useState("");

  // Transforme le contenu du QR en identifiant d'appareil.
  // Cas 1 : une adresse complete -> https://carnetpass.fr/appareil/CHAUD-DEMO
  // Cas 2 : juste l'identifiant  -> CHAUD-DEMO
  // Renvoie null si ce n'est pas un QR CarnetPass.
  function extraireId(valeur) {
    const texte = valeur.trim();

    try {
      // On ne garde QUE le chemin de l'adresse. Aucun risque d'etre envoye
      // sur un site exterieur, meme avec un QR trafique.
      const chemin = new URL(texte).pathname; // -> "/appareil/CHAUD-DEMO"
      if (chemin.startsWith("/appareil/")) {
        return decodeURIComponent(chemin.replace("/appareil/", ""));
      }
      return null; // c'est bien une adresse, mais pas une fiche CarnetPass
    } catch {
      // Pas une adresse web : on accepte un identifiant ecrit tel quel
      const formatId = /^[A-Za-z0-9._-]{3,40}$/; // lettres, chiffres, - . _
      return formatId.test(texte) ? texte : null;
    }
  }

  // Appelee des qu'un QR est detecte par la camera
  const handleScan = (codesDetectes) => {
    const valeur = codesDetectes?.[0]?.rawValue; // on prend le premier QR lu
    if (!valeur) return;

    const id = extraireId(valeur);
    if (id) {
      onCodeDetecte(id); // on remonte l'info a App.jsx
    } else {
      setErreur("Ce QR n'est pas un QR CarnetPass.");
    }
  };

  // Appelee si la camera ne demarre pas (autorisation refusee, pas de camera...)
  const handleError = (err) => {
    setErreur("Caméra inaccessible. Vérifie l'autorisation du navigateur.");
    console.error("[scan] erreur camera :", err);
  };

  return (
    <div style={styles.overlay}>
      <button style={styles.boutonFermer} onClick={onClose}>
        ✕ Fermer
      </button>

      <div style={styles.zoneCamera}>
        <Scanner
          onScan={handleScan}
          onError={handleError}
          formats={["qr_code"]}                       // on ne lit QUE les QR : plus rapide et plus fiable
          constraints={{ facingMode: "environment" }} // camera arriere du telephone
          components={{ finder: true, torch: true }}  // cadre de visee + lampe torche
          styles={{
            container: { width: "100%", height: "100%" },
            finderBorder: 4,
          }}
        />
      </div>

      <p style={styles.aide}>
        {erreur || "Vise le QR code collé sur l'appareil"}
      </p>
    </div>
  );
}

// Styles ecrits ici : le composant marche sans ajouter de fichier CSS
const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "#000",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  boutonFermer: {
    position: "absolute", top: 16, right: 16,
    padding: "8px 14px", background: CUIVRE, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer",
  },
 zoneCamera: {
    // Format vertical proche de l'ecran du telephone : bien plus grand qu'un carre.
    width: "min(96vw, 520px)", aspectRatio: "3 / 4",
    overflow: "hidden", borderRadius: 16, border: `3px solid ${CUIVRE}`,
  },
  aide: {
    marginTop: 20, color: "#fff", fontSize: 15,
    textAlign: "center", padding: "0 24px",
  },
};