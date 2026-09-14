export interface GraphMeta {
  blockNumber: number | null;
}

export async function graphql<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data: T; meta: GraphMeta }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph HTTP ${res.status} from ${url}`);
  }
  const body = (await res.json()) as {
    data?: T & { _meta?: { block?: { number?: number } } };
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(`Subgraph error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) {
    throw new Error("Subgraph returned no data");
  }
  const blockNumber = body.data._meta?.block?.number ?? null;
  return { data: body.data, meta: { blockNumber } };
}

export function walletId(address: string): string {
  return address.toLowerCase();
}
