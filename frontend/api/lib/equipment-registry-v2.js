import { ethers } from "ethers";

// Ce fichier s’exécute uniquement sur le serveur Vercel.
// Ne jamais l’importer dans frontend/src.

const POLYGON_CHAIN_ID = 137n;

const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function writers(address) view returns (bool)",
];

function requiredEnvironmentVariable(name) {
  const value = process.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Configuration serveur manquante : ${name}.`);
  }

  return value.trim();
}

export async function checkEquipmentRegistryV2() {
  const rpcUrl = requiredEnvironmentVariable("POLYGON_RPC_URL");
  const privateKey = requiredEnvironmentVariable(
    "POLYGON_SERVER_PRIVATE_KEY"
  );
  const contractAddress = requiredEnvironmentVariable(
    "EQUIPMENT_REGISTRY_V2_ADDRESS"
  );
  const expectedWalletAddress = requiredEnvironmentVariable(
    "POLYGON_SERVER_WALLET_ADDRESS"
  );

  let parsedRpcUrl;

  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error("POLYGON_RPC_URL est invalide.");
  }

  if (parsedRpcUrl.protocol !== "https:") {
    throw new Error("POLYGON_RPC_URL doit utiliser HTTPS.");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("POLYGON_SERVER_PRIVATE_KEY est invalide.");
  }

  if (
    !ethers.isAddress(contractAddress) ||
    contractAddress === ethers.ZeroAddress
  ) {
    throw new Error("EQUIPMENT_REGISTRY_V2_ADDRESS est invalide.");
  }

  if (
    !ethers.isAddress(expectedWalletAddress) ||
    expectedWalletAddress === ethers.ZeroAddress
  ) {
    throw new Error("POLYGON_SERVER_WALLET_ADDRESS est invalide.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw new Error(
      `Mauvais réseau Polygon : Chain ID ${network.chainId.toString()}.`
    );
  }

  const serverWallet = new ethers.Wallet(privateKey, provider);

  if (
    serverWallet.address.toLowerCase() !==
    expectedWalletAddress.toLowerCase()
  ) {
    throw new Error(
      "La clé serveur ne correspond pas à l’adresse publique prévue."
    );
  }

  const contractCode = await provider.getCode(contractAddress);

  if (contractCode === "0x") {
    throw new Error(
      "Aucun contrat n’existe à l’adresse configurée."
    );
  }

  const contract = new ethers.Contract(
    contractAddress,
    REGISTRY_ABI,
    provider
  );

  const [owner, paused, serverAuthorized, balance] =
    await Promise.all([
      contract.owner(),
      contract.paused(),
      contract.writers(serverWallet.address),
      provider.getBalance(serverWallet.address),
    ]);

  return {
    chainId: Number(POLYGON_CHAIN_ID),
    contractAddress,
    owner,
    serverWalletAddress: serverWallet.address,
    serverAuthorized,
    paused,
    balanceWei: balance.toString(),
  };
}