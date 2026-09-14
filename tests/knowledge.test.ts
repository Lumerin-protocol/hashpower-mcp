import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchSemanticsIndex } from "../src/tools/knowledge.ts";

describe("semantics fetch", () => {
  it("loads the live catalog from dev.hashpower.io", async () => {
    const index = await fetchSemanticsIndex("https://dev.hashpower.io");
    const slugs = new Set(index.documents.map((d) => d.slug));
    assert.ok(slugs.has("futures-margin"));
    assert.ok(slugs.has("oracle-reading"));
    assert.ok(slugs.has("perps-trading"));
  });
});
