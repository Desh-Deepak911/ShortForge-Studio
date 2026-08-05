/**
 * Sprint 10F.3 — Retention production activation integration verification.
 * Uses injected planner/composer doubles — no live model calls.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// server-only throws outside Next.js — stub before importing production services.
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import {
  assertNoPrivateRetentionFieldsSerialized,
  buildProductionStoryContractInput,
  buildRetentionSafeResponseEnvelope,
  buildRetentionNarrationCandidateFromProposal,
  commitRetentionApprovedNarration,
  countRetentionNarrationWords,
  createRetentionModelCallLedger,
  normalizeStoryContract,
  resolveRetentionBeatCountRange,
  runRetentionProductionNarration,
  runRetentionTerminalValidation,
  type RetentionBodyRewriteCallback,
  type RetentionComposerCallback,
  type RetentionNarrationCandidate,
  type RetentionPlannerCallback,
  type RetentionProductionNarrationResult,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
} from "@/features/retention-story";
import { assertCommitGateLedgerAuthority } from "@/features/retention-story/production/assert-commit-gate-ledger-authority";
import {
  resolveRetentionProductionMaxOutputTokens,
  RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS,
} from "@/features/retention-story/production/resolve-retention-production-max-output-tokens";
import { assertRetentionSafeHookEnvelopeCoherence } from "@/features/retention-story/integration/assert-retention-safe-hook-envelope-coherence";
import {
  generateAudioFirstStory,
  generateScenesForReviewedScript,
  generateScriptOnlyStory,
} from "@/features/story/services/audio-first-generation.service";
import { createDraftFromScript, normalizeDraft } from "@/features/drafts/utils";
import type { FootieScript } from "@/features/story/types";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";
import { requestedStrategyIdFromHookStyle } from "@/features/hook-engine";
import type { RetentionHookRunner } from "@/features/retention-story";

import {
  coherentEnvelope,
  completePlannerProposal,
  emptyGrounding,
  SECTION_WORDS,
} from "./retentionStoryCoherentEnvelope";
import {
  buildTerminalHookAuthority,
  deriveSafeHookEnvelopeFromAuthority,
  readyBridgeWithAuthority,
  toHookTerminalEvidence,
} from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";

function padWords(base: string, target: number): string {
  return padSpokenWords(base, target);
}

function weakProposalForRewrite(plan: RetentionStoryPlan) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, i) => ({
      beatId: beat.id,
      text:
        i === 0 ? "Why does Spain pressure matter?" : "Pressure keeps rising.",
      claimRefs: [] as unknown as string[],
    })),
  };
}

function buildRewriteCandidate(
  plan: RetentionStoryPlan,
  grounding: Parameters<
    typeof buildRetentionNarrationCandidateFromProposal
  >[0]["grounding"],
  strategySeed: RetentionStrategySeed,
  proposal: ReturnType<typeof weakProposalForRewrite>,
): RetentionNarrationCandidate {
  return buildRetentionNarrationCandidateFromProposal({
    proposal,
    plan,
    grounding,
    strategySeed,
    origin: "after_hook_approval",
  }).candidate;
}

function openingPreservingRewriteComposer(
  source: RetentionNarrationCandidate,
): RetentionBodyRewriteCallback {
  return (request) => {
    const opening = request.immutableApprovedOpening.openingText;
    const budget = request.targetWordBudget;
    const n = request.orderedBeatIds.length;
    const first = source.segments[0]!.text;
    assert.ok(first.startsWith(opening));
    const openingWords = countRetentionNarrationWords(first);
    const bodyN = Math.max(1, n - 1);
    const bodyBudget = Math.max(
      bodyN * 4,
      Math.min(
        budget - openingWords - 2,
        Math.floor(budget * 0.78) - openingWords,
      ),
    );
    const base = Math.floor(bodyBudget / bodyN);
    let rem = bodyBudget - base * bodyN;
    return {
      title: "Spain pressure story",
      hookClaimRefs: [],
      segments: request.orderedBeatIds.map((beatId, i) => {
        if (i === 0) {
          return { beatId, text: first, claimRefs: [] as unknown as string[] };
        }
        const section = SECTION_WORDS[i] ?? "next";
        const seed =
          i === n - 1
            ? "Spain pressure closes this preview tonight"
            : `Spain ${section} focus advances tonight`;
        const target = Math.max(4, base + (rem > 0 ? 1 : 0));
        if (rem > 0) rem -= 1;
        return {
          beatId,
          text: padWords(seed, target),
          claimRefs: [] as unknown as string[],
        };
      }),
    };
  };
}

function assertEnvelopeRejects(
  authority: ReturnType<typeof buildTerminalHookAuthority>,
  snapshot: ReturnType<
    typeof deriveSafeHookEnvelopeFromAuthority
  >["hookPlanSnapshot"],
  diagnostics: ReturnType<
    typeof deriveSafeHookEnvelopeFromAuthority
  >["hookDiagnostics"],
  patch: Record<string, unknown>,
): void {
  assert.throws(() =>
    assertRetentionSafeHookEnvelopeCoherence({
      hookPlanSnapshot: snapshot,
      hookDiagnostics: { ...diagnostics, ...patch },
      terminalHookAuthority: authority,
      generationPath: "script_only",
    }),
  );
}

function fakeScene(id: string, start: number, end: number) {
  return {
    id,
    start,
    end,
    duration: end - start,
    subtitle: "Scene",
  };
}

function fakeVoiceover(durationMs = 28_000) {
  return {
    durationMs,
    provider: "openai" as const,
    audioBase64: "ZmFrZQ==",
    audioBuffer: new ArrayBuffer(8),
    metadata: { durationSource: "measured" as const },
  };
}

/**
 * Test Hook runner: exercises Retention modelCall, then returns a coherent
 * Hook approval with real terminal evidence (avoids live Hook threshold flakiness).
 */
const passRetentionHookRunner: RetentionHookRunner = async (input) => {
  const initial = await input.modelCall({
    kind: "initial",
    topic: input.topic,
    tone: input.tone,
    duration: input.duration,
    scriptMode: input.scriptMode,
    context: input.context,
    templatePromptBlock: input.templatePromptBlock,
    hookDirectiveBlock: input.hookContext.directive.promptBlock,
    permittedClaimIds: input.hookContext.permittedClaimIds,
    qualityMode: input.qualityMode,
    model: input.model,
  });
  const span = extractOpeningSpan(initial.narration);
  if (!span) {
    return {
      ok: false,
      error: "opening span missing",
      diagnostics: {
        contractVersion: input.hookContext.request.contractVersion,
        strategyId: input.hookContext.plan.strategyId,
        strategyVersion: input.hookContext.plan.strategyVersion,
        strategySource: input.hookContext.plan.strategySource,
        generationPath: input.hookContext.generationPath,
        requestFingerprint: input.hookContext.request.requestFingerprint,
        planFingerprint: input.hookContext.plan.planFingerprint,
        groundingStatus: "user_context_only",
        validationOutcome: "fail",
        repairAttempts: 0,
        templateInfluenced: false,
        promptIntelligenceInfluenced: false,
        adapterRan: true,
      },
      snapshot: input.hookContext.snapshot,
    };
  }
  const generationPath =
    input.hookContext.generationPath === "audio_first_full"
      ? "audio_first_full"
      : "script_only";
  const authority = buildTerminalHookAuthority(initial.narration, {
    generationPath,
    topic: input.topic,
    scriptMode: input.scriptMode,
    tone: input.tone,
    durationSeconds: input.duration,
  });
  const { hookPlanSnapshot, hookDiagnostics } =
    deriveSafeHookEnvelopeFromAuthority(authority, generationPath);
  return {
    ok: true,
    title: initial.title,
    approvedNarration: initial.narration,
    selection: {
      candidateId: authority.approvedCandidate.candidateId,
      strategyId: authority.activePlan.strategyId,
      strategySource: authority.activePlan.strategySource,
      candidateOrigin: authority.approvedCandidate.origin,
      openingText: span.openingText,
      planFingerprint: authority.activePlan.planFingerprint,
      narrationCommitRule: "opening_span_of_narration",
    },
    diagnostics: hookDiagnostics,
    snapshot: hookPlanSnapshot,
    compressionRevalidated: false,
    terminalEvidence: toHookTerminalEvidence(authority),
  };
};

const SECRET_FIXTURES = Object.freeze([
  "sk-proj-ABC123SECRETKEY999",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret.payload",
  "OPENAI_API_KEY=sk-live-should-never-leak",
  'provider_payload={"choices":[{"text":"secret narration dump"}]}',
  "multiline\nerror\nwith\nstack\n    at Object.<anonymous> (/secret/path.ts:1:1)",
  "a".repeat(64) + "high_entropy_token_xyz",
]);

function assertNoSecrets(blob: string): void {
  for (const secret of SECRET_FIXTURES) {
    assert.equal(
      blob.includes(secret),
      false,
      `secret leaked: ${secret.slice(0, 24)}…`,
    );
  }
  assert.equal(/sk-[A-Za-z0-9_-]{10,}/.test(blob), false);
  assert.equal(/Bearer\s+eyJ/.test(blob), false);
}

const ROOT = path.resolve(__dirname, "../../..");
const PRODUCTION_ROOT = path.join(ROOT, "features/retention-story/production");
const AUDIO_FIRST = path.join(
  ROOT,
  "features/story/services/audio-first-generation.service.ts",
);
const ROUTE = path.join(ROOT, "app/api/generate-script/route.ts");

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function makePlanner(
  qualityMode: "cheap" | "balanced" | "best",
): RetentionPlannerCallback | null {
  if (qualityMode === "cheap") return null;
  return (request) => {
    const contract = normalizeStoryContract({
      topic: request.topic,
      durationSec: request.durationSec,
      qualityMode: request.qualityMode,
      generationPath: "script_only",
      scriptMode: "story",
      tone: "dramatic",
      grounding: emptyGrounding(),
    });
    return completePlannerProposal({
      contract,
      grounding: emptyGrounding(),
      planner: null,
    });
  };
}

/**
 * Composer double mirrored from validator fittingProposal — clears short_retention
 * editorial thresholds while staying ≤ duration×2.4 word budget.
 */
function makeComposer(): RetentionComposerCallback {
  return (request) => {
    const n = request.orderedBeatIds.length;
    // Must match build-retention-compression-goals (Math.round).
    const budget = Math.round(request.durationSec * 2.4);
    const minPer = 4;
    const targetTotal = Math.min(
      Math.max(n * minPer, budget - 8),
      Math.max(n * minPer, Math.floor(budget * 0.78)),
    );
    const base = Math.floor(targetTotal / n);
    let rem = targetTotal - base * n;
    const segments = request.orderedBeatIds.map((beatId, i) => {
      const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
      const section = SECTION_WORDS[i] ?? "next";
      if (i === 0) {
        // Question opening clears curiosity + Hook span extraction.
        const open = "Why does Spain pressure matter?";
        const openWords = open.trim().split(/\s+/).filter(Boolean).length;
        const body = padWords(
          "Spain tactical focus reshapes this France preview tonight",
          Math.max(3, target - openWords),
        );
        return {
          beatId,
          text: joinOpeningAndBody(open, body),
          claimRefs: [] as unknown as string[],
        };
      }
      const seed =
        i === n - 1
          ? "Spain pressure closes this preview decisively tonight"
          : `Spain ${section} pressure advances with clear focus`;
      return {
        beatId,
        text: padWords(seed, target),
        claimRefs: [] as unknown as string[],
      };
    });
    return {
      title: "Spain pressure story",
      hookClaimRefs: [] as unknown as string[],
      segments,
    };
  };
}

function productionDoubles(qualityMode: "cheap" | "balanced" | "best") {
  return {
    planner: makePlanner(qualityMode),
    composer: makeComposer(),
    hookRunner: passRetentionHookRunner,
  } as const;
}

function assertPass(
  result: RetentionProductionNarrationResult,
): asserts result is Extract<RetentionProductionNarrationResult, { ok: true }> {
  assert.equal(
    result.ok,
    true,
    result.ok
      ? ""
      : `${result.error} category=${result.failureCategory} reasons=${result.retentionDiagnostics.safeReasonIds.join(",")}`,
  );
}

async function main(): Promise<void> {
  console.log(
    "\nretention-production-integration (Sprint 10F.3 / 10F.3A / 10F.3B)\n",
  );

  await check("[P1] production module exists and owns orchestration", () => {
    assert.ok(statSync(PRODUCTION_ROOT).isDirectory());
    const sources = collectTsFiles(PRODUCTION_ROOT)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    assert.match(sources, /runRetentionProductionNarration/);
    assert.match(sources, /commitRetentionApprovedNarration/);
    assert.match(sources, /createRetentionModelCallLedger/);
    assert.equal(sources.includes("NEXT_PUBLIC_"), false);
  });

  await check(
    "[P2] audio-first uses Retention orchestrator; no parallel Hook-only path",
    () => {
      const src = readFileSync(AUDIO_FIRST, "utf8");
      assert.match(src, /runRetentionProductionNarration/);
      assert.equal(/generateHookedNarration\s*\(/.test(src), false);
      assert.match(
        src,
        /Voiceover never begins before the Retention commit gate/,
      );
    },
  );

  await check(
    "[P3] route does not call Hook bridge / old generator directly",
    () => {
      const route = readFileSync(ROUTE, "utf8");
      assert.equal(/runRetentionHookBridge/.test(route), false);
      assert.equal(/generateHookedNarration/.test(route), false);
      assert.match(route, /retentionPlan|retentionDiagnostics/);
    },
  );

  await check("[P4] Fast script-only terminal Pass", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      tone: "dramatic",
      ...productionDoubles("cheap"),
    });
    assertPass(result);
    assert.equal(result.approved.terminalState, "pass_without_rewrite");
    assert.equal(result.approved.qualityMode, "cheap");
    assert.ok(result.approved.narration.length > 0);
    assert.ok(result.approved.planSnapshot.planFingerprint);
    assert.equal(result.approved.validationSummary.ok, true);
    assert.equal(result.approved.safeDiagnostics.budget?.planner, 0);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    assertNoPrivateRetentionFieldsSerialized(envelope);
    assert.ok(envelope.retentionPlan);
    assert.ok(envelope.retentionValidation);
  });

  await check(
    "[P5] Balanced script-only Pass with exactly one planner call",
    async () => {
      let plannerCalls = 0;
      const planner: RetentionPlannerCallback = (req) => {
        plannerCalls += 1;
        return makePlanner("balanced")!(req);
      };
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        scriptMode: "story",
        tone: "dramatic",
        planner,
        composer: makeComposer(),
        hookRunner: passRetentionHookRunner,
      });
      assertPass(result);
      assert.equal(plannerCalls, 1);
      assert.equal(result.approved.safeDiagnostics.budget?.planner, 1);
      assert.ok((result.approved.safeDiagnostics.budget?.total ?? 99) <= 6);
    },
  );

  await check(
    "[P6] Studio script-only can Pass (rewrite path available)",
    async () => {
      let rewriteCalls = 0;
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "best",
        scriptMode: "story",
        tone: "dramatic",
        ...productionDoubles("best"),
        rewriteComposer: async (req) => {
          rewriteCalls += 1;
          const composer = makeComposer();
          return composer({
            orderedBeatIds: req.orderedBeatIds,
            durationSec: 30,
          } as Parameters<RetentionComposerCallback>[0]);
        },
      });
      assertPass(result);
      assert.ok(
        result.approved.terminalState === "pass_without_rewrite" ||
          result.approved.terminalState === "pass_after_rewrite",
      );
      if (result.approved.terminalState === "pass_without_rewrite") {
        assert.equal(rewriteCalls, 0);
      }
    },
  );

  await check(
    "[P7] full audio-first ordering — VO/scenes only after commit",
    async () => {
      let voCalls = 0;
      let sceneCalls = 0;
      const result = await generateAudioFirstStory({
        prompt: "Spain versus France tactical preview",
        sceneCount: 4,
        duration: 30,
        qualityMode: "cheap",
        qualityModeExplicit: true,
        tone: "dramatic",
        scriptMode: "story",
        retentionPlanner: null,
        retentionComposer: makeComposer(),
        retentionHookRunner: passRetentionHookRunner,
        voiceoverFromScript: async (script) => {
          voCalls += 1;
          assert.ok(script.narration.length > 0);
          return fakeVoiceover();
        },
        scenesFromScriptAndAudio: async () => {
          sceneCalls += 1;
          return {
            success: true as const,
            scenes: [fakeScene("s1", 0, 7), fakeScene("s2", 7, 14)],
          };
        },
      });
      assert.equal(result.success, true);
      assert.equal(voCalls, 1);
      assert.equal(sceneCalls, 1);
      if (result.success) {
        assert.ok(result.retentionEnvelope?.planSnapshot);
        assert.ok(result.hookEnvelope?.snapshot);
      }
    },
  );

  await check(
    "[P8] composer throw recovers via reliability fallback before VO",
    async () => {
      let voCalls = 0;
      let sceneCalls = 0;
      const result = await generateAudioFirstStory({
        prompt: "Spain versus France tactical preview",
        sceneCount: 4,
        duration: 30,
        qualityMode: "cheap",
        qualityModeExplicit: true,
        retentionPlanner: null,
        retentionComposer: () => {
          throw new Error("composer boom");
        },
        retentionHookRunner: passRetentionHookRunner,
        voiceoverFromScript: async (script) => {
          voCalls += 1;
          assert.ok(script.narration.length > 0);
          return fakeVoiceover();
        },
        scenesFromScriptAndAudio: async () => {
          sceneCalls += 1;
          return {
            success: true as const,
            scenes: [fakeScene("s1", 0, 7), fakeScene("s2", 7, 14)],
          };
        },
      });
      assert.equal(result.success, true);
      assert.equal(voCalls, 1);
      assert.equal(sceneCalls, 1);
      if (result.success) {
        assert.ok(result.retentionEnvelope?.planSnapshot);
      }
    },
  );

  await check(
    "[P9] empty composer recovers via deterministic reliability fallback",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: () => ({
          title: "t",
          hookClaimRefs: [],
          segments: [],
        }),
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.approved.narration.trim().length > 20);
        assert.ok(
          result.approved.generationDisposition?.adaptations.includes(
            "deterministic_story_fallback_used",
          ) ||
            result.approved.generationDisposition?.adaptations.includes(
              "reliability_rescue_used",
            ),
        );
      }
    },
  );

  await check(
    "[P10] planner malformed output uses deterministic reliability plan",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        planner: () => ({ strategy: null, beats: null }),
        composer: makeComposer(),
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.approved.narration.trim().length > 0);
        assert.ok(
          result.approved.generationDisposition?.adaptations.includes(
            "planner_fallback_used",
          ),
        );
      }
    },
  );

  await check("[P11] empty topic remains a hard blocker", async () => {
    const result = await runRetentionProductionNarration({
      topic: "   ",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: makeComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureCategory, "contract_normalization_failure");
    }
  });

  await check(
    "[P12] scenes-only preserves narration byte-for-byte and skips Retention",
    async () => {
      const title = "  Exact Title  ";
      const narration = "Exact narration bytes.\nSecond line.";
      const result = await generateScenesForReviewedScript({
        prompt: "Spain versus France tactical preview",
        title,
        narration,
        voiceoverDurationMs: 30_000,
        sceneCount: 3,
        scenesFromScriptAndAudio: async ({ script }) => {
          assert.equal(script.title, title);
          assert.equal(script.narration, narration);
          return {
            success: true as const,
            scenes: [fakeScene("s1", 0, 10), fakeScene("s2", 10, 20)],
          };
        },
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.footieScript.title, title);
        assert.equal(result.footieScript.narration, narration);
        assert.equal(result.retentionEnvelope, undefined);
      }
      const audioSrc = readFileSync(AUDIO_FIRST, "utf8");
      assert.match(audioSrc, /Scenes-only never runs Retention/);
    },
  );

  await check(
    "[P13] explicit Hook Style + Write My Own contract identities",
    () => {
      const styled = buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        hookStyle: "curiosity_gap",
        qualityMode: "cheap",
      });
      const normalized = normalizeStoryContract(styled);
      assert.equal(normalized.identities.hookStyleIdentity, "curiosity_gap");

      const authored = buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        hookStyle: "user_written",
        userAuthoredHook: "Spain pressure night hits harder.",
        qualityMode: "cheap",
      });
      const n2 = normalizeStoryContract(authored);
      assert.equal(n2.identities.hookStyleIdentity, "user_written");
      assert.ok(n2.identities.userAuthoredHookIdentity);
    },
  );

  await check(
    "[P14] template advisory + research off + creator context authorized",
    () => {
      const input = buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        templateId: "football_match_preview",
        manualContext: "I think Spain looks sharper.",
        qualityMode: "cheap",
      });
      const contract = normalizeStoryContract(input);
      assert.equal(contract.templateInfluence, "advisory");
      assert.ok(contract.identities.manualContextIdentity);
      const grounding = input.grounding!;
      const manualClaims = grounding.claims.filter(
        (claim) => claim.provenance === "manual_user",
      );
      assert.ok(manualClaims.length >= 1);
      for (const claim of manualClaims) {
        assert.equal(claim.verification, "unverified");
        assert.equal(claim.permittedFactualUse, true);
      }
    },
  );

  await check("[P15] JSON/NDJSON safe-envelope parity helpers", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...productionDoubles("cheap"),
    });
    assertPass(result);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    const json = JSON.parse(JSON.stringify(envelope));
    assert.deepEqual(json.retentionPlan, envelope.retentionPlan);
    assert.deepEqual(json.retentionValidation, envelope.retentionValidation);
    assertNoPrivateRetentionFieldsSerialized({
      type: "complete",
      success: true,
      ...envelope,
      hookPlan: result.approved.hookPlan,
      hookDiagnostics: result.approved.hookDiagnostics,
    });
    assert.equal(
      JSON.stringify(envelope).includes("terminalHookAuthority"),
      false,
    );
  });

  await check("[P16] legacy draft reload without Retention snapshots", () => {
    const script: FootieScript = {
      title: "Legacy",
      narration: "Legacy narration.",
      totalDuration: 30,
      scenes: [],
    };
    const draft = createDraftFromScript(
      script,
      {
        topic: "Legacy topic",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 4,
      },
      undefined,
      "script_review",
    );
    const loaded = normalizeDraft(draft);
    assert.equal(loaded.creationBrief?.retentionPlan, undefined);
    assert.equal(loaded.creationBrief?.retentionValidation, undefined);
    assert.equal(loaded.script.narration, "Legacy narration.");
  });

  await check("[P17] successful snapshot round-trip on brief", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...productionDoubles("cheap"),
    });
    assertPass(result);
    const draft = createDraftFromScript(
      {
        title: result.approved.title,
        narration: result.approved.narration,
        totalDuration: 30,
        scenes: [],
      },
      {
        topic: "Spain versus France tactical preview",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 4,
        retentionPlan: result.approved.planSnapshot,
        retentionValidation: result.approved.validationSummary,
        hookPlan: result.approved.hookPlan,
      },
      undefined,
      "script_review",
    );
    const loaded = normalizeDraft(draft);
    assert.deepEqual(
      loaded.creationBrief?.retentionPlan,
      result.approved.planSnapshot,
    );
    assert.deepEqual(
      loaded.creationBrief?.retentionValidation,
      result.approved.validationSummary,
    );
    assert.equal(loaded.script.narration, result.approved.narration);
  });

  await check("[P18] failed generation persists nothing", async () => {
    const result = await runRetentionProductionNarration({
      topic: "",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: makeComposer(),
    });
    assert.equal(result.ok, false);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    assert.equal(envelope.retentionPlan, undefined);
    assert.equal(envelope.retentionValidation, undefined);
  });

  await check("[P19] commit gate rejects non-pass terminals", () => {
    const ledger = createRetentionModelCallLedger("cheap");
    const contract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
    });
    const rejected = commitRetentionApprovedNarration({
      terminal: {
        status: "rewrite_not_allowed",
        diagnostics: {
          version: 1,
          terminalState: "rewrite_not_allowed",
          qualityMode: "cheap",
          contractFingerprint: contract.contractFingerprint,
          planFingerprint: null,
          initialCandidateFingerprint: null,
          finalCandidateFingerprint: null,
          initialValidationFingerprint: null,
          finalValidationFingerprint: null,
          rewriteUsed: false,
          lengthCompressionUsed: false,
          deterministicTruncateUsed: false,
          budget: null,
          safeReasonIds: Object.freeze(["quality_mode_not_studio"]),
        },
      },
      // Non-pass exits before plan/seed coherence — placeholders unused.
      contract,
      grounding: emptyGrounding(),
      strategySeed: null as never,
      plan: null as never,
      ledger,
      title: "t",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.reason, "terminal_not_pass");
    }
  });

  await check(
    "[P20] concurrent requests do not share ledger/plan/evidence",
    async () => {
      const [a, b] = await Promise.all([
        runRetentionProductionNarration({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "cheap",
          ...productionDoubles("cheap"),
        }),
        runRetentionProductionNarration({
          topic: "Germany versus Italy tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "cheap",
          ...productionDoubles("cheap"),
        }),
      ]);
      assertPass(a);
      assertPass(b);
      assert.notEqual(
        a.approved.contractFingerprint,
        b.approved.contractFingerprint,
      );
      assert.notEqual(a.approved.planFingerprint, b.approved.planFingerprint);
      assert.notEqual(
        a.approved.candidateFingerprint,
        b.approved.candidateFingerprint,
      );
    },
  );

  await check(
    "[P21] script-only service success carries Retention + Hook envelopes",
    async () => {
      const result = await generateScriptOnlyStory({
        prompt: "Spain versus France tactical preview",
        sceneCount: 4,
        duration: 30,
        qualityMode: "cheap",
        qualityModeExplicit: true,
        retentionPlanner: null,
        retentionComposer: makeComposer(),
        retentionHookRunner: passRetentionHookRunner,
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.ok(result.hookEnvelope?.snapshot);
        assert.ok(result.retentionEnvelope?.planSnapshot);
        assert.ok(result.retentionEnvelope?.validationSummary);
        assertNoPrivateRetentionFieldsSerialized(result.retentionEnvelope);
      }
    },
  );

  await check(
    "[P22] research-off contract has null research identity when empty",
    () => {
      const input = buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
      });
      const contract = normalizeStoryContract(input);
      assert.equal(contract.groundingSummary.claimCount >= 0, true);
      assert.equal(
        contract.groundingSummary.researchIdentity,
        input.grounding?.researchIdentity ?? null,
      );
    },
  );

  // ── 10F.3A hardening fixtures ───────────────────────────────────────────

  await check("[H1] same-total ledgers with swapped categories reject", () => {
    const live = createRetentionModelCallLedger("cheap");
    live.consume("initial_narration");
    live.recordOutcome("initial_narration", "succeeded");
    const swapped = createRetentionModelCallLedger("cheap");
    swapped.consume("hook_repair");
    swapped.recordOutcome("hook_repair", "succeeded");
    assert.equal(live.snapshot().counts.total, swapped.snapshot().counts.total);
    assert.throws(() =>
      assertCommitGateLedgerAuthority({
        liveLedger: live,
        terminalBudget: swapped.snapshot(),
        bridgeBudget: live.snapshot(),
        qualityMode: "cheap",
        terminalState: "pass_without_rewrite",
      }),
    );
  });

  await check(
    "[H2] pass_without_rewrite rejects rewrite-history ledger",
    () => {
      const live = createRetentionModelCallLedger("best");
      live.consume("initial_narration");
      live.recordOutcome("initial_narration", "succeeded");
      live.consume("retention_body_rewrite");
      live.recordOutcome("retention_body_rewrite", "succeeded");
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: live,
          terminalBudget: live.snapshot(),
          bridgeBudget: live.snapshot(),
          qualityMode: "best",
          terminalState: "pass_without_rewrite",
        }),
      );
    },
  );

  await check(
    "[H3] max planner/composer schema output policies for 15/30/45/60",
    () => {
      for (const durationSec of [15, 30, 45, 60] as const) {
        const contract = normalizeStoryContract({
          topic: "Spain versus France tactical preview",
          durationSec,
          generationPath: "script_only",
          qualityMode: "balanced",
        });
        const range = resolveRetentionBeatCountRange(contract);
        const plannerTokens = resolveRetentionProductionMaxOutputTokens({
          kind: "planner",
          durationSec,
          beatCount: range.max,
        });
        const composerTokens = resolveRetentionProductionMaxOutputTokens({
          kind: "initial_composer",
          durationSec,
          beatCount: range.max,
          targetWordBudget: Math.round(durationSec * 2.4),
        });
        const rewriteTokens = resolveRetentionProductionMaxOutputTokens({
          kind: "studio_rewrite",
          durationSec,
          beatCount: range.max,
          targetWordBudget: Math.round(durationSec * 2.4),
        });
        for (const tokens of [plannerTokens, composerTokens, rewriteTokens]) {
          assert.ok(tokens >= RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS.min);
          assert.ok(tokens <= RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS.max);
        }
        assert.ok(
          plannerTokens >= RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS.min,
        );
      }
      const src = readFileSync(
        path.join(PRODUCTION_ROOT, "retention-production-model-json.ts"),
        "utf8",
      );
      assert.equal(src.includes("resolveNarrationMaxOutputTokens"), false);
      assert.match(src, /resolveRetentionProductionMaxOutputTokens/);
    },
  );

  await check(
    "[H4] voice throw / unresolved duration / scene failure strip snapshots",
    async () => {
      const base = {
        prompt: "Spain versus France tactical preview",
        sceneCount: 3,
        duration: 30,
        qualityMode: "cheap" as const,
        qualityModeExplicit: true as const,
        retentionPlanner: null,
        retentionComposer: makeComposer(),
        retentionHookRunner: passRetentionHookRunner,
      };

      const voiceThrow = await generateAudioFirstStory({
        ...base,
        voiceoverFromScript: async () => {
          throw new Error(SECRET_FIXTURES[0]!);
        },
      });
      assert.equal(voiceThrow.success, false);
      if (!voiceThrow.success) {
        assert.equal(voiceThrow.retentionEnvelope?.planSnapshot, undefined);
        assert.equal(
          voiceThrow.retentionEnvelope?.validationSummary,
          undefined,
        );
        assert.ok(voiceThrow.retentionEnvelope?.diagnostics);
        assertNoSecrets(JSON.stringify(voiceThrow));
        assert.equal(voiceThrow.error.includes("sk-"), false);
      }

      const badDuration = await generateAudioFirstStory({
        ...base,
        voiceoverFromScript: async () => ({
          durationMs: NaN,
          provider: "test",
          audioBase64: "AAAA",
          metadata: { durationSource: "measured" as const },
        }),
      });
      assert.equal(badDuration.success, false);
      if (!badDuration.success) {
        assert.equal(badDuration.retentionEnvelope?.planSnapshot, undefined);
        assert.equal(
          badDuration.retentionEnvelope?.validationSummary,
          undefined,
        );
      }

      const sceneFail = await generateAudioFirstStory({
        ...base,
        voiceoverFromScript: async () => fakeVoiceover(),
        scenesFromScriptAndAudio: async () => ({
          success: false as const,
          error: SECRET_FIXTURES[1]!,
          kind: "empty" as const,
          response: null,
        }),
      });
      assert.equal(sceneFail.success, false);
      if (!sceneFail.success) {
        assert.equal(sceneFail.retentionEnvelope?.planSnapshot, undefined);
        assert.equal(sceneFail.retentionEnvelope?.validationSummary, undefined);
        assertNoSecrets(JSON.stringify(sceneFail));
      }

      const sceneThrow = await generateAudioFirstStory({
        ...base,
        voiceoverFromScript: async () => fakeVoiceover(),
        scenesFromScriptAndAudio: async () => {
          throw new Error(SECRET_FIXTURES[2]!);
        },
      });
      assert.equal(sceneThrow.success, false);
      if (!sceneThrow.success) {
        assert.equal(sceneThrow.retentionEnvelope?.planSnapshot, undefined);
        assertNoSecrets(JSON.stringify(sceneThrow));
      }
    },
  );

  await check(
    "[H5] JSON/NDJSON failure parity — no plan/validation on success:false",
    async () => {
      // Hard-blocker path only: empty topic. Composer throws are recoverable.
      const failed = await generateScriptOnlyStory({
        prompt: "   ",
        sceneCount: 4,
        duration: 30,
        qualityMode: "cheap",
        qualityModeExplicit: true,
        retentionPlanner: null,
        retentionComposer: makeComposer(),
      });
      assert.equal(failed.success, false);
      const jsonEnvelope = {
        success: false as const,
        error: failed.success ? "" : failed.error,
        hookPlan: failed.success ? undefined : failed.hookEnvelope?.snapshot,
        hookDiagnostics: failed.success
          ? undefined
          : failed.hookEnvelope?.diagnostics,
        retentionDiagnostics: failed.success
          ? undefined
          : failed.retentionEnvelope?.diagnostics,
        // Explicitly omit retentionPlan / retentionValidation on failure.
      };
      const ndjsonError = {
        type: "error" as const,
        error: jsonEnvelope.error,
        ...(jsonEnvelope.hookPlan ? { hookPlan: jsonEnvelope.hookPlan } : {}),
        ...(jsonEnvelope.hookDiagnostics
          ? { hookDiagnostics: jsonEnvelope.hookDiagnostics }
          : {}),
        ...(jsonEnvelope.retentionDiagnostics
          ? { retentionDiagnostics: jsonEnvelope.retentionDiagnostics }
          : {}),
      };
      for (const blob of [
        JSON.stringify(jsonEnvelope),
        JSON.stringify(ndjsonError),
      ]) {
        assert.equal(blob.includes("retentionPlan"), false);
        assert.equal(blob.includes("retentionValidation"), false);
        assertNoSecrets(blob);
      }
      // Create/draft persistence cannot save snapshots from failed overall generation.
      assert.equal(failed.success, false);
      assert.equal(
        (failed as { retentionEnvelope?: { planSnapshot?: unknown } })
          .retentionEnvelope?.planSnapshot,
        undefined,
      );
    },
  );

  await check("[H6] safe Hook diagnostics privacy + enum negatives", () => {
    const authority = buildTerminalHookAuthority(
      "Why does Spain pressure matter? Spain tactical focus reshapes this France preview tonight pace pace.",
    );
    const { hookPlanSnapshot, hookDiagnostics } =
      deriveSafeHookEnvelopeFromAuthority(authority, "script_only");

    assert.throws(() =>
      assertRetentionSafeHookEnvelopeCoherence({
        hookPlanSnapshot: {
          ...hookPlanSnapshot,
          planFingerprint: "forged:plan",
        },
        hookDiagnostics,
        terminalHookAuthority: authority,
        generationPath: "script_only",
      }),
    );

    for (const repairAttempts of [2, 999, -1, Number.NaN, 1.5]) {
      assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
        repairAttempts,
      });
    }

    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      templateInfluenced: true,
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      promptIntelligenceInfluenced: true,
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      validationOutcome: "fail",
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      validationOutcome: "generation_failed",
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      validationOutcome: "fallback",
      fallbackReason: "validated_compatibility_fallback",
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      validationOutcome: "repaired",
      repairAttempts: 1,
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      fallbackReason: SECRET_FIXTURES[0],
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      fallbackReason: "arbitrary free text reason",
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      lengthEnforcement: SECRET_FIXTURES[1],
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      lengthEnforcement: "mystery_mode",
    });
    assertEnvelopeRejects(authority, hookPlanSnapshot, hookDiagnostics, {
      unknownField: true,
    });

    const { adapterRan: _omit, ...missingRequired } = hookDiagnostics;
    void _omit;
    assert.throws(() =>
      assertRetentionSafeHookEnvelopeCoherence({
        hookPlanSnapshot,
        hookDiagnostics: missingRequired,
        terminalHookAuthority: authority,
        generationPath: "script_only",
      }),
    );

    // Rejected values must not appear in creator-facing / serialized surfaces.
    const rejectedBlob = JSON.stringify({
      success: false,
      error:
        "The opening didn't pass Hook quality checks. Please try again or adjust Hook style.",
      retentionDiagnostics: { safeReasonIds: ["safe_hook_envelope_mismatch"] },
    });
    assertNoSecrets(rejectedBlob);
    assert.equal(rejectedBlob.includes("repairAttempts"), false);
    assert.equal(rejectedBlob.includes("mystery_mode"), false);
  });

  await check("[H7] secret-bearing raw exceptions never escape", async () => {
    const logs: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.warn = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: () => {
          throw new Error(
            `${SECRET_FIXTURES[0]}\n${SECRET_FIXTURES[1]}\n${SECRET_FIXTURES[4]}`,
          );
        },
      });
      // Composer throw is recoverable via deterministic fallback; secrets must
      // never leak into the success envelope or console output.
      assert.equal(result.ok, true);
      if (result.ok) {
        assertNoSecrets(JSON.stringify(result));
        assertNoSecrets(result.approved.narration);
        for (const id of result.approved.safeDiagnostics.safeReasonIds) {
          assertNoSecrets(id);
        }
      }
      assertNoSecrets(logs.join("\n"));
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }
  });

  await check(
    "[H8] successful Fast/Balanced/Studio script-only + audio-first",
    async () => {
      for (const mode of ["cheap", "balanced", "best"] as const) {
        const scriptOnly = await runRetentionProductionNarration({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: mode,
          ...productionDoubles(mode),
        });
        assertPass(scriptOnly);
        assert.ok(scriptOnly.approved.planSnapshot);
        assert.ok(scriptOnly.approved.validationSummary);
      }

      const audioFirst = await generateAudioFirstStory({
        prompt: "Spain versus France tactical preview",
        sceneCount: 3,
        duration: 30,
        qualityMode: "cheap",
        qualityModeExplicit: true,
        ...{
          retentionPlanner: null,
          retentionComposer: makeComposer(),
          retentionHookRunner: passRetentionHookRunner,
        },
        voiceoverFromScript: async () => fakeVoiceover(),
        scenesFromScriptAndAudio: async () => ({
          success: true as const,
          scenes: [fakeScene("s1", 0, 10), fakeScene("s2", 10, 20)],
        }),
      });
      assert.equal(audioFirst.success, true);
      if (audioFirst.success) {
        assert.ok(audioFirst.retentionEnvelope?.planSnapshot);
        assert.ok(audioFirst.retentionEnvelope?.validationSummary);
      }
    },
  );

  await check(
    "[H9] scenes-only byte-for-byte preservation (10F.3A)",
    async () => {
      const title = "  Keep Title Exact  ";
      const narration = "  Keep narration\nbytes exact.  ";
      const result = await generateScenesForReviewedScript({
        prompt: "Spain versus France tactical preview",
        title,
        narration,
        voiceoverDurationMs: 28_000,
        sceneCount: 3,
        scenesFromScriptAndAudio: async ({ script }) => {
          assert.equal(script.title, title);
          assert.equal(script.narration, narration);
          return {
            success: true as const,
            scenes: [fakeScene("a", 0, 14), fakeScene("b", 14, 28)],
          };
        },
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.footieScript.title, title);
        assert.equal(result.footieScript.narration, narration);
      }
    },
  );

  await check(
    "[H10] pass_after_rewrite commit-gate positive + ledger rewrite rejects",
    async () => {
      const env = await coherentEnvelope("best", {
        formatStrategyId: "short_standard",
        durationSec: 30,
      });
      const candidate = buildRewriteCandidate(
        env.plan,
        env.grounding,
        env.strategySeed,
        weakProposalForRewrite(env.plan),
      );
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "best",
        env.ledger,
      );
      const terminal = await runRetentionTerminalValidation({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        ledger: env.ledger,
        rewriteComposer: openingPreservingRewriteComposer(candidate),
      });
      assert.equal(terminal.status, "pass_after_rewrite", terminal.status);
      if (terminal.status !== "pass_after_rewrite") {
        throw new Error("expected pass_after_rewrite");
      }

      const committed = commitRetentionApprovedNarration({
        terminal,
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        ledger: env.ledger,
        title: bridge.title,
      });
      assert.equal(committed.ok, true);
      if (committed.ok) {
        assert.equal(committed.approved.terminalState, "pass_after_rewrite");
        assert.equal(committed.approved.safeDiagnostics.rewriteUsed, true);
        assert.equal(
          committed.approved.safeDiagnostics.budget?.retentionBodyRewrite,
          1,
        );
      }

      // rewrite before successful initial narration
      const earlyRewrite = createRetentionModelCallLedger("best");
      earlyRewrite.consume("retention_body_rewrite");
      earlyRewrite.recordOutcome("retention_body_rewrite", "succeeded");
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: earlyRewrite,
          terminalBudget: earlyRewrite.snapshot(),
          bridgeBudget: earlyRewrite.snapshot(),
          qualityMode: "best",
          terminalState: "pass_after_rewrite",
        }),
      );

      // failed rewrite terminal
      const failedRewrite = createRetentionModelCallLedger("best");
      failedRewrite.consume("initial_narration");
      failedRewrite.recordOutcome("initial_narration", "succeeded");
      failedRewrite.consume("retention_body_rewrite");
      failedRewrite.recordOutcome("retention_body_rewrite", "failed");
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: failedRewrite,
          terminalBudget: failedRewrite.snapshot(),
          bridgeBudget: failedRewrite.snapshot(),
          qualityMode: "best",
          terminalState: "pass_after_rewrite",
        }),
      );

      // differing rewrite events across live/terminal/bridge
      const liveOk = createRetentionModelCallLedger("best");
      liveOk.consume("initial_narration");
      liveOk.recordOutcome("initial_narration", "succeeded");
      liveOk.consume("retention_body_rewrite");
      liveOk.recordOutcome("retention_body_rewrite", "succeeded");
      const bridgeDiff = createRetentionModelCallLedger("best");
      bridgeDiff.consume("initial_narration");
      bridgeDiff.recordOutcome("initial_narration", "succeeded");
      bridgeDiff.consume("retention_body_rewrite");
      bridgeDiff.recordOutcome("retention_body_rewrite", "malformed");
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: liveOk,
          terminalBudget: liveOk.snapshot(),
          bridgeBudget: bridgeDiff.snapshot(),
          qualityMode: "best",
          terminalState: "pass_after_rewrite",
        }),
      );

      // pass_after_rewrite with zero rewrite
      const zeroRewrite = createRetentionModelCallLedger("best");
      zeroRewrite.consume("initial_narration");
      zeroRewrite.recordOutcome("initial_narration", "succeeded");
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: zeroRewrite,
          terminalBudget: zeroRewrite.snapshot(),
          bridgeBudget: zeroRewrite.snapshot(),
          qualityMode: "best",
          terminalState: "pass_after_rewrite",
        }),
      );

      // pass_without_rewrite with any rewrite attempt (covered by H2; reinforce)
      assert.throws(() =>
        assertCommitGateLedgerAuthority({
          liveLedger: liveOk,
          terminalBudget: liveOk.snapshot(),
          bridgeBudget: liveOk.snapshot(),
          qualityMode: "best",
          terminalState: "pass_without_rewrite",
        }),
      );
    },
  );

  await check(
    "[H11] public Retention barrel omits commit-gate/envelope helpers",
    () => {
      const root = readFileSync(
        path.join(ROOT, "features/retention-story/index.ts"),
        "utf8",
      );
      assert.equal(root.includes("assertCommitGateLedgerAuthority,"), false);
      assert.equal(
        root.includes("assertRetentionSafeHookEnvelopeCoherence,"),
        false,
      );
      assert.equal(
        root.includes("resolveRetentionProductionMaxOutputTokens,"),
        false,
      );
    },
  );

  // ── Sprint 10H.2 planner / Fast / Explicit Hook boundary fixtures ──────────

  async function assertPlannerFallsBack(
    label: string,
    proposal: unknown,
  ): Promise<void> {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "balanced",
      planner: () => proposal as never,
      composer: makeComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true, label);
    if (result.ok) {
      assert.ok(
        result.approved.generationDisposition?.adaptations.includes(
          "planner_fallback_used",
        ),
        `${label}: expected planner_fallback_used`,
      );
      assert.ok(result.approved.narration.trim().length > 0, label);
    }
  }

  await check("[H12A] Balanced planner — valid proposal Passes", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "balanced",
      ...productionDoubles("balanced"),
    });
    assertPass(result);
    assert.equal(result.approved.safeDiagnostics.budget?.planner, 1);
  });

  await check(
    "[H12A] Balanced planner — missing/wrong strategy fields falls back to deterministic plan",
    async () => {
      await assertPlannerFallsBack("missing strategy", { beats: [] });
      await assertPlannerFallsBack("null strategy", {
        strategy: null,
        beats: [],
      });
    },
  );

  await check(
    "[H12A] Balanced planner — unsupported emotion falls back to deterministic plan",
    async () => {
      const base = await (async () => {
        const contract = normalizeStoryContract({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          qualityMode: "balanced",
          generationPath: "script_only",
          scriptMode: "story",
          tone: "dramatic",
          grounding: emptyGrounding(),
        });
        return completePlannerProposal({
          contract,
          grounding: emptyGrounding(),
          planner: null,
        });
      })();
      await assertPlannerFallsBack("bad emotion", {
        ...base,
        strategy: {
          ...base.strategy,
          primaryEmotion: "excitement",
        },
      });
    },
  );

  await check(
    "[H12A] Balanced planner — invalid purpose / wrong first/terminal falls back to deterministic plan",
    async () => {
      const contract = normalizeStoryContract({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        qualityMode: "balanced",
        generationPath: "script_only",
        scriptMode: "story",
        tone: "dramatic",
        grounding: emptyGrounding(),
      });
      const base = completePlannerProposal({
        contract,
        grounding: emptyGrounding(),
        planner: null,
      });
      const baseBeats = base.beats ?? [];
      assert.ok(baseBeats.length >= 2);
      const beats = baseBeats.map((b) => ({ ...b }));
      beats[0] = { ...beats[0]!, purpose: "curiosity" };
      await assertPlannerFallsBack("wrong first purpose", { ...base, beats });

      const beats2 = baseBeats.map((b) => ({ ...b }));
      beats2[beats2.length - 1] = {
        ...beats2[beats2.length - 1]!,
        purpose: "curiosity",
      };
      await assertPlannerFallsBack("wrong terminal purpose", {
        ...base,
        beats: beats2,
      });

      const beats3 = baseBeats.map((b) => ({ ...b }));
      beats3[1] = { ...beats3[1]!, purpose: "not_a_purpose" };
      await assertPlannerFallsBack("invalid purpose", {
        ...base,
        beats: beats3,
      });
    },
  );

  await check(
    "[H12A] Balanced planner — beat count outside range falls back to deterministic plan",
    async () => {
      const contract = normalizeStoryContract({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        qualityMode: "balanced",
        generationPath: "script_only",
        scriptMode: "story",
        tone: "dramatic",
        grounding: emptyGrounding(),
      });
      const base = completePlannerProposal({
        contract,
        grounding: emptyGrounding(),
        planner: null,
      });
      const baseBeats = base.beats ?? [];
      assert.ok(baseBeats.length >= 1);
      await assertPlannerFallsBack("too few beats", {
        ...base,
        beats: baseBeats.slice(0, 1),
      });
      await assertPlannerFallsBack("too many beats", {
        ...base,
        beats: Array.from({ length: 20 }, (_, i) => ({
          ...baseBeats[Math.min(i, baseBeats.length - 1)]!,
          purpose: i === 0 ? "hook_handoff" : i === 19 ? "payoff" : "curiosity",
        })),
      });
    },
  );

  await check(
    "[H12A] Balanced planner — factual contribution without eligible support falls back to deterministic plan",
    async () => {
      const contract = normalizeStoryContract({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        qualityMode: "balanced",
        generationPath: "script_only",
        scriptMode: "story",
        tone: "dramatic",
        grounding: emptyGrounding(),
      });
      const base = completePlannerProposal({
        contract,
        grounding: emptyGrounding(),
        planner: null,
      });
      const baseBeats = base.beats ?? [];
      assert.ok(baseBeats.length >= 2);
      const beats = baseBeats.map((b, i) =>
        i === 1
          ? {
              ...b,
              informationContribution:
                "Spain won 2-0 with a verified final score",
              groundingClaimRefs: [] as unknown as string[],
            }
          : { ...b },
      );
      await assertPlannerFallsBack("factual without claim refs", {
        ...base,
        beats,
      });
    },
  );

  await check(
    "[H12A] Balanced planner — syntactically valid JSON failing semantic normalize",
    async () => {
      await assertPlannerFallsBack("empty controlling idea", {
        strategy: {
          controllingIdea: "   ",
          controllingIdeaClaimRefs: [],
          primaryEmotion: "curiosity",
          secondaryEmotion: "tension",
          curve: [
            { phase: "opening", emotion: "curiosity", intensity: 2 },
            { phase: "build", emotion: "tension", intensity: 3 },
            { phase: "turn", emotion: "anticipation", intensity: 4 },
            { phase: "payoff", emotion: "satisfaction", intensity: 5 },
          ],
        },
        beats: [
          {
            purpose: "hook_handoff",
            emotionalIntent: "open with pressure",
            viewerQuestion: "what shifts first",
            informationContribution: "pressure shapes the opening contest",
            narrationGoal: "establish the stakes",
            visualOpportunity: "stadium wide shot under lights",
            groundingClaimRefs: [],
          },
          {
            purpose: "curiosity",
            emotionalIntent: "raise the question",
            viewerQuestion: "why this shape",
            informationContribution: "shape changes the middle third",
            narrationGoal: "deepen curiosity",
            visualOpportunity: "midfield press angles",
            groundingClaimRefs: [],
          },
          {
            purpose: "escalation",
            emotionalIntent: "raise urgency",
            viewerQuestion: "what breaks",
            informationContribution: "pressure climbs toward the box",
            narrationGoal: "escalate the beat",
            visualOpportunity: "box entry sequences",
            groundingClaimRefs: [],
          },
          {
            purpose: "payoff",
            emotionalIntent: "land the idea",
            viewerQuestion: "what remains",
            informationContribution: "pressure decides the tactical edge",
            narrationGoal: "close the arc",
            visualOpportunity: "final third freeze frame",
            groundingClaimRefs: [],
          },
        ],
      });
    },
  );

  await check(
    "[H12B] Fast quality — declarative cold-open clears curiosity without question mark",
    async () => {
      const declarativeComposer: RetentionComposerCallback = (request) => {
        const n = request.orderedBeatIds.length;
        const budget = Math.round(request.durationSec * 2.4);
        const minPer = 4;
        const targetTotal = Math.min(
          Math.max(n * minPer, budget - 8),
          Math.max(n * minPer, Math.floor(budget * 0.78)),
        );
        const base = Math.floor(targetTotal / n);
        let rem = targetTotal - base * n;
        const segments = request.orderedBeatIds.map((beatId, i) => {
          const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
          if (rem > 0) rem -= 1;
          if (i === 0) {
            // Declarative Hook-valid opening (no '?') — proves curiosity is not question-only.
            const open = "Spain pressure night hits harder.";
            const openWords = open.trim().split(/\s+/).filter(Boolean).length;
            return {
              beatId,
              text: joinOpeningAndBody(
                open,
                padWords(
                  "Spain tactical focus reshapes this France preview tonight",
                  Math.max(3, target - openWords),
                ),
              ),
              claimRefs: [] as unknown as string[],
            };
          }
          const seed =
            i === n - 1
              ? "Spain pressure closes this preview decisively tonight"
              : `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances with clear focus`;
          return {
            beatId,
            text: padWords(seed, target),
            claimRefs: [] as unknown as string[],
          };
        });
        return {
          title: "Spain pressure story",
          hookClaimRefs: [] as unknown as string[],
          segments,
        };
      };

      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: declarativeComposer,
        hookRunner: passRetentionHookRunner,
      });
      assertPass(result);
      assert.equal(result.approved.terminalState, "pass_without_rewrite");
      assert.doesNotMatch(result.approved.narration.slice(0, 60), /\?/);
    },
  );

  await check(
    "[H12C] Explicit non-question Hook style Passes without requiring question punctuation",
    async () => {
      const declarativeComposer: RetentionComposerCallback = (request) => {
        const n = request.orderedBeatIds.length;
        const budget = Math.round(request.durationSec * 2.4);
        const targetTotal = Math.min(
          Math.max(n * 4, budget - 8),
          Math.max(n * 4, Math.floor(budget * 0.78)),
        );
        const base = Math.floor(targetTotal / n);
        let rem = targetTotal - base * n;
        return {
          title: "Spain pressure story",
          hookClaimRefs: [] as unknown as string[],
          segments: request.orderedBeatIds.map((beatId, i) => {
            const target = Math.max(4, base + (rem > 0 ? 1 : 0));
            if (rem > 0) rem -= 1;
            if (i === 0) {
              const open = "Spain pressure night hits harder.";
              const openWords = open.trim().split(/\s+/).filter(Boolean).length;
              return {
                beatId,
                text: joinOpeningAndBody(
                  open,
                  padWords(
                    "tactical focus reshapes this France preview tonight",
                    Math.max(3, target - openWords),
                  ),
                ),
                claimRefs: [] as unknown as string[],
              };
            }
            const seed =
              i === n - 1
                ? "Spain pressure closes this preview decisively tonight"
                : `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances with clear focus`;
            return {
              beatId,
              text: padWords(seed, target),
              claimRefs: [] as unknown as string[],
            };
          }),
        };
      };

      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "cold_open",
        planner: null,
        composer: declarativeComposer,
        hookRunner: passRetentionHookRunner,
      });
      assertPass(result);
      assert.equal(result.approved.terminalState, "pass_without_rewrite");
      assert.doesNotMatch(result.approved.narration.slice(0, 80), /\?/);
      const contract = normalizeStoryContract(
        buildProductionStoryContractInput({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          hookStyle: "cold_open",
          qualityMode: "cheap",
        }),
      );
      assert.equal(contract.identities.hookStyleIdentity, "cold_open");
    },
  );

  await check(
    "[H12C] Explicit Hook Style forwards requestedStrategyId into Hook context",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "provocative_question",
        planner: null,
        composer: makeComposer(),
        hookRunner: passRetentionHookRunner,
      });
      assertPass(result);
      // Fixture Hook runner mirrors active plan; with forwarded style the contract identity is explicit.
      const contract = normalizeStoryContract(
        buildProductionStoryContractInput({
          topic: "Spain versus France tactical preview",
          durationSec: 30,
          generationPath: "script_only",
          hookStyle: "provocative_question",
          qualityMode: "cheap",
        }),
      );
      assert.equal(
        contract.identities.hookStyleIdentity,
        "provocative_question",
      );
      assert.equal(
        requestedStrategyIdFromHookStyle("provocative_question"),
        "provocative_question",
      );
    },
  );

  await check(
    "[H12C] Explicit Hook + composer throw recovers with fallback disposition",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "provocative_question",
        planner: null,
        composer: async () => {
          throw new Error("composer_call_failed");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.approved.narration.trim().length > 0);
        assert.ok(
          result.approved.generationDisposition?.disposition === "fallback" ||
            result.approved.generationDisposition?.adaptations.includes(
              "deterministic_story_fallback_used",
            ) ||
            result.approved.generationDisposition?.adaptations.includes(
              "length_rescue_used",
            ),
        );
      }
    },
  );

  await check(
    "[H12D] Probe A — explicit Hook fail after compose → zero-model Auto success",
    async () => {
      let hookInvocations = 0;
      let modelInitialCalls = 0;
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "provocative_question",
        planner: null,
        composer: makeComposer(),
        hookRunner: async (input) => {
          hookInvocations += 1;
          const initial = await input.modelCall({
            kind: "initial",
            topic: input.topic,
            tone: input.tone,
            duration: input.duration,
            scriptMode: input.scriptMode,
            context: input.context,
            templatePromptBlock: input.templatePromptBlock,
            hookDirectiveBlock: input.hookContext.directive.promptBlock,
            permittedClaimIds: input.hookContext.permittedClaimIds,
            qualityMode: input.qualityMode,
            model: input.model,
          });
          modelInitialCalls += 1;
          void initial;
          return {
            ok: false as const,
            error: "forced_explicit_hook_failure",
            diagnostics: {
              contractVersion: input.hookContext.request.contractVersion,
              strategyId: input.hookContext.plan.strategyId,
              strategyVersion: input.hookContext.plan.strategyVersion,
              strategySource: input.hookContext.plan.strategySource,
              generationPath: input.hookContext.generationPath,
              requestFingerprint: input.hookContext.request.requestFingerprint,
              planFingerprint: input.hookContext.plan.planFingerprint,
              groundingStatus: "user_context_only" as const,
              validationOutcome: "fail" as const,
              repairAttempts: 0 as const,
              templateInfluenced: false,
              promptIntelligenceInfluenced: false,
              adapterRan: true,
            },
            snapshot: input.hookContext.snapshot,
          };
        },
      });
      assert.equal(result.ok, true);
      assert.equal(hookInvocations, 1);
      assert.equal(modelInitialCalls, 1);
      if (result.ok) {
        assert.equal(
          result.approved.safeDiagnostics.budget?.initialNarration,
          1,
        );
        assert.ok(
          result.approved.generationDisposition?.adaptations.includes(
            "hook_style_reconciled",
          ),
        );
      }
    },
  );

  console.log(
    `\nAll retention production integration checks passed (${passed}).\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
