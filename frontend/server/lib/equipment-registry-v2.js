import { ethers } from "ethers";
import {
  calculatePolygonTransactionBudget,
  getPolygonBalanceStatus,
  POLYGON_BALANCE_CRITICAL_WEI,
  POLYGON_BALANCE_WARNING_WEI,
  POLYGON_MINIMUM_RESERVE_WEI,
} from "./polygon-wallet-health.js";

// Ce fichier s’exécute uniquement sur le serveur Vercel.
// Ne jamais l’importer dans frontend/src.

const POLYGON_CHAIN_ID = 137n;

const REGISTRY_ABI = [
  "error Unauthorized()",
  "error ContractPaused()",
  "error InvalidHash()",
  "error EquipmentAlreadyExists()",
  "error SerialNumberAlreadyExists()",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function writers(address) view returns (bool)",
  "function equipments(bytes32) view returns (bytes32 dataHash, bytes32 serialHash, uint256 registeredAt, bool exists)",
  "function registeredSerialHashes(bytes32) view returns (bool)",
  "function registerEquipment(bytes32 equipmentKey, bytes32 dataHash, bytes32 serialHash)",
];

function diagnosticError(code, cause) {
  const error = new Error(code, cause ? { cause } : undefined);
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

function normalizePrivateKey(rawPrivateKey) {
  return rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;
}

function validateBytes32(value, code) {
  if (!ethers.isHexString(value, 32) || value === ethers.ZeroHash) {
    throw diagnosticError(code);
  }
}

function normalizeForCanonicalJson(value) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForCanonicalJson);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = normalizeForCanonicalJson(value[key]);
        }

        return result;
      }, {});
  }

  throw diagnosticError("PROOF_DATA_INVALID");
}

// Produit toujours la même chaîne pour les mêmes données, quel que soit
// l'ordre initial des propriétés JavaScript.
export function canonicalizeEquipmentProofData(value) {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

// Les informations lisibles restent dans la base privée. Polygon reçoit
// seulement trois empreintes bytes32, impossibles à relire comme du texte.
export function buildEquipmentProof({
  carnetPassId,
  companyId,
  serialNumber,
  data,
}) {
  if (
    typeof carnetPassId !== "string"
    || !/^CP-\d{4}-\d{6}$/.test(carnetPassId)
  ) {
    throw diagnosticError("CARNETPASS_ID_INVALID");
  }

  if (typeof companyId !== "string" || !companyId) {
    throw diagnosticError("COMPANY_ID_INVALID");
  }

  if (typeof serialNumber !== "string" || !serialNumber) {
    throw diagnosticError("SERIAL_NUMBER_INVALID");
  }

  const canonicalData = canonicalizeEquipmentProofData(data);

  return {
    equipmentKey: ethers.id(`equipment:${carnetPassId}`),
    dataHash: ethers.keccak256(ethers.toUtf8Bytes(canonicalData)),
    serialHash: ethers.id(
      `company:${companyId}|serial:${serialNumber}`
    ),
  };
}

async function createRegistryContext() {
  const rpcUrl = requiredEnvironmentVariable("POLYGON_RPC_URL");
  const privateKey = normalizePrivateKey(
    requiredEnvironmentVariable("POLYGON_SERVER_PRIVATE_KEY")
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
    throw diagnosticError("RPC_URL_INVALID");
  }

  if (parsedRpcUrl.protocol !== "https:") {
    throw diagnosticError("RPC_URL_NOT_HTTPS");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw diagnosticError("PRIVATE_KEY_FORMAT");
  }

  if (
    !ethers.isAddress(contractAddress)
    || contractAddress === ethers.ZeroAddress
  ) {
    throw diagnosticError("CONTRACT_ADDRESS_INVALID");
  }

  if (
    !ethers.isAddress(expectedWalletAddress)
    || expectedWalletAddress === ethers.ZeroAddress
  ) {
    throw diagnosticError("SERVER_WALLET_ADDRESS_INVALID");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let network;

  try {
    network = await provider.getNetwork();
  } catch (error) {
    throw diagnosticError("RPC_CONNECTION_FAILED", error);
  }

  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw diagnosticError("WRONG_NETWORK");
  }

  let serverWallet;

  try {
    serverWallet = new ethers.Wallet(privateKey, provider);
  } catch (error) {
    throw diagnosticError("PRIVATE_KEY_PARSE_FAILED", error);
  }

  if (
    serverWallet.address.toLowerCase()
    !== expectedWalletAddress.toLowerCase()
  ) {
    throw diagnosticError("WALLET_MISMATCH");
  }

  let contractCode;

  try {
    contractCode = await provider.getCode(contractAddress);
  } catch (error) {
    throw diagnosticError("CONTRACT_LOOKUP_FAILED", error);
  }

  if (contractCode === "0x") {
    throw diagnosticError("CONTRACT_NOT_FOUND");
  }

  return {
    provider,
    serverWallet,
    contractAddress: ethers.getAddress(contractAddress),
    readContract: new ethers.Contract(
      contractAddress,
      REGISTRY_ABI,
      provider
    ),
  };
}

function contractErrorName(error, contractInterface) {
  if (typeof error?.revert?.name === "string") {
    return error.revert.name;
  }

  const possibleData = [
    error?.data,
    error?.info?.error?.data,
    error?.error?.data,
  ];

  for (const candidate of possibleData) {
    const data = typeof candidate === "string"
      ? candidate
      : candidate?.data;

    if (typeof data !== "string") continue;

    try {
      return contractInterface.parseError(data)?.name ?? null;
    } catch {
      // Cette donnée ne correspond pas à une erreur de notre contrat.
    }
  }

  return null;
}

function mapContractWriteError(error, contractInterface) {
  const name = contractErrorName(error, contractInterface);

  const codes = {
    ContractPaused: "CONTRACT_PAUSED",
    Unauthorized: "SERVER_WALLET_NOT_AUTHORIZED",
    InvalidHash: "PROOF_INVALID",
    EquipmentAlreadyExists: "EQUIPMENT_ALREADY_EXISTS",
    SerialNumberAlreadyExists: "SERIAL_ALREADY_EXISTS",
  };

  return diagnosticError(codes[name] ?? "CONTRACT_WRITE_FAILED", error);
}

export async function checkEquipmentRegistryV2() {
  const {
    provider,
    serverWallet,
    contractAddress,
    readContract,
  } = await createRegistryContext();

  let owner;
  let paused;
  let serverAuthorized;
  let balance;

  try {
    [owner, paused, serverAuthorized, balance] = await Promise.all([
      readContract.owner(),
      readContract.paused(),
      readContract.writers(serverWallet.address),
      provider.getBalance(serverWallet.address),
    ]);
  } catch (error) {
    throw diagnosticError("CONTRACT_READ_FAILED", error);
  }

  return {
    chainId: Number(POLYGON_CHAIN_ID),
    contractAddress,
    owner,
    serverWalletAddress: serverWallet.address,
    serverAuthorized,
    paused,
    balanceWei: balance.toString(),
    balancePol: ethers.formatEther(balance),
    balanceStatus: getPolygonBalanceStatus(balance),
    balanceThresholds: {
      warningPol: ethers.formatEther(POLYGON_BALANCE_WARNING_WEI),
      criticalPol: ethers.formatEther(POLYGON_BALANCE_CRITICAL_WEI),
      minimumReservePol: ethers.formatEther(
        POLYGON_MINIMUM_RESERVE_WEI
      ),
    },
  };
}

export async function registerEquipmentProof({
  equipmentKey,
  dataHash,
  serialHash,
  onTransactionSent,
}) {
  validateBytes32(equipmentKey, "EQUIPMENT_KEY_INVALID");
  validateBytes32(dataHash, "DATA_HASH_INVALID");
  validateBytes32(serialHash, "SERIAL_HASH_INVALID");

  const {
    provider,
    serverWallet,
    contractAddress,
    readContract,
  } = await createRegistryContext();

  let paused;
  let serverAuthorized;
  let balance;
  let existingEquipment;
  let existingSerial;

  try {
    [paused, serverAuthorized, balance, existingEquipment, existingSerial] =
      await Promise.all([
        readContract.paused(),
        readContract.writers(serverWallet.address),
        provider.getBalance(serverWallet.address),
        readContract.equipments(equipmentKey),
        readContract.registeredSerialHashes(serialHash),
      ]);
  } catch (error) {
    throw diagnosticError("CONTRACT_READ_FAILED", error);
  }

  if (paused) {
    throw diagnosticError("CONTRACT_PAUSED");
  }

  if (!serverAuthorized) {
    throw diagnosticError("SERVER_WALLET_NOT_AUTHORIZED");
  }

  if (existingEquipment.exists) {
    throw diagnosticError("EQUIPMENT_ALREADY_EXISTS");
  }

  if (existingSerial) {
    throw diagnosticError("SERIAL_ALREADY_EXISTS");
  }

  if (balance <= POLYGON_MINIMUM_RESERVE_WEI) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "polygon_wallet_balance_too_low",
        balanceStatus: getPolygonBalanceStatus(balance),
        balanceWei: balance.toString(),
        requiredBalanceWei:
          POLYGON_MINIMUM_RESERVE_WEI.toString(),
      })
    );

    throw diagnosticError("SERVER_WALLET_BALANCE_TOO_LOW");
  }

  const writeContract = readContract.connect(serverWallet);
  let gasBudget;
  let transactionOverrides;

  try {
    const [estimatedGas, feeData] = await Promise.all([
      writeContract.registerEquipment.estimateGas(
        equipmentKey,
        dataHash,
        serialHash
      ),
      provider.getFeeData(),
    ]);

    const feePerGas =
      feeData.maxFeePerGas ?? feeData.gasPrice;

    gasBudget = calculatePolygonTransactionBudget({
      estimatedGas,
      feePerGas,
    });

    transactionOverrides = {
      gasLimit: gasBudget.gasLimit,
    };

    if (feeData.maxFeePerGas !== null) {
      transactionOverrides.maxFeePerGas =
        feeData.maxFeePerGas;

      if (feeData.maxPriorityFeePerGas !== null) {
        transactionOverrides.maxPriorityFeePerGas =
          feeData.maxPriorityFeePerGas;
      }
    } else {
      transactionOverrides.gasPrice = feeData.gasPrice;
    }
  } catch (error) {
    if (
      error?.code === "GAS_ESTIMATE_INVALID" ||
      error?.code === "GAS_PRICE_UNAVAILABLE"
    ) {
      throw error;
    }

    throw mapContractWriteError(
      error,
      writeContract.interface
    );
  }

  if (balance < gasBudget.requiredBalanceWei) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "polygon_wallet_balance_too_low",
        balanceStatus: getPolygonBalanceStatus(balance),
        balanceWei: balance.toString(),
        requiredBalanceWei:
          gasBudget.requiredBalanceWei.toString(),
        estimatedMaximumFeeWei:
          gasBudget.estimatedMaximumFeeWei.toString(),
      })
    );

    throw diagnosticError("SERVER_WALLET_BALANCE_TOO_LOW");
  }

  let transaction;

  try {
    transaction = await writeContract.registerEquipment(
      equipmentKey,
      dataHash,
      serialHash,
      transactionOverrides
    );
  } catch (error) {
    const mapped = mapContractWriteError(
      error,
      writeContract.interface
    );

    const possibleHash =
      error?.transactionHash ??
      error?.receipt?.hash ??
      error?.receipt?.transactionHash;

    if (typeof possibleHash === "string") {
      mapped.transactionHash = possibleHash;
    }

    throw mapped;
  }

  const submitted = {
    chainId: Number(POLYGON_CHAIN_ID),
    contractAddress,
    transactionHash: transaction.hash,
  };

  if (typeof onTransactionSent === "function") {
    try {
      await onTransactionSent(submitted);
    } catch {
      // La transaction est déjà partie : attendre son résultat reste prioritaire.
      // L'appelant réécrira l'état complet après la confirmation.
      console.error("État de transaction Polygon non enregistré immédiatement.");
    }
  }

  let receipt;

  try {
    receipt = await transaction.wait(1);
  } catch (error) {
    const code = error?.receipt?.status === 0
      ? "TRANSACTION_REVERTED"
      : "TRANSACTION_CONFIRMATION_FAILED";
    const mapped = diagnosticError(
      code,
      error
    );
    mapped.transactionHash = transaction.hash;
    throw mapped;
  }

  if (!receipt || receipt.status !== 1) {
    const error = diagnosticError("TRANSACTION_REVERTED");
    error.transactionHash = transaction.hash;
    throw error;
  }

  const transactionFeeWei =
    typeof receipt.fee === "bigint"
      ? receipt.fee
      : receipt.gasUsed * receipt.gasPrice;

  let balanceAfter = balance - transactionFeeWei;

  try {
    balanceAfter = await provider.getBalance(
      serverWallet.address
    );
  } catch {
    // La transaction est déjà confirmée.
    // Le calcul local sert de solution de secours.
  }

  return {
    ...submitted,
    blockNumber: receipt.blockNumber,
    transactionFeeWei: transactionFeeWei.toString(),
    balanceAfterWei: balanceAfter.toString(),
    balanceStatusAfter:
      getPolygonBalanceStatus(balanceAfter),
  };
}