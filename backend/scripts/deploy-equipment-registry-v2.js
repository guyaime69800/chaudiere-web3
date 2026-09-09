const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("────────────────────────────────────────");
  console.log("Déploiement EquipmentRegistryV2");
  console.log("Réseau :", network.name);
  console.log("Propriétaire :", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(
    "Solde :",
    ethers.formatEther(balance),
    network.name === "polygon" ? "POL" : "ETH de test"
  );
  console.log("────────────────────────────────────────");

  const EquipmentRegistryV2 = await ethers.getContractFactory(
    "EquipmentRegistryV2"
  );

  console.log("Déploiement en cours...");

  const registry = await EquipmentRegistryV2.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  const ownerAddress = await registry.owner();
  const ownerIsWriter = await registry.writers(ownerAddress);

  console.log("");
  console.log("Contrat déployé avec succès.");
  console.log("Adresse du contrat :", contractAddress);
  console.log("Propriétaire :", ownerAddress);
  console.log("Propriétaire autorisé à écrire :", ownerIsWriter);
  console.log("Contrat en pause :", await registry.paused());
  console.log("");
  console.log(
    "Attention : conservez l’adresse uniquement si le déploiement est effectué sur un réseau permanent."
  );
}

main().catch((error) => {
  console.error("Échec du déploiement :");
  console.error(error);
  process.exitCode = 1;
});