import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { NetworkEnv } from "./config.ts";

const require = createRequire(import.meta.url);

export interface EnvSnapshot {
  chainId: number;
  network: string;
  contracts: Record<string, string>;
  subgraphs: Record<string, string>;
}

export interface DeploymentsManifest {
  packages: Record<string, { version: string; npm: string }>;
  environment: EnvSnapshot;
}

interface PackageDeployments {
  package: string;
  environments: Record<string, EnvSnapshot>;
}

const ABI_PACKAGES = [
  "@hashpower/oracle-abi",
  "@hashpower/collateral-abi",
  "@hashpower/futures-abi",
  "@hashpower/perps-abi",
] as const;

function readPackageDeployments(pkg: string): { version: string; deployments: PackageDeployments } {
  const deploymentsPath = require.resolve(`${pkg}/deployments.json`);
  const deployments = JSON.parse(readFileSync(deploymentsPath, "utf8")) as PackageDeployments;
  const pkgRoot = deploymentsPath.replace(/\/deployments\.json$/, "");
  const version = (JSON.parse(readFileSync(`${pkgRoot}/package.json`, "utf8")) as { version: string })
    .version;
  return { version, deployments };
}

function mergeEntry(
  map: Record<string, string>,
  key: string,
  value: string,
  context: string,
): void {
  const existing = map[key];
  if (existing === undefined) {
    map[key] = value;
    return;
  }
  if (existing.toLowerCase() !== value.toLowerCase()) {
    throw new Error(`Conflict for ${context}/${key}: ${existing} vs ${value}`);
  }
}

export function loadDeployments(env: NetworkEnv): DeploymentsManifest {
  const packages: Record<string, { version: string; npm: string }> = {};
  let chainId: number | undefined;
  let network: string | undefined;
  const contracts: Record<string, string> = {};
  const subgraphs: Record<string, string> = {};

  for (const pkg of ABI_PACKAGES) {
    const { version, deployments } = readPackageDeployments(pkg);
    packages[pkg] = { version, npm: `https://www.npmjs.com/package/${pkg}` };
    const snapshot = deployments.environments[env];
    if (!snapshot) {
      throw new Error(`${pkg} has no ${env} environment`);
    }
    chainId ??= snapshot.chainId;
    network ??= snapshot.network;
    if (snapshot.chainId !== chainId) {
      throw new Error(`Chain ID conflict in ${pkg}: ${snapshot.chainId} vs ${chainId}`);
    }
    for (const [name, address] of Object.entries(snapshot.contracts ?? {})) {
      mergeEntry(contracts, name, address, `${env}.contracts`);
    }
    for (const [name, url] of Object.entries(snapshot.subgraphs ?? {})) {
      mergeEntry(subgraphs, name, url, `${env}.subgraphs`);
    }
  }

  if (chainId === undefined || network === undefined) {
    throw new Error("No ABI packages loaded");
  }

  return {
    packages,
    environment: { chainId, network, contracts, subgraphs },
  };
}

export function requireContract(
  contracts: Record<string, string>,
  ...names: string[]
): `0x${string}` {
  for (const name of names) {
    const value = contracts[name];
    if (value) return value as `0x${string}`;
  }
  throw new Error(`Missing contract ${names.join(" / ")} in deployments`);
}

export function requireSubgraph(subgraphs: Record<string, string>, name: string): string {
  const url = subgraphs[name];
  if (!url) throw new Error(`Missing subgraph ${name} in deployments`);
  return url;
}
