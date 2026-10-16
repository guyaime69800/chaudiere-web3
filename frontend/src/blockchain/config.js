// config.js - le panneau de reglages central de l'application
// Les valeurs viennent du fichier .env (racine de frontend/).
// Pour changer de reseau (local -> Polygon Amoy) : on modifie le .env, JAMAIS le code.

// import.meta.env = le "casier" ou Vite depose les variables du .env
export const RPC_URL = import.meta.env.VITE_RPC_URL;
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Le chainId est le "numero de la blockchain" : 31337 = Hardhat local, 80002 = Polygon Amoy.
// Ethers v6 attend un BigInt (un tres grand nombre, note avec un "n" a la fin : 31337n).
// Le .env ne sait stocker que du texte : on convertit ici, en un seul endroit.
const rawChainId = import.meta.env.VITE_CHAIN_ID;
export const CHAIN_ID = rawChainId ? BigInt(rawChainId) : null;

// Garde-fou : si un reglage manque, message clair dans la console
if (!RPC_URL || !CONTRACT_ADDRESS || !CHAIN_ID) {
  console.error(
    "Reglages manquants : verifie frontend/.env (VITE_RPC_URL, VITE_CONTRACT_ADDRESS, VITE_CHAIN_ID) puis redemarre npm run dev."
  );
}