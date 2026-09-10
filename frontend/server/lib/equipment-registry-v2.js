import { ethers } from "ethers";

// Ce fichier s’exécute uniquement sur le serveur Vercel.
// Ne jamais l’importer dans frontend/src.

const POLYGON_CHAIN_ID = 137n;

const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function writers(address) view returns (bool)",
];

function diagnosticError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw diagnosticError(`ENV_MISSING_${name}`);
  }

  return value.trim();
}

export async function checkEquipmentRegistryV2() {
  const rpcUrl = requiredEnvironmentVariable("POLYGON_RPC_URL");
 const rawPrivateKey = requiredEnvironmentVariable(
  "POLYGON_SERVER_PRIVATE_KEY"
);

const privateKey = rawPrivateKey.startsWith("0x")
  ? rawPrivateKey
  : `0x${rawPrivateKey}`;
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
    throw diagnosticError("RPC_URL_INVALID");
  }

  if (parsedRpcUrl.protocol !== "https:") {
    throw diagnosticError("RPC_URL_NOT_HTTPS");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw diagnosticError("PRIVATE_KEY_FORMAT");
  }

  if (
    !ethers.isAddress(contractAddress) ||
    contractAddress === ethers.ZeroAddress
  ) {
    throw diagnosticError("CONTRACT_ADDRESS_INVALID");
  }

  if (
    !ethers.isAddress(expectedWalletAddress) ||
    expectedWalletAddress === ethers.ZeroAddress
  ) {
    throw diagnosticError("SERVER_WALLET_ADDRESS_INVALID");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let network;

  try {
    network = await provider.getNetwork();
  } catch {
    throw diagnosticError("RPC_CONNECTION_FAILED");
  }

  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw diagnosticError("WRONG_NETWORK");
  }

  let serverWallet;

  try {
    serverWallet = new ethers.Wallet(privateKey, provider);
  } catch {
    throw diagnosticError("PRIVATE_KEY_PARSE_FAILED");
  }

  if (
    serverWallet.address.toLowerCase() !==
    expectedWalletAddress.toLowerCase()
  ) {
    throw diagnosticError("WALLET_MISMATCH");
  }

  let contractCode;

  try {
    contractCode = await provider.getCode(contractAddress);
  } catch {
    throw diagnosticError("CONTRACT_LOOKUP_FAILED");
  }

  if (contractCode === "0x") {
    throw diagnosticError("CONTRACT_NOT_FOUND");
  }

  const contract = new ethers.Contract(
    contractAddress,
    REGISTRY_ABI,
    provider
  );

  let owner;
  let paused;
  let serverAuthorized;
  let balance;

  try {
    [owner, paused, serverAuthorized, balance] =
      await Promise.all([
        contract.owner(),
        contract.paused(),
        contract.writers(serverWallet.address),
        provider.getBalance(serverWallet.address),
      ]);
  } catch {
    throw diagnosticError("CONTRACT_READ_FAILED");
  }

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