/**
 * Entity ownership contract (run: npm run test:entity-ownership).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyProviderEnrichmentToOwners,
  createOwnedEntity,
  enrichOwnedEntity,
} from "@/features/intelligence/entities/entity-ownership.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("entityOwnership");

test("owned entity ids are immutable through enrichment", () => {
  const owner = createOwnedEntity({
    id: "entity:player:haaland",
    kind: "player",
    label: "Haaland",
    status: "unresolved",
    confidencePercent: 40,
  });

  const enriched = enrichOwnedEntity(owner, {
    id: "entity:player:erling-haaland",
    kind: "player",
    label: "Erling Haaland",
    status: "resolved",
    externalId: 123,
    confidencePercent: 92,
    metadata: { canonicalLabel: "Erling Haaland" },
  });

  assert.equal(enriched.id, owner.id);
  assert.equal(enriched.kind, owner.kind);
  assert.equal(enriched.label, owner.label);
  assert.equal(enriched.externalId, 123);
  assert.equal(enriched.status, "resolved");
  assert.equal(enriched.confidencePercent, 92);
  assert.equal(enriched.metadata?.canonicalLabel, "Erling Haaland");
});

test("provider enrichment never replaces unmatched entities", () => {
  const owners = [
    createOwnedEntity({
      id: "entity:player:ronaldo",
      kind: "player",
      label: "Ronaldo",
      status: "unresolved",
    }),
  ];

  const merged = applyProviderEnrichmentToOwners(owners, [
    {
      id: "entity:player:messi",
      kind: "player",
      label: "Lionel Messi",
      status: "resolved",
      externalId: 999,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.label, "Ronaldo");
  assert.equal(merged[0]!.externalId, undefined);
});

test("merge-provider-results uses applyProviderEnrichmentToOwners", () => {
  const merge = readSrc("src/features/intelligence/context/merge-provider-results.ts");
  const providers = readSrc("src/features/intelligence/providers/api-football.provider.ts");
  assert.match(merge, /applyProviderEnrichmentToOwners/);
  assert.doesNotMatch(merge, /dedupeEntities/);
  assert.match(providers, /applyProviderEnrichmentToOwners/);
});

console.log("\nAll entity ownership checks passed.");
