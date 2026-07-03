// On importe Hardhat, qui nous donne acces a "ethers" (le traducteur blockchain)
const hre = require("hardhat");

async function main() {
  // 1. On recupere le "moule" du contrat compile (le plan de fabrication du registre)
  const BoilerRegistry = await hre.ethers.getContractFactory("BoilerRegistry");

  // 2. On deploie : on installe une copie du contrat sur la blockchain
  const boilerRegistry = await BoilerRegistry.deploy();

  // 3. On attend que la blockchain confirme l'installation
  await boilerRegistry.waitForDeployment();

  // 4. On affiche l'adresse du contrat : son "adresse postale" sur la blockchain
  console.log("BoilerRegistry deploye a l'adresse :", await boilerRegistry.getAddress());
}

// On lance main() et on affiche l'erreur proprement si quelque chose se passe mal
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});