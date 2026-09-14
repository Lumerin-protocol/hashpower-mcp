import { dumpJson } from "../json.ts";

export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: typeof data === "string" ? data : dumpJson(data) }],
  };
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
