// ScannerQR.jsx
// Lit un QR puis transmet son identifiant à App.jsx.
// Accepte les anciens identifiants et les futurs jetons QR aléatoires.

import { Scanner } from "@yudiel/react-qr-scanner";
import { useState } from "react";

const CUIVRE = "#B87333";

// Vérifie uniquement le FORMAT : le serveur vérifiera ensuite
// que le CarnetPass existe et quelles informations sont accessibles.
function identifiantValide(identifiant) {
  // Format prévu : cp_qr_ suivi de 43 caractères.
  // Les majuscules/minuscules d'un jeton ne doivent jamais être changées.
  // Un préfixe ressemblant à celui d'un jeton ne doit pas être accepté
  // comme un ancien identifiant si le jeton est mal formé.
  if (/^cp_qr_/i.test(identifiant)) {
    return /^cp_qr_[A-Za-z0-9_-]{43}$/.test(identifiant);
  }

  // Compatibilité avec les anciens QR : CP-2026-000003, CHAUD-DEMO, etc.
  return /^[A-Za-z0-9._-]{3,40}$/.test(identifiant);
}

function extraireId(valeur, origineCourante) {
  if (typeof valeur !== "string") return null;

  const texte = valeur.trim();
  if (!texte || texte.length > 2048) return null;

  // Cas 1 : identifiant ou jeton écrit directement dans le QR.
  if (identifiantValide(texte)) return texte;

  // Cas 2 : adresse complète d'une fiche CarnetPass.
  try {
    const url = new URL(texte);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    // Aucun identifiant de connexion n'est attendu dans une adresse QR.
    if (url.username || url.password) return null;

    const originesAutorisees = new Set([
      "https://carnetpass.fr",
      "https://www.carnetpass.fr",
      "https://carnetpass.com",
      "https://www.carnetpass.com",
      "https://test.carnetpass.fr",
      origineCourante,
    ]);

    if (!originesAutorisees.has(url.origin)) return null;

    // Une seule partie après /appareil/ ; une barre finale est tolérée.
    const correspondance = url.pathname.match(/^\/appareil\/([^/]+)\/?$/);
    if (!correspondance) return null;

    const identifiant = decodeURIComponent(correspondance[1]);
    return identifiantValide(identifiant) ? identifiant : null;
  } catch {
    // Adresse invalide ou caractères encodés incorrectement.
    return null;
  }
}

export default function ScannerQR({ onClose, onCodeDetecte }) {
  const [erreur, setErreur] = useState("");

  const handleScan = (codesDetectes) => {
    const valeur = codesDetectes?.[0]?.rawValue;
    if (!valeur) return;

    const identifiant = extraireId(valeur, window.location.origin);

    if (identifiant) {
      // On transmet uniquement l'identifiant : App.jsx ouvre la fiche
      // dans l'application courante, jamais sur le site contenu dans le QR.
      onCodeDetecte(identifiant);
    } else {
      setErreur("Ce QR n'est pas un QR CarnetPass valide.");
    }
  };

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
          formats={["qr_code"]}
          constraints={{ facingMode: "environment" }}
          components={{ finder: true, torch: true }}
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
    width: "min(96vw, 520px)", aspectRatio: "3 / 4",
    overflow: "hidden", borderRadius: 16, border: `3px solid ${CUIVRE}`,
  },
  aide: {
    marginTop: 20, color: "#fff", fontSize: 15,
    textAlign: "center", padding: "0 24px",
  },
};