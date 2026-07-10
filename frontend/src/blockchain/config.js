// config.js — le panneau de reglages central de l'application
// Les valeurs viennent du fichier .env (racine de frontend/).
// Pour changer de reseau (local -> Polygon Amoy) : on modifie le .env, JAMAIS le code.

// import.meta.env = le "casier" ou Vite depose les variables du .env
// (uniquement celles qui commencent par VITE_)
export const RPC_URL = import.meta.env.VITE_RPC_URL;
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Garde-fou : si un reglage manque, message clair dans la console
// au lieu d'un plantage mysterieux (ex : .env oublie apres un git clone)
if (!RPC_URL || !CONTRACT_ADDRESS) {
  console.error(
    "⚠️ Reglages manquants : verifie frontend/.env (VITE_RPC_URL et VITE_CONTRACT_ADDRESS) puis redemarre npm run dev."
  );
}