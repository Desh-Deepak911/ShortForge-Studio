/**
 * Sprint 10H.1 — Local evidence eligibility / scrub harness (network-free).
 * Run: npm run test:retention-story-local-evidence
 */
import assert from "node:assert/strict";

import {
  AUDIO_FIRST_CHECK_KEYS,
  CREATE_CHECK_KEYS,
  GENERATED_CHECK_KEYS,
  PERSISTENCE_CHECK_KEYS,
  assertStructuralChecksDoNotPromotePass,
  buildSafeRetentionStoryEvidenceReport,
  createEmptyChecklist,
  deriveLocalSignOffVerdict,
  scrubRetentionLocalOperatorNotes,
} from "@/features/retention-story/qa/retention-story-local-evidence";

let passed = 0;

function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function main(): void {
  console.log("\nretention-story-local-evidence (Sprint 10H.1)\n");

  check("incomplete checklist is never eligible", () => {
    const verdict = deriveLocalSignOffVerdict({
      create: createEmptyChecklist(CREATE_CHECK_KEYS),
      generated: createEmptyChecklist(GENERATED_CHECK_KEYS),
      persistence: createEmptyChecklist(PERSISTENCE_CHECK_KEYS),
      audioFirst: createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS),
      audioFirstConfiguredForSignOff: false,
    });
    assert.equal(verdict, "incomplete");
  });

  check("all Core Pass + audio capability-gated → capability-gated-audio", () => {
    const create = createEmptyChecklist(CREATE_CHECK_KEYS);
    const generated = createEmptyChecklist(GENERATED_CHECK_KEYS);
    const persistence = createEmptyChecklist(PERSISTENCE_CHECK_KEYS);
    for (const key of CREATE_CHECK_KEYS) create[key] = "pass";
    for (const key of GENERATED_CHECK_KEYS) generated[key] = "pass";
    for (const key of PERSISTENCE_CHECK_KEYS) persistence[key] = "pass";
    assert.equal(
      deriveLocalSignOffVerdict({
        create,
        generated,
        persistence,
        audioFirst: createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS),
        audioFirstConfiguredForSignOff: false,
      }),
      "capability-gated-audio",
    );
  });

  check("audio configured incomplete → incomplete (not eligible)", () => {
    const create = createEmptyChecklist(CREATE_CHECK_KEYS);
    const generated = createEmptyChecklist(GENERATED_CHECK_KEYS);
    const persistence = createEmptyChecklist(PERSISTENCE_CHECK_KEYS);
    for (const key of CREATE_CHECK_KEYS) create[key] = "pass";
    for (const key of GENERATED_CHECK_KEYS) generated[key] = "pass";
    for (const key of PERSISTENCE_CHECK_KEYS) persistence[key] = "pass";
    assert.equal(
      deriveLocalSignOffVerdict({
        create,
        generated,
        persistence,
        audioFirst: createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS),
        audioFirstConfiguredForSignOff: true,
      }),
      "incomplete",
    );
  });

  check("structural ok never promotes manual Not tested → Pass", () => {
    assert.equal(
      assertStructuralChecksDoNotPromotePass(true, "not-tested"),
      "not-tested",
    );
    assert.equal(assertStructuralChecksDoNotPromotePass(true, "pass"), "pass");
  });

  check("operator notes scrub credentials / secret URLs / blobs", () => {
    const scrubbed = scrubRetentionLocalOperatorNotes(
      "ok https://api.example/?api_key=secret sk-abcdefghijklmnopqrst " +
        "a".repeat(64),
    );
    assert.doesNotMatch(scrubbed, /api_key=secret/);
    assert.doesNotMatch(scrubbed, /sk-abc/);
    assert.match(scrubbed, /\[redacted/);
  });

  check("downloaded report never claims eligible when incomplete", () => {
    const report = buildSafeRetentionStoryEvidenceReport({
      create: createEmptyChecklist(CREATE_CHECK_KEYS),
      generated: createEmptyChecklist(GENERATED_CHECK_KEYS),
      persistence: createEmptyChecklist(PERSISTENCE_CHECK_KEYS),
      audioFirst: createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS),
      audioFirstConfiguredForSignOff: false,
      notes: "token=supersecretvalue1234567890",
    });
    assert.notEqual(report.verdict, "eligible");
    assert.doesNotMatch(report.notes, /supersecretvalue/);
  });

  console.log(`\nretention-story-local-evidence — ${passed} checks passed\n`);
}

main();
