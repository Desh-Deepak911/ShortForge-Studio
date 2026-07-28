/**
 * Sprint 7E — Hook × Draft persistence QA verification.
 * Run: npm run test:hook-persistence-qa
 *
 * Exercises real draft storage (in-memory adapter) together with the real
 * Hook Engine adapter/generation APIs to prove:
 *  - Only the immutable HookPlanSnapshot is persisted (creationBrief.hookPlan).
 *  - `script.narration` remains the sole spoken-hook authority.
 *  - HookDiagnostics / HookCandidate / HookSelection / prompt / claim text never
 *    reach draft storage.
 *  - Fingerprints are stable, content-derived, and change only when the
 *    underlying request/strategy actually changes.
 */
import assert from "node:assert/strict";

import {
  createDraft,
  getDraft,
  updateDraft,
  createMemoryDraftStorageAdapter,
} from "@/features/drafts";
import type { StoryCreationBrief } from "@/features/drafts";
import {
  buildHookGenerationContext,
  generateHookedNarration,
  buildHookPlanSnapshot,
  assertHookRequestFingerprint,
  assertHookPlanFingerprint,
  normalizeHookRequest,
  buildHookPlanFromRequest,
  HOOK_CONTRACT_VERSION,
  type HookedNarrationModelCall,
  type HookPlanSnapshot,
} from "@/features/hook-engine";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    return (result as Promise<void>).then(() => {
      console.log(`  ✓ ${name}`);
    });
  }
  console.log(`  ✓ ${name}`);
  return Promise.resolve();
}

async function runTests(
  label: string,
  tests: Array<[string, () => void | Promise<void>]>,
) {
  console.log(label);
  for (const [name, fn] of tests) {
    await test(name, fn);
  }
}

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

function topicWords(topic: string, n = 2): string {
  return topic.split(/\s+/).slice(0, n).join(" ");
}

function punchyOpening(
  topic: string,
  tail = "Body continues with more detail for the rest of the short.",
): string {
  return `${topicWords(topic)} erupts. ${tail}`;
}

function safeModelCall(topic: string): HookedNarrationModelCall {
  return async () => ({
    title: `${topicWords(topic)} — Story`,
    narration: punchyOpening(topic),
    hookClaimRefs: [],
  });
}

/** Builds a real approved narration + HookPlanSnapshot via the production Hook path. */
async function generateApproved(topic: string) {
  const ctx = buildHookGenerationContext({
    topic,
    generationPath: "script_only",
    durationSeconds: 30,
  });
  const result = await generateHookedNarration({
    hookContext: ctx,
    topic,
    tone: "dramatic",
    duration: 30,
    scriptMode: "story",
    modelCall: safeModelCall(topic),
  });
  assert.equal(result.ok, true, "expected the safe punchy narration to be approved");
  if (!result.ok) throw new Error("unreachable");
  return { ctx, result };
}

function buildScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Test Story",
    totalDuration: 30,
    narration: "Default narration.",
    scenes: [],
    ...overrides,
  };
}

function buildCreationBrief(
  topic: string,
  overrides: Partial<StoryCreationBrief> = {},
): StoryCreationBrief {
  return {
    topic,
    tone: "dramatic",
    duration: 30,
    qualityMode: "balanced",
    sceneCount: 5,
    scriptMode: "story",
    ...overrides,
  };
}

/** Field names unique to HookDiagnostics — must never appear on a persisted draft. */
const DIAGNOSTICS_ONLY_FIELDS = [
  "validationOutcome",
  "repairAttempts",
  "adapterRan",
  "groundingStatus",
  "candidateOrigin",
  "fallbackReason",
  "templateInfluenced",
  "promptIntelligenceInfluenced",
  "compressionRevalidated",
  "lengthEnforcement",
  "hookDiagnostics",
];

/** Field names unique to HookCandidate / HookSelection — must never appear on a persisted draft. */
const CANDIDATE_OR_SELECTION_ONLY_FIELDS = [
  "candidateId",
  "openingStartOffset",
  "openingEndOffset",
  "openingTextNormalized",
  "narrationCommitRule",
  "hookClaimRefs",
  "hookCandidate",
  "hookSelection",
];

async function main() {
  await runTests("1) HookPlanSnapshot persistence", [
    [
      "1. successful generation persists the exact HookPlanSnapshot under creationBrief.hookPlan",
      async () => {
        const topic = "Aston Villa European push";
        const { result } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        assert.ok(draft.creationBrief?.hookPlan);
        assert.deepEqual(draft.creationBrief!.hookPlan, result.snapshot);
      },
    ],
    [
      "2. narration is the only spoken-hook authority (script.narration) — the snapshot carries no narration text",
      async () => {
        const topic = "Brighton tactical revolution";
        const { result } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        assert.equal(draft.script.narration, result.approvedNarration);
        const snapshotJson = JSON.stringify(draft.creationBrief!.hookPlan);
        assert.ok(!snapshotJson.includes(result.approvedNarration));
        assert.doesNotMatch(snapshotJson, /narration/i);
      },
    ],
    [
      "3. save → getDraft reload preserves fingerprints, strategyId, strategyVersion, strategySource, contractVersion, resolvedConstraints",
      async () => {
        const topic = "Wolves relegation fight";
        const { result } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        const reloaded = getDraft(draft.id, { adapter });
        assert.ok(reloaded);
        const snapshot = reloaded!.creationBrief?.hookPlan as HookPlanSnapshot | undefined;
        assert.ok(snapshot);
        assert.deepEqual(snapshot, result.snapshot);

        assert.equal(snapshot!.contractVersion, HOOK_CONTRACT_VERSION);
        assert.equal(snapshot!.strategyId, result.snapshot.strategyId);
        assert.equal(snapshot!.strategyVersion, result.snapshot.strategyVersion);
        assert.equal(snapshot!.strategySource, result.snapshot.strategySource);
        assert.equal(snapshot!.requestFingerprint, result.snapshot.requestFingerprint);
        assert.equal(snapshot!.planFingerprint, result.snapshot.planFingerprint);
        assert.deepEqual(snapshot!.resolvedConstraints, result.snapshot.resolvedConstraints);

        // Reloaded snapshot must still self-verify against the real fingerprint algorithm.
        assertHookPlanFingerprint({
          requestFingerprint: snapshot!.requestFingerprint,
          strategyId: snapshot!.strategyId,
          strategyVersion: snapshot!.strategyVersion,
          constraints: snapshot!.resolvedConstraints,
          planFingerprint: snapshot!.planFingerprint,
        });
      },
    ],
  ]);

  await runTests("2) private artifacts never persist", [
    [
      "4. HookDiagnostics is not present on the draft",
      async () => {
        const topic = "Fulham survival mission";
        const { result } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        assert.equal((draft as unknown as { hookDiagnostics?: unknown }).hookDiagnostics, undefined);
        assert.equal(
          (draft.creationBrief as unknown as { hookDiagnostics?: unknown } | undefined)
            ?.hookDiagnostics,
          undefined,
        );

        const serialized = JSON.stringify(draft);
        for (const field of DIAGNOSTICS_ONLY_FIELDS) {
          assert.doesNotMatch(
            serialized,
            new RegExp(`"${field}"`, "i"),
            `diagnostics-only field leaked onto draft: ${field}`,
          );
        }
      },
    ],
    [
      "5. HookCandidate / HookSelection are not present on the draft",
      async () => {
        const topic = "Bournemouth cup run";
        const { result } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        const serialized = JSON.stringify(draft);
        for (const field of CANDIDATE_OR_SELECTION_ONLY_FIELDS) {
          assert.doesNotMatch(
            serialized,
            new RegExp(`"${field}"`, "i"),
            `candidate/selection-only field leaked onto draft: ${field}`,
          );
        }
      },
    ],
    [
      "6. promptBlock, grounding claim text, and hookClaimRefs never appear in JSON.stringify(draft)",
      async () => {
        const topic = "Everton new stadium era";
        const ctx = buildHookGenerationContext({
          topic,
          generationPath: "script_only",
          durationSeconds: 30,
        });
        const result = await generateHookedNarration({
          hookContext: ctx,
          topic,
          tone: "dramatic",
          duration: 30,
          scriptMode: "story",
          modelCall: safeModelCall(topic),
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;

        const adapter = createMemoryDraftStorageAdapter();
        const draft = createDraft(
          {
            script: buildScript({ title: result.title, narration: result.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: result.snapshot }),
          },
          { adapter },
        );

        const serialized = JSON.stringify(draft);
        assert.doesNotMatch(serialized, /promptBlock/i);
        assert.doesNotMatch(serialized, /hookClaimRefs/i);
        assert.doesNotMatch(serialized, /HOOK DIRECTIVE/);
        assert.ok(!serialized.includes(ctx.directive.promptBlock));
      },
    ],
  ]);

  await runTests("3) legacy / editor compatibility", [
    [
      "7. legacy brief without hookPlan loads normally",
      () => {
        const adapter = createMemoryDraftStorageAdapter();
        const draft = createDraft(
          {
            script: buildScript({ title: "Legacy Story", narration: "Legacy narration body." }),
            creationBrief: buildCreationBrief("Legacy topic"),
          },
          { adapter },
        );

        assert.equal(draft.creationBrief?.hookPlan, undefined);
        const reloaded = getDraft(draft.id, { adapter });
        assert.ok(reloaded);
        assert.equal(reloaded!.creationBrief?.hookPlan, undefined);
        assert.equal(reloaded!.script.narration, "Legacy narration body.");
      },
    ],
    [
      "8. editor-like updateDraft that only changes the script title does not invent a hookPlan",
      () => {
        const adapter = createMemoryDraftStorageAdapter();
        const draft = createDraft(
          {
            script: buildScript({ title: "Original Title", narration: "Original narration body." }),
            creationBrief: buildCreationBrief("Editor topic"),
          },
          { adapter },
        );
        assert.equal(draft.creationBrief?.hookPlan, undefined);

        const updated = updateDraft(
          draft.id,
          { script: { ...draft.script, title: "Edited Title" } },
          { adapter },
        );

        assert.ok(updated);
        assert.equal(updated!.script.title, "Edited Title");
        assert.equal(updated!.script.narration, "Original narration body.");
        assert.equal(updated!.creationBrief?.hookPlan, undefined);
      },
    ],
  ]);

  await runTests("4) fingerprint identity", [
    [
      "9. changing the topic produces a new requestFingerprint",
      () => {
        const ctxA = buildHookGenerationContext({
          topic: "Topic Alpha",
          generationPath: "script_only",
          durationSeconds: 30,
        });
        const ctxB = buildHookGenerationContext({
          topic: "Topic Beta",
          generationPath: "script_only",
          durationSeconds: 30,
        });
        assertHookRequestFingerprint(ctxA.request);
        assertHookRequestFingerprint(ctxB.request);
        assert.notEqual(ctxA.request.requestFingerprint, ctxB.request.requestFingerprint);
      },
    ],
    [
      "10. a strategy change produces a different planFingerprint",
      () => {
        const topic = "Same Topic Everywhere";
        const defaultRequest = normalizeHookRequest({
          contractVersion: HOOK_CONTRACT_VERSION,
          topic,
          scriptMode: "story",
          tone: "dramatic",
          durationSeconds: 30,
          generationPath: "script_only",
        });
        const userDirectedRequest = normalizeHookRequest({
          contractVersion: HOOK_CONTRACT_VERSION,
          topic,
          scriptMode: "story",
          tone: "dramatic",
          durationSeconds: 30,
          userAuthoredHook: "A punchy creator-authored opening line",
          generationPath: "script_only",
        });

        const defaultBuilt = buildHookPlanFromRequest(defaultRequest);
        const userDirectedBuilt = buildHookPlanFromRequest(userDirectedRequest);

        assert.notEqual(defaultBuilt.plan.strategyId, userDirectedBuilt.plan.strategyId);
        assert.equal(userDirectedBuilt.plan.strategyId, "user_directed");
        assert.notEqual(defaultBuilt.plan.planFingerprint, userDirectedBuilt.plan.planFingerprint);
      },
    ],
    [
      "11. request/plan fingerprints are stable and content-derived — no Date.now in identity",
      () => {
        const buildOnce = () => {
          const ctx = buildHookGenerationContext({
            topic: "Repeatable fingerprint topic",
            generationPath: "script_only",
            durationSeconds: 30,
          });
          return { request: ctx.request, plan: ctx.plan };
        };

        const first = buildOnce();
        // Small delay in wall-clock time between builds must not change identity.
        const busyUntil = Date.now() + 5;
        while (Date.now() < busyUntil) {
          /* deterministic hashing must not depend on elapsed time */
        }
        const second = buildOnce();

        assert.equal(first.request.requestFingerprint, second.request.requestFingerprint);
        assert.equal(first.plan.planFingerprint, second.plan.planFingerprint);

        const snapshotFirst = buildHookPlanSnapshot(first.plan);
        const snapshotSecond = buildHookPlanSnapshot(second.plan);
        assert.deepEqual(snapshotFirst, snapshotSecond);
      },
    ],
  ]);

  await runTests("5) narration remains the spoken authority", [
    [
      "12. a stale hookPlan snapshot must not override current narration — script.narration always wins",
      async () => {
        const topic = "Crystal Palace new manager era";
        const { result: original } = await generateApproved(topic);
        const adapter = createMemoryDraftStorageAdapter();

        const draft = createDraft(
          {
            script: buildScript({ title: original.title, narration: original.approvedNarration }),
            creationBrief: buildCreationBrief(topic, { hookPlan: original.snapshot }),
          },
          { adapter },
        );

        // Simulate an editor narration edit that never regenerates the Hook plan.
        const editedNarration = "A completely different, manually edited spoken narration.";
        const updated = updateDraft(
          draft.id,
          { script: { ...draft.script, narration: editedNarration } },
          { adapter },
        );

        assert.ok(updated);
        // The stale snapshot and the fresh narration coexist on the draft...
        assert.deepEqual(updated!.creationBrief?.hookPlan, original.snapshot);
        // ...but script.narration — not the snapshot — is what is actually spoken.
        assert.equal(updated!.script.narration, editedNarration);
        assert.notEqual(updated!.script.narration, original.approvedNarration);

        const reloaded = getDraft(draft.id, { adapter });
        assert.equal(reloaded!.script.narration, editedNarration);
        assert.deepEqual(reloaded!.creationBrief?.hookPlan, original.snapshot);
      },
    ],
  ]);

  console.log("\nAll Hook persistence QA checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
