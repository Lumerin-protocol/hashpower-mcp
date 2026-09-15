import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MCP_VERSION = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string })
  .version;
