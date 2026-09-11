import { ethers } from "ethers";

export const POLYGON_BALANCE_WARNING_WEI = ethers.parseEther("0.30");
export const POLYGON_BALANCE_CRITICAL_WEI = ethers.parseEther("0.10");
export const POLYGON_MINIMUM_RESERVE_WEI = ethers.parseEther("0.05");

const GAS_LIMIT_BUFFER_PERCENT = 120n;

function diagnosticError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function positiveBigInt(value, code) {
  if (typeof value !== "bigint" || value <= 0n) {
    throw diagnosticError(code);
  }

  return value;
}

function multiplyAndRoundUp(value, multiplier, divisor) {
  return (value * multiplier + divisor - 1n) / divisor;
}

export function getPolygonBalanceStatus(balanceWei) {
  let balance;

  try {
    balance = typeof balanceWei === "bigint"
      ? balanceWei
      : BigInt(balanceWei);
  } catch {
    throw diagnosticError("BALANCE_INVALID");
  }

  if (balance < 0n) {
    throw diagnosticError("BALANCE_INVALID");
  }

  if (balance <= POLYGON_BALANCE_CRITICAL_WEI) {
    return "critical";
  }

  if (balance <= POLYGON_BALANCE_WARNING_WEI) {
    return "warning";
  }

  return "healthy";
}

export function calculatePolygonTransactionBudget({
  estimatedGas,
  feePerGas,
}) {
  const checkedGas = positiveBigInt(
    estimatedGas,
    "GAS_ESTIMATE_INVALID"
  );
  const checkedFeePerGas = positiveBigInt(
    feePerGas,
    "GAS_PRICE_UNAVAILABLE"
  );
  const gasLimit = multiplyAndRoundUp(
    checkedGas,
    GAS_LIMIT_BUFFER_PERCENT,
    100n
  );
  const estimatedMaximumFeeWei = gasLimit * checkedFeePerGas;

  return {
    gasLimit,
    estimatedMaximumFeeWei,
    minimumReserveWei: POLYGON_MINIMUM_RESERVE_WEI,
    requiredBalanceWei:
      estimatedMaximumFeeWei + POLYGON_MINIMUM_RESERVE_WEI,
  };
}