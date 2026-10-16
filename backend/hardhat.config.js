// On charge les variables du fichier .env (cle privee, URL RPC)
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

// On lit les reglages depuis le .env (jamais ecrits en dur dans ce fichier)
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    // Reseau local Hardhat (celui qu'on utilise depuis le debut)
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Reseau public Polygon (le VRAI reseau - mainnet, chainId 137)
    polygon: {
      url: POLYGON_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 137,
    },
  },
};