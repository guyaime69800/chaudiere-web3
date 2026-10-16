// On importe Hardhat, qui nous donne acces a "ethers" (le traducteur blockchain)
const hre = require("hardhat");

async function main() {
  // --- VERIFICATION AVANT DEPENSE (mainnet = vrai argent, on ne suppose pas) ---
  // On recupere le compte qui va payer : celui dont la cle privee est dans .env
  const [deployer] = await hre.ethers.getSigners();
  // On lit son solde sur le reseau vise (ici Polygon, donc en POL)
  const solde = await hre.ethers.provider.getBalance(deployer.address);

  console.log("-----------------------------------------------------");
  console.log("Compte deployeur :", deployer.address);
  console.log("Solde du compte  :", hre.ethers.formatEther(solde), "POL");
  console.log("-----------------------------------------------------");

  // 1. On recupere le "moule" du contrat compile
  const BoilerRegistry = await hre.ethers.getContractFactory("BoilerRegistry");
  // 2. On deploie : on installe une copie du contrat sur la blockchain
  const boilerRegistry = await BoilerRegistry.deploy();
  // 3. On attend que la blockchain confirme l'installation
  await boilerRegistry.waitForDeployment();
  // 4. On affiche l'adresse "postale" du contrat sur la blockchain
  console.log("BoilerRegistry deploye a l'adresse :", await boilerRegistry.getAddress());
}

// On lance main() et on affiche l'erreur proprement si quelque chose casse
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});