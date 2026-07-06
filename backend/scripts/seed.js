// ============================================================
//  SCRIPT DE PEUPLEMENT (seed) - CHAUDIERE-WEB3
//  Mission : enregistrer UNE chaudiere de test dans le contrat
//  DEJA deploye (on ne redeploie rien ici).
// ============================================================

// On importe Hardhat, qui nous donne acces a "ethers" (le traducteur blockchain)
const hre = require("hardhat");

// L'adresse "postale" de notre contrat deja deploye (la meme que le frontend)
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  console.log("--- DEBUT DU PEUPLEMENT ---\n");

  // 1. On recupere le "moule" du contrat (son plan de fabrication)
  const BoilerRegistry = await hre.ethers.getContractFactory("BoilerRegistry");

  // 2. On se BRANCHE sur le contrat existant via son adresse (on ne le recree pas)
  const registry = BoilerRegistry.attach(CONTRACT_ADDRESS);
  console.log("Connecte au contrat a l'adresse :", CONTRACT_ADDRESS, "\n");

  // 3. On enregistre une chaudiere de test (fonction registerBoiler du contrat)
  //    Rappel : registerBoiler est reserve a l'administrateur (onlyOwner).
  const tx = await registry.registerBoiler(
    "CHAUD-001",              // _boilerId  : identifiant unique de la chaudiere
    "QR-CODE-XYZ-123",        // _qrCode    : le code du QR colle sur l'appareil
    "Jean Dupont",            // _owner     : le proprietaire (texte)
    "12 rue des Lilas, Lyon"  // _location  : l'emplacement physique
  );

  // 4. On ATTEND que la transaction soit inscrite dans un bloc
  await tx.wait();
  console.log("Chaudiere CHAUD-001 enregistree avec succes !\n");

  console.log("--- FIN DU PEUPLEMENT ---");
}

// On lance main() et on affiche proprement une eventuelle erreur
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});