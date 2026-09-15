export function dumpJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested),
    2,
  );
}

export function parseBigIntString(label: string, raw: string): bigint {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${label} must be an integer string (no decimals), got ${JSON.stringify(raw)}`);
  }
  return BigInt(trimmed);
}

export function asAddress(label: string, value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  return value.toLowerCase() as `0x${string}`;
}

/** Decimal string for a scaled integer (no scientific notation, trailing zeros stripped). */
export function scaleUnits(raw: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`decimals must be a non-negative integer, got ${decimals}`);
  }
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** Goldsky timeseries timestamps are microseconds; contract/event times are unix seconds. */
export function asUnixSeconds(raw: string | number | bigint): string {
  const n = typeof raw === "bigint" ? raw : BigInt(raw);
  if (n > 10_000_000_000n) return (n / 1_000_000n).toString();
  return n.toString();
}
