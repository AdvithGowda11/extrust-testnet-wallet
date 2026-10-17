export function parseAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Unsupported asset precision");
  if (value.length > 100 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value))
    throw new Error("Enter an ordinary positive decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places`);
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
}
export function formatAmount(value: bigint, decimals: number): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value)
    .toString()
    .padStart(decimals + 1, "0");
  if (!decimals) return sign + digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return sign + digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Operation failed. Please retry.";
}
