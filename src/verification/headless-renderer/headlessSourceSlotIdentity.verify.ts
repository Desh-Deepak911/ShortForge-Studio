/**
 * Sprint 11E Phase 2B.2D.1 — source-slot identity v2 adversarial suite.
 * Run: npm run test:headless-source-slot-identity
 */

import assert from "node:assert/strict";

import {
  HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  HEADLESS_SOURCE_SLOT_KEY_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_VERSION,
  headlessMediaItemDedupeKey,
  headlessSourceSlotKey,
  isCanonicalHeadlessSourceSlotKey,
  parseHeadlessSourceSlotKey,
  type HeadlessSourceSlotKeyComponents,
} from "@/features/headless-renderer/domain/headless-source-slot-key";
import { HEADLESS_PG_SQLSTATE } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

function digest(seed: string): string {
  return `sha256:${seed.padEnd(64, "0").slice(0, 64)}`;
}

function slot(
  partial: Partial<HeadlessSourceSlotKeyComponents> &
    Pick<HeadlessSourceSlotKeyComponents, "role">,
): HeadlessSourceSlotKeyComponents {
  return {
    role: partial.role,
    sceneId: partial.sceneId === undefined ? "scene-1" : partial.sceneId,
    mediaItemId:
      partial.mediaItemId === undefined ? "item-1" : partial.mediaItemId,
    sourceDigest: partial.sourceDigest ?? digest("ab"),
  };
}

function simulatePostgresJsonbIngest(jsonText: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly sqlState: string } {
  if (jsonText.includes("\\u0000") || jsonText.includes("\0")) {
    return { ok: false, sqlState: HEADLESS_PG_SQLSTATE.UNTRANSLATABLE_CHARACTER };
  }
  try {
    return { ok: true, value: JSON.parse(jsonText) as unknown };
  } catch {
    return { ok: false, sqlState: HEADLESS_PG_SQLSTATE.INVALID_TEXT_REPRESENTATION };
  }
}

async function main(): Promise<void> {
  console.log("\nSprint 11E Phase 2B.2D.1 — source-slot identity v2\n");

  await test("version prefix and constants", () => {
    assert.equal(HEADLESS_SOURCE_SLOT_KEY_VERSION, 2);
    assert.equal(HEADLESS_SOURCE_SLOT_KEY_PREFIX, "hslot:v2:");
    assert.equal(HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH, 1024);
    assert.equal(HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX, "hmitem:v1:");
  });

  const matrix: readonly {
    readonly name: string;
    readonly components: HeadlessSourceSlotKeyComponents;
  }[] = [
    { name: "normal", components: slot({ role: "scene_media" }) },
    {
      name: "nul_in_ids",
      components: slot({
        role: "scene_media",
        sceneId: "sc\0ene",
        mediaItemId: "it\0em",
      }),
    },
    {
      name: "unit_separator",
      components: slot({
        role: "scene_media",
        sceneId: "sc\u001fene",
        mediaItemId: "it\u001fem",
      }),
    },
    {
      name: "quotes_backslashes",
      components: slot({
        role: "scene_media",
        sceneId: 'sc"ene\\path',
        mediaItemId: 'it\\"em',
      }),
    },
    {
      name: "delimiters_punct",
      components: slot({
        role: "scene_media",
        sceneId: "a:b|c,d[e]",
        mediaItemId: "{x}/y",
      }),
    },
    {
      name: "unicode_combining",
      components: slot({
        role: "scene_media",
        sceneId: "cafe\u0301",
        mediaItemId: "東京⚽",
      }),
    },
    {
      name: "null_scene",
      components: slot({ role: "voiceover", sceneId: null, mediaItemId: null }),
    },
    {
      name: "empty_scene",
      components: slot({ role: "voiceover", sceneId: "", mediaItemId: "" }),
    },
    {
      name: "null_vs_empty_media",
      components: slot({
        role: "scene_media",
        sceneId: "s",
        mediaItemId: null,
      }),
    },
    {
      name: "empty_media",
      components: slot({
        role: "scene_media",
        sceneId: "s",
        mediaItemId: "",
      }),
    },
    {
      name: "boundary_ids",
      components: slot({
        role: "scene_media",
        sceneId: "s".repeat(128),
        mediaItemId: "m".repeat(128),
        sourceDigest: digest("ff"),
      }),
    },
    {
      name: "legacy_collide_a",
      components: slot({
        role: "scene_media",
        sceneId: "a",
        mediaItemId: "b\u001fc",
        sourceDigest: digest("11"),
      }),
    },
    {
      name: "legacy_collide_b",
      components: slot({
        role: "scene_media",
        sceneId: "a\u001fb",
        mediaItemId: "c",
        sourceDigest: digest("11"),
      }),
    },
  ];

  const keys = new Map<string, string>();

  await test("fixture matrix: distinct tuples stay distinct", () => {
    for (const row of matrix) {
      const key = headlessSourceSlotKey(row.components);
      assert.equal(key.startsWith("hslot:v2:"), true);
      assert.equal(key.includes("\0"), false);
      assert.equal(isCanonicalHeadlessSourceSlotKey(key), true);
      if (keys.has(key)) {
        assert.fail(`collision between ${keys.get(key)} and ${row.name}`);
      }
      keys.set(key, row.name);
    }
    assert.equal(keys.size, matrix.length);
  });

  await test("same tuple is stable / deterministic", () => {
    const a = headlessSourceSlotKey(slot({ role: "scene_media", sceneId: "x" }));
    const b = headlessSourceSlotKey(slot({ role: "scene_media", sceneId: "x" }));
    assert.equal(a, b);
  });

  await test("reordered components produce different keys", () => {
    const a = headlessSourceSlotKey(
      slot({ role: "scene_media", sceneId: "a", mediaItemId: "b" }),
    );
    const b = headlessSourceSlotKey(
      slot({ role: "scene_media", sceneId: "b", mediaItemId: "a" }),
    );
    assert.notEqual(a, b);
  });

  await test("null versus empty remain distinct", () => {
    const n = headlessSourceSlotKey(
      slot({ role: "voiceover", sceneId: null, mediaItemId: null }),
    );
    const e = headlessSourceSlotKey(
      slot({ role: "voiceover", sceneId: "", mediaItemId: "" }),
    );
    assert.notEqual(n, e);
  });

  await test("JSON serialize/parse round-trip of key string", () => {
    const key = headlessSourceSlotKey(
      slot({
        role: "scene_media",
        sceneId: 'q"\u001f\0x',
        mediaItemId: "y",
      }),
    );
    const round = JSON.parse(JSON.stringify({ slotKey: key })) as {
      slotKey: string;
    };
    assert.equal(round.slotKey, key);
    assert.equal(isCanonicalHeadlessSourceSlotKey(round.slotKey), true);
    const parsed = parseHeadlessSourceSlotKey(round.slotKey);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(headlessSourceSlotKey(parsed.components), key);
    }
  });

  await test("PostgreSQL JSONB-wire simulation accepts v2 keys", () => {
    for (const row of matrix) {
      const key = headlessSourceSlotKey(row.components);
      const payload = JSON.stringify({ slotKey: key });
      const ingested = simulatePostgresJsonbIngest(payload);
      assert.equal(ingested.ok, true, row.name);
      if (ingested.ok) {
        const value = ingested.value as { slotKey: string };
        assert.equal(isCanonicalHeadlessSourceSlotKey(value.slotKey), true);
        assert.equal(value.slotKey, key);
      }
    }
  });

  await test("exact recomputation after JSONB round-trip", () => {
    const components = slot({
      role: "scene_media",
      sceneId: "sc\0\u001fene",
      mediaItemId: 'it"em\\',
    });
    const key = headlessSourceSlotKey(components);
    const ingested = simulatePostgresJsonbIngest(JSON.stringify({ slotKey: key }));
    assert.equal(ingested.ok, true);
    if (!ingested.ok) return;
    const recovered = (ingested.value as { slotKey: string }).slotKey;
    assert.equal(headlessSourceSlotKey(components), recovered);
    assert.equal(isCanonicalHeadlessSourceSlotKey(recovered), true);
  });

  await test("forged/legacy delimiter keys fail canonical validation", () => {
    const legacyNul = ["scene_media", "scene-1", "item-1", digest("ab")].join(
      "\0",
    );
    const legacyUs = ["scene_media", "scene-1", "item-1", digest("ab")].join(
      "\u001f",
    );
    assert.equal(isCanonicalHeadlessSourceSlotKey(legacyNul), false);
    assert.equal(isCanonicalHeadlessSourceSlotKey(legacyUs), false);
    assert.equal(parseHeadlessSourceSlotKey(legacyUs).ok, false);
    assert.equal(isCanonicalHeadlessSourceSlotKey("hslot:v1:abc"), false);
    assert.equal(isCanonicalHeadlessSourceSlotKey("hslot:v2:!!!"), false);
  });

  await test("no raw NUL in persisted keys including adversarial components", () => {
    for (const row of matrix) {
      const key = headlessSourceSlotKey(row.components);
      assert.equal(key.includes("\0"), false);
      assert.ok(key.length <= HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH);
    }
  });

  await test("media-item dedupe distinguishes delimiter collision pairs", () => {
    const a = headlessMediaItemDedupeKey("a", "b\0c");
    const b = headlessMediaItemDedupeKey("a\0b", "c");
    const c = headlessMediaItemDedupeKey("a", "b\u001fc");
    const d = headlessMediaItemDedupeKey("a\u001fb", "c");
    assert.notEqual(a, b);
    assert.notEqual(c, d);
    assert.equal(a.startsWith("hmitem:v1:"), true);
    assert.equal(a.includes("\0"), false);
  });

  await test("lone surrogates fail closed", () => {
    assert.throws(() =>
      headlessSourceSlotKey(
        slot({ role: "scene_media", sceneId: "\uD800", mediaItemId: "x" }),
      ),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch(() => {
  console.log("\nFAIL — source-slot identity suite terminated unexpectedly.\n");
  process.exitCode = 1;
});
