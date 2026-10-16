const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();

  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("-----------------------------------------------------");
  console.log("Reseau            :", hre.network.name);
  console.log("Chain ID          :", network.chainId.toString());
  console.log("Compte deployeur  :", deployer.address);
  console.log(
    "Solde du compte   :",
    hre.ethers.formatEther(balance),
    "POL / ETH de test"
  );
  console.log("-----------------------------------------------------");

  // Protection contre un deploiement accidentel sur Polygon mainnet.
  if (
    network.chainId === 137n &&
    process.env.CONFIRM_POLYGON_DEPLOY !== "YES"
  ) {
    throw new Error(
      "Deploiement Polygon bloque par securite. Confirmation manquante."
    );
  }

  const EquipmentRegistry =
    await hre.ethers.getContractFactory("EquipmentRegistry");

  console.log("Deploiement de EquipmentRegistry en cours...");

  const equipmentRegistry = await EquipmentRegistry.deploy();

  await equipmentRegistry.waitForDeployment();

  const contractAddress = await equipmentRegistry.getAddress();

  console.log("-----------------------------------------------------");
  console.log("EquipmentRegistry deploye avec succes.");
  console.log("Adresse du contrat :", contractAddress);
  console.log("-----------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});