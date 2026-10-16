const { ethers, network } = require("hardhat");

async function main() {
  const serverWalletAddress = process.env.SERVER_WALLET_ADDRESS;

  if (
    !serverWalletAddress ||
    !ethers.isAddress(serverWalletAddress) ||
    serverWalletAddress === ethers.ZeroAddress
  ) {
    throw new Error(
      "SERVER_WALLET_ADDRESS est absente ou invalide dans backend/.env."
    );
  }

  const [owner] = await ethers.getSigners();

  if (!owner) {
    throw new Error(
      "Aucun portefeuille propriétaire n'est configuré."
    );
  }

  if (
    serverWalletAddress.toLowerCase() ===
    owner.address.toLowerCase()
  ) {
    throw new Error(
      "Le portefeuille serveur doit être différent du propriétaire."
    );
  }

  const blockchainNetwork = await ethers.provider.getNetwork();
  const chainId = blockchainNetwork.chainId;

  if (network.name === "polygon" && chainId !== 137n) {
    throw new Error(
      `Mauvais réseau Polygon : Chain ID ${chainId.toString()}.`
    );
  }

  const ownerBalance = await ethers.provider.getBalance(owner.address);

  console.log("");
  console.log("==============================================");
  console.log("DÉPLOIEMENT EQUIPMENTREGISTRYV2");
  console.log("==============================================");
  console.log("Réseau :", network.name);
  console.log("Chain ID :", chainId.toString());
  console.log("Propriétaire :", owner.address);
  console.log("Portefeuille serveur :", serverWalletAddress);
  console.log(
    "Solde propriétaire :",
    ethers.formatEther(ownerBalance)
  );
  console.log("==============================================");
  console.log("");

  const EquipmentRegistryV2 = await ethers.getContractFactory(
    "EquipmentRegistryV2"
  );

  console.log("1/2 — Déploiement du contrat...");

  const registry = await EquipmentRegistryV2.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  const deploymentTransaction = registry.deploymentTransaction();

  console.log("Contrat déployé :", contractAddress);
  console.log(
    "Transaction de déploiement :",
    deploymentTransaction.hash
  );

  console.log("");
  console.log("2/2 — Autorisation du portefeuille serveur...");

  const authorizationTransaction = await registry.setWriter(
    serverWalletAddress,
    true
  );

  await authorizationTransaction.wait();

  const savedOwner = await registry.owner();
  const ownerIsWriter = await registry.writers(savedOwner);
  const serverIsWriter = await registry.writers(
    serverWalletAddress
  );
  const contractIsPaused = await registry.paused();

  if (
    savedOwner.toLowerCase() !== owner.address.toLowerCase() ||
    ownerIsWriter !== true ||
    serverIsWriter !== true ||
    contractIsPaused !== false
  ) {
    throw new Error(
      "La vérification finale du contrat a échoué."
    );
  }

  console.log("");
  console.log("==============================================");
  console.log("DÉPLOIEMENT TERMINÉ ET VÉRIFIÉ");
  console.log("==============================================");
  console.log("Adresse du contrat :", contractAddress);
  console.log("Propriétaire autorisé :", ownerIsWriter);
  console.log("Serveur autorisé :", serverIsWriter);
  console.log("Contrat en pause :", contractIsPaused);
  console.log(
    "Transaction d'autorisation :",
    authorizationTransaction.hash
  );
  console.log("==============================================");
  console.log("");

  if (network.name === "hardhat") {
    console.log(
      "Test local terminé : cette adresse est temporaire."
    );
  } else {
    console.log(
      "IMPORTANT : conservez l'adresse permanente du contrat."
    );
  }
}

main().catch((error) => {
  console.error("");
  console.error("ÉCHEC DU DÉPLOIEMENT :");
  console.error(error.message);
  process.exitCode = 1;
});