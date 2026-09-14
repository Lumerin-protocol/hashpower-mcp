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
