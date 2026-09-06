// CARNETPASS — OUTILS D'ACCÈS PUBLIC
// Emplacement : frontend/api/lib/carnetpass-access.js
// Ce module est réservé au serveur. Ne pas l'importer dans frontend/src.
// Il sera utilisé par carnetpass.js et search.js.

import { createHash, randomBytes } from "node:crypto";

// 32 octets aléatoires deviennent 43 caractères compatibles avec une URL.
// Avec le préfixe cp_qr_, le jeton contient exactement 49 caractères.
// Ce format correspond à celui accepté par ScannerQR.jsx.
const QR_TOKEN_PATTERN = /^cp_qr_[A-Za-z0-9_-]{43}$/;

export function createQrToken() {
  return `cp_qr_${randomBytes(32).toString("base64url")}`;
}

export function isQrToken(value) {
  return typeof value === "string"
    && value.length === 49
    && QR_TOKEN_PATTERN.test(value);
}

// Calcule le nom de l'entrée Redis associée à un jeton.
// Hash = empreinte numérique : la base utilisera cette empreinte,
// sans avoir besoin de conserver le jeton lisible dans la fiche.
// Cette fonction ne lit et n'écrit rien dans Redis.
export function qrTokenRedisKey(qrToken) {
  if (!isQrToken(qrToken)) {
    throw new TypeError("Format du jeton QR invalide.");
  }

  const fingerprint = createHash("sha256")
    .update(qrToken, "utf8")
    .digest("hex");

  return `carnetpass:qr:${fingerprint}`;
}

// Une valeur inattendue (objet, liste...) ne doit pas être recopiée
// dans un champ public censé contenir du texte.
function publicText(value) {
  return typeof value === "string" ? value : null;
}

// Construit une NOUVELLE fiche contenant uniquement les champs autorisés.
// Ne jamais remplacer cette sélection par ...carnetPass ou ...identity.
// Aucun numéro de série, historique, client, photo, facture, note,
// jeton QR ou empreinte du jeton n'est ajouté à cette réponse.
export function toPublicCarnetPass(carnetPass) {
  if (!carnetPass || typeof carnetPass !== "object"
      || Array.isArray(carnetPass)) {
    return null;
  }

  const identity = carnetPass.identity ?? {};

  return {
    // Le numéro métier reste visible.
    carnetPassId: publicText(carnetPass.carnetPassId),

    // Cet identifiant technique permet de retrouver les documents
    // du modèle et de conserver le fonctionnement de l'IA documentaire.
    equipmentId: publicText(carnetPass.equipmentId),
    manufacturerReference: publicText(carnetPass.manufacturerReference),

    identity: {
      brand: publicText(identity.brand),
      productType: publicText(identity.productType),
      range: publicText(identity.range),
      model: publicText(identity.model),
      variant: publicText(identity.variant),
    },
  };
}

// IMPORTANT : un jeton QR sert à retrouver une fiche technique publique.
// Il ne prouve ni la connexion à un compte ni l'appartenance à une entreprise.
// Les accès Pro devront vérifier ces autorisations séparément côté serveur.