import type { AppConfig } from "../config.ts";
import type { DeploymentsManifest } from "../deployments.ts";
import { ok } from "./result.ts";

export interface SemanticsIndex {
  documents: { slug: string; title: string; topic: string; blurb: string; path: string }[];
  ref?: string;
  generatedAt?: string;
}

export async function fetchSemanticsIndex(docsUrl: string): Promise<SemanticsIndex> {
  const res = await fetch(`${docsUrl}/semantics/index.json`);
  if (!res.ok) throw new Error(`Failed to fetch semantics index: HTTP ${res.status}`);
  return (await res.json()) as SemanticsIndex;
}

export async function fetchSemanticsDoc(docsUrl: string, slug: string): Promise<string> {
  const res = await fetch(`${docsUrl}/semantics/${slug}.md`);
  if (!res.ok) throw new Error(`Unknown or missing semantics slug ${slug}: HTTP ${res.status}`);
  return res.text();
}

export function getDeploymentsTool(config: AppConfig, deployments: DeploymentsManifest) {
  return () =>
    ok({
      note: "Addresses and subgraphs from the published @hashpower/*-abi packages. The MCP server never holds keys.",
      env: config.env,
      rpcUrl: config.rpcUrl,
      docsUrl: config.docsUrl,
      ...deployments,
    });
}

export async function getMarketRulesTool(config: AppConfig, slug?: string) {
  if (!slug) {
    const index = await fetchSemanticsIndex(config.docsUrl);
    return ok({
      docsUrl: config.docsUrl,
      hint: "Pass slug to fetch a specific rules doc. Also available as /semantics/<slug>.md on the docs site.",
      ...index,
    });
  }
  const markdown = await fetchSemanticsDoc(config.docsUrl, slug);
  return ok(markdown);
}

export async function getMarginModelTool(config: AppConfig) {
  const [perps, futures] = await Promise.all([
    fetchSemanticsDoc(config.docsUrl, "perps-margin-and-liquidation"),
    fetchSemanticsDoc(config.docsUrl, "futures-margin"),
  ]);
  return ok(
    `# Margin model\n\nSourced from ${config.docsUrl}/semantics (same prose as GitBook).\n\n---\n\n${perps}\n\n---\n\n${futures}`,
  );
}

export async function getUnitsAndScalingTool(config: AppConfig) {
  const [specs, trading, oracle] = await Promise.all([
    fetchSemanticsDoc(config.docsUrl, "futures-contract-specs"),
    fetchSemanticsDoc(config.docsUrl, "perps-trading"),
    fetchSemanticsDoc(config.docsUrl, "oracle-reading"),
  ]);
  return ok(
    `# Units and scaling\n\nSourced from ${config.docsUrl}/semantics.\n\n---\n\n${oracle}\n\n---\n\n${specs}\n\n---\n\n${trading}`,
  );
}
