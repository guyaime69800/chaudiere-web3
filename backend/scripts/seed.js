// ==========================================================
//  SCRIPT DE PEUPLEMENT (seed) - CHAUDIERE-WEB3
//  Mission : enregistrer UNE chaudiere de DEMO (100% fictive)
//  dans le contrat DEJA deploye sur Polygon MAINNET.
//  (on ne redeploie rien : on se branche sur l'existant)
// ==========================================================

// On importe Hardhat, qui nous donne acces a "ethers" (le traducteur blockchain)
const hre = require("hardhat");

// L'adresse "postale" de notre contrat sur Polygon MAINNET.
// IMPORTANT : c'est l'adresse mainnet, PAS l'ancienne adresse locale 0x5FbD...
const CONTRACT_ADDRESS = "0x8D36C04b579372a52C5FCB3A0a4f236438c89F87";

async function main() {
  console.log("--- DEBUT DU PEUPLEMENT ---\n");

  // === GARDE-FOU 1 : QUI signe, sur QUEL reseau, avec COMBIEN ? ===
  // (mainnet = vrai argent : on affiche tout AVANT d'ecrire)
  const reseau = await hre.ethers.provider.getNetwork();
  const [signataire] = await hre.ethers.getSigners();
  const solde = await hre.ethers.provider.getBalance(signataire.address);

  console.log("-----------------------------------------------------");
  console.log("Reseau (chainId) :", reseau.chainId.toString());
  console.log("Compte signataire :", signataire.address);
  console.log("Solde du compte   :", hre.ethers.formatEther(solde), "POL");
  console.log("-----------------------------------------------------\n");

  // === GARDE-FOU 2 : y a-t-il VRAIMENT un contrat a cette adresse ? ===
  // getCode() lit le code installe a l'adresse. "0x" = adresse vide = AUCUN contrat.
  // Evite le piege silencieux : ecrire dans le vide, payer, croire que ca a marche.
  const code = await hre.ethers.provider.getCode(CONTRACT_ADDRESS);
  if (code === "0x") {
    throw new Error(
      "AUCUN contrat trouve a l'adresse " + CONTRACT_ADDRESS +
      " sur ce reseau. Verifie l'adresse et le --network. On n'ecrit RIEN."
    );
  }
  console.log("Contrat bien present a l'adresse :", CONTRACT_ADDRESS, "\n");

  // 1. On recupere le "moule" du contrat (son plan de fabrication)
  const BoilerRegistry = await hre.ethers.getContractFactory("BoilerRegistry");

  // 2. On se BRANCHE sur le contrat existant via son adresse (on ne le recree pas)
  const registry = BoilerRegistry.attach(CONTRACT_ADDRESS);

  // 3. On enregistre une chaudiere de DEMO (fonction registerBoiler du contrat)
  //    Rappel : registerBoiler est reserve a l'administrateur (onlyOwner).
  //    DONNEES 100% FICTIVES (RGPD) : aucune vraie personne, aucune vraie adresse.
  const tx = await registry.registerBoiler(
    "CHAUD-DEMO",                        // _boilerId  : identifiant de demonstration
    "DEMO-QR-001",                       // _qrCode    : QR de demonstration
    "Client Demo",                       // _owner     : nom fictif (pas une vraie personne)
    "1 rue de la Demo, 00000 Demoville"  // _location  : adresse volontairement bidon
  );

  console.log("Transaction envoyee, en attente de confirmation...");

  // 4. On ATTEND que la transaction soit inscrite dans un bloc
  await tx.wait();
  console.log("Chaudiere CHAUD-DEMO enregistree avec succes !\n");

  console.log("--- FIN DU PEUPLEMENT ---");
}

// On lance main() et on affiche proprement une eventuelle erreur
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});