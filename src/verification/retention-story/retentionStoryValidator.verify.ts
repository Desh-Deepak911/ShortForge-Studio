/**
 * Sprint 10F / 10F.1 / 10F.1A / 10F.1B / 10F.1C — Retention Story validator authority.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  RETENTION_HARD_GATE_IDS,
  RetentionValidationError,
  assertRetentionHookBridgeReadyCoherence,
  assertRetentionModelCallLedgerSnapshotCoherence,
  assertRetentionValidationResultCoherence,
  buildRetentionNarrationCandidateFromProposal,
  buildRetentionValidationFingerprintFromResult,
  countRetentionNarrationWords,
  createRetentionModelCallLedger,
  matchesRetentionForbiddenIntroPattern,
  normalizeStoryContract,
  recordDeterministicOpeningReplacement,
  resolveRetentionModelCallBudgetPolicy,
  resolveRetentionReadinessThreshold,
  validateRetentionCompressionWordPolicy,
  validateRetentionStoryCandidate,
  type RetentionHookBridgeResult,
  type RetentionModelCallLedger,
  type RetentionModelCallLedgerSnapshot,
  type RetentionNarrationCandidate,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
  type RetentionValidationResult,
} from "@/features/retention-story";
import { evaluateRetentionHardGates } from "@/features/retention-story/validation/evaluate-retention-hard-gates";
import {
  getRetentionHeuristicRegistryVersion,
  scoreRetentionEditorialQuality,
} from "@/features/retention-story/validation/score-retention-editorial-quality";

import {
  SECTION_WORDS,
  coherentEnvelope,
  openingComposerProposal,
} from "./retentionStoryCoherentEnvelope";
import {
  buildTerminalHookAuthority,
  deriveSafeHookEnvelopeFromAuthority,
} from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";

const ROOT = path.resolve(__dirname, "../..");
const VALIDATION_ROOT = path.join(ROOT, "features/retention-story/validation");
const PUBLIC_INDEX = path.join(ROOT, "features/retention-story/index.ts");

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

/**
 * Append ready-path narration success onto a ledger.
 * Balanced/Studio prefer the shared planning ledger (planner already succeeded).
 * A fresh ledger without planner evidence synthesizes planner success only as a
 * last resort for cheap-default call sites that omit the envelope ledger.
 */
function applyDefaultReadyHistory(
  ledger: RetentionModelCallLedger,
  qualityMode: "cheap" | "balanced" | "best",
): void {
  const snap = ledger.snapshot();
  if (qualityMode !== "cheap" && snap.counts.planner === 0) {
    ledger.consume("planner");
    ledger.recordOutcome("planner", "succeeded");
  }
  if (ledger.snapshot().counts.initial_narration === 0) {
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "succeeded");
  }
}

/**
 * Build ready-bridge evidence from a real ledger history (not zero-count stubs).
 * Pass the envelope's shared planning ledger for Balanced/Studio so planner
 * attempted→succeeded is not synthesized on a narration-only ledger.
 */
function readyBridge(
  candidate: RetentionNarrationCandidate,
  plan: RetentionStoryPlan,
  qualityMode: "cheap" | "balanced" | "best" = "cheap",
  history?: (ledger: RetentionModelCallLedger) => void,
  sharedLedger?: RetentionModelCallLedger,
): RetentionHookBridgeResult {
  const ledger = sharedLedger ?? createRetentionModelCallLedger(qualityMode);
  if (history) history(ledger);
  else applyDefaultReadyHistory(ledger, qualityMode);
  const budget = ledger.snapshot();
  const composerAttempts =
    budget.counts.initial_narration +
    budget.counts.length_compression +
    budget.counts.hook_repair +
    budget.counts.hook_fallback;
  let terminalHookAuthority: ReturnType<typeof buildTerminalHookAuthority> | undefined;
  try {
    terminalHookAuthority = buildTerminalHookAuthority(
      candidate.assembledNarration,
    );
  } catch {
    // Hook-unapprovable fixture narration — omit authority so ready assert fails closed.
    terminalHookAuthority = undefined;
  }
  const safeHook = terminalHookAuthority
    ? deriveSafeHookEnvelopeFromAuthority(terminalHookAuthority)
    : null;
  const hasDeterministicRescue = budget.events.some(
    (e) =>
      e.category === "initial_narration" &&
      e.outcome === "skipped_deterministic",
  );
  return Object.freeze({
    status: "ready" as const,
    title: "Spain pressure story",
    approvedNarration: candidate.assembledNarration,
    candidate,
    diagnostics: Object.freeze({
      qualityMode,
      plannerAttempts: budget.counts.planner,
      composerAttempts,
      hookAdapterRan: true,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      compositionAuthority: hasDeterministicRescue
        ? ("deterministic_rescue" as const)
        : ("model_initial" as const),
    }),
    ...(terminalHookAuthority && safeHook
      ? {
          terminalHookAuthority,
          hookPlanSnapshot: safeHook.hookPlanSnapshot,
          hookDiagnostics: safeHook.hookDiagnostics,
        }
      : {}),
  }) as unknown as RetentionHookBridgeResult;
}

function emptyCounts() {
  return {
    planner: 0,
    initial_narration: 0,
    length_compression: 0,
    hook_repair: 0,
    hook_fallback: 0,
    retention_body_rewrite: 0,
    total: 0,
  };
}

function rebuildRemainingForTest(
  policy: ReturnType<typeof resolveRetentionModelCallBudgetPolicy>,
  counts: ReturnType<typeof emptyCounts>,
) {
  return {
    planner: policy.maxPlanner - counts.planner,
    initial_narration: policy.maxInitialNarration - counts.initial_narration,
    length_compression: policy.maxLengthCompression - counts.length_compression,
    hook_repair: policy.maxHookRepair - counts.hook_repair,
    hook_fallback: policy.maxHookFallback - counts.hook_fallback,
    retention_body_rewrite:
      policy.maxRetentionBodyRewrite - counts.retention_body_rewrite,
    total: policy.totalCeiling - counts.total,
  };
}

function padWords(base: string, target: number): string {
  return padSpokenWords(base, target);
}

function proposalWithTexts(
  plan: RetentionStoryPlan,
  texts: readonly string[],
  claimRefsByIndex: ReadonlyMap<number, readonly string[]> = new Map(),
) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, index) => ({
      beatId: beat.id,
      text: texts[index] ?? texts[texts.length - 1] ?? "Spain pressure advances.",
      claimRefs: [...(claimRefsByIndex.get(index) ?? [])],
    })),
  };
}

function fittingProposal(plan: RetentionStoryPlan) {
  const budget = plan.compressionGoals.targetWordBudget;
  const n = plan.beatPlan.beats.length;
  const minPer = 4;
  const targetTotal = Math.min(
    Math.max(n * minPer, budget - 8),
    Math.max(n * minPer, Math.floor(budget * 0.78)),
  );
  const base = Math.floor(targetTotal / n);
  let rem = targetTotal - base * n;
  const texts = plan.beatPlan.beats.map((_, i) => {
    const section = SECTION_WORDS[i] ?? "next";
    const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
    if (i === 0) {
      const open = "Why does Spain pressure matter?";
      const openWords = open.trim().split(/\s+/).filter(Boolean).length;
      const body = padWords(
        "Spain tactical focus reshapes this France preview tonight",
        Math.max(3, target - openWords),
      );
      return joinOpeningAndBody(open, body);
    }
    const seed =
      i === n - 1
        ? "Spain pressure closes this preview decisively tonight"
        : `Spain ${section} pressure advances with clear focus`;
    return padWords(seed, target);
  });
  return proposalWithTexts(plan, texts);
}

function buildFinalCandidate(
  plan: RetentionStoryPlan,
  grounding: Parameters<
    typeof buildRetentionNarrationCandidateFromProposal
  >[0]["grounding"],
  strategySeed: RetentionStrategySeed,
  proposal: ReturnType<typeof fittingProposal> = fittingProposal(plan),
): RetentionNarrationCandidate {
  return buildRetentionNarrationCandidateFromProposal({
    proposal,
    plan,
    grounding,
    strategySeed,
    origin: "after_hook_approval",
  }).candidate;
}

function expectValidationError(
  fn: () => unknown,
  reason: string,
): void {
  assert.throws(fn, (err: unknown) =>
    err instanceof RetentionValidationError && err.reason === reason,
  );
}

async function main(): Promise<void> {
  console.log("\nretention-story-validator (Sprint 10F.1C)\n");

  console.log("module ownership");
  await check("[M1] validation module ownership + public API boundaries", () => {
    const files = collectTsFiles(VALIDATION_ROOT);
    assert.ok(files.some((f) => f.endsWith("validate-retention-story-candidate.ts")));
    assert.ok(
      files.some((f) => f.endsWith("assert-retention-validation-result-coherence.ts")),
    );
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.equal(/generateHookedNarration|openai|anthropic/i.test(src), false);
      assert.equal(/enforceNarrationWordBudget|truncateNarration/i.test(src), false);
    }
    const publicApi = readFileSync(PUBLIC_INDEX, "utf8");
    assert.equal(publicApi.includes("evaluateRetentionHardGates"), false);
    assert.equal(publicApi.includes("assertRetentionValidationFingerprint"), false);
    assert.equal(publicApi.includes("buildCanonicalRetentionValidationResult"), false);
    assert.ok(publicApi.includes("assertRetentionValidationResultCoherence"));
    assert.ok(publicApi.includes("assertRetentionHookBridgeReadyCoherence"));
    assert.ok(publicApi.includes("assertRetentionModelCallLedgerSnapshotCoherence"));
  });

  console.log("negatives — result forgery / coherence");
  await check("[N1] changed editorial + recomputed fingerprint fails coherence", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");
    const forged = {
      ...outcome.validation,
      editorial: {
        ...outcome.validation.editorial,
        clarity: Math.min(1, outcome.validation.editorial.clarity + 0.2),
      },
    } as RetentionValidationResult;
    const withFp = {
      ...forged,
      validationFingerprint: buildRetentionValidationFingerprintFromResult(forged),
    };
    expectValidationError(
      () =>
        assertRetentionValidationResultCoherence({
          result: withFp,
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          hookBridge: bridge,
          candidate,
        }),
      "validation_coherence_mismatch",
    );
  });

  await check("[N2] changed readiness + recomputed fingerprint fails coherence", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");
    const forged = {
      ...outcome.validation,
      retentionReadiness: 0.99,
    } as RetentionValidationResult;
    const withFp = {
      ...forged,
      validationFingerprint: buildRetentionValidationFingerprintFromResult(forged),
    };
    expectValidationError(
      () =>
        assertRetentionValidationResultCoherence({
          result: withFp,
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          hookBridge: bridge,
          candidate,
        }),
      "validation_coherence_mismatch",
    );
  });

  await check("[N3] changed hard-gate + recomputed fingerprint fails coherence", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");
    const hardGates = outcome.validation.hardGates.map((g, i) =>
      i === 0 ? { ...g, passed: !g.passed, detail: "forged" } : g,
    );
    const forged = { ...outcome.validation, hardGates } as RetentionValidationResult;
    const withFp = {
      ...forged,
      validationFingerprint: buildRetentionValidationFingerprintFromResult(forged),
    };
    expectValidationError(
      () =>
        assertRetentionValidationResultCoherence({
          result: withFp,
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          hookBridge: bridge,
          candidate,
        }),
      "validation_coherence_mismatch",
    );
  });

  await check("[N4] changed ok/failureClass without fingerprint still fails", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");
    const forged = {
      ...outcome.validation,
      ok: !outcome.validation.ok,
      failureClass: "hard_gate" as const,
    };
    expectValidationError(
      () =>
        assertRetentionValidationResultCoherence({
          result: forged,
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          hookBridge: bridge,
          candidate,
        }),
      "validation_coherence_mismatch",
    );
  });

  await check("[N5] changed ok/failureClass with recomputed fingerprint fails", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");
    const forged = {
      ...outcome.validation,
      ok: false,
      failureClass: "quality_threshold" as const,
    };
    const withFp = {
      ...forged,
      validationFingerprint: buildRetentionValidationFingerprintFromResult(forged),
    };
    expectValidationError(
      () =>
        assertRetentionValidationResultCoherence({
          result: withFp,
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          hookBridge: bridge,
          candidate,
        }),
      "validation_coherence_mismatch",
    );
  });

  await check("[N6] forged aggregates / threshold / gate order / unknown fields", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "validated");
    if (outcome.status !== "validated") throw new Error("expected validated");

    const cases: RetentionValidationResult[] = [
      {
        ...outcome.validation,
        storyQualityConfidence: 0.11,
        validationFingerprint: "",
      },
      {
        ...outcome.validation,
        activeStrategyThreshold: 0.01,
        validationFingerprint: "",
      },
      {
        ...outcome.validation,
        hardGates: [...outcome.validation.hardGates].reverse(),
        validationFingerprint: "",
      },
      {
        ...outcome.validation,
        hardGates: outcome.validation.hardGates.slice(1),
        validationFingerprint: "",
      },
      {
        ...(outcome.validation as RetentionValidationResult & {
          extra?: string;
        }),
        extra: "nope",
      } as RetentionValidationResult,
    ];
    for (const forged of cases) {
      const withFp = {
        ...forged,
        validationFingerprint: buildRetentionValidationFingerprintFromResult({
          ...outcome.validation,
          ...forged,
          hardGates: forged.hardGates,
        } as RetentionValidationResult),
      };
      expectValidationError(
        () =>
          assertRetentionValidationResultCoherence({
            result: withFp,
            contract: env.contract,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
            plan: env.plan,
            hookBridge: bridge,
            candidate,
          }),
        "validation_coherence_mismatch",
      );
    }
  });

  console.log("negatives — Hook bridge");
  await check("[N7] nested bridge candidate narration changed with copied fingerprint", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const nested = {
      ...candidate,
      assembledNarration: `${candidate.assembledNarration}x`,
      // keep copied fingerprint — forged
      candidateFingerprint: candidate.candidateFingerprint,
    } as RetentionNarrationCandidate;
    const bridge = Object.freeze({
      ...readyBridge(candidate, env.plan),
      approvedNarration: candidate.assembledNarration,
      candidate: nested,
    });
    const outcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") throw new Error("expected failed");
    assert.equal(outcome.reason, "hook_bridge_not_approved");
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(bridge, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N8] nested offsets/refs/origin drift rejected", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const nested = {
      ...candidate,
      origin: "initial_compose",
      candidateFingerprint: candidate.candidateFingerprint,
    } as RetentionNarrationCandidate;
    const bridge = Object.freeze({
      ...readyBridge(candidate, env.plan),
      candidate: nested,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(bridge, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N9] approved narration matches external but not nested candidate", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const other = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(
        env.plan,
        env.plan.beatPlan.beats.map((_, i) =>
          padWords(`Spain alternate focus section ${SECTION_WORDS[i] ?? "next"}`, 5),
        ),
      ),
    );
    const bridge = Object.freeze({
      status: "ready" as const,
      title: "t",
      approvedNarration: candidate.assembledNarration,
      candidate: other,
      diagnostics: readyBridge(candidate, env.plan).diagnostics,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(bridge, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N10] bridge quality mode / budget policy / attempt counts", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const base = readyBridge(candidate, env.plan);
    const wrongMode = Object.freeze({
      ...base,
      diagnostics: Object.freeze({
        ...base.diagnostics,
        qualityMode: "balanced",
      }) as unknown as RetentionHookBridgeResult,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(wrongMode, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );

    const wrongAttempts = Object.freeze({
      ...base,
      diagnostics: Object.freeze({
        ...base.diagnostics,
        plannerAttempts: -1,
      }) as unknown as RetentionHookBridgeResult,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(wrongAttempts, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );

    const nanAttempts = Object.freeze({
      ...base,
      diagnostics: Object.freeze({
        ...base.diagnostics,
        composerAttempts: Number.NaN,
      }) as unknown as RetentionHookBridgeResult,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(nanAttempts, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N10A] demonstrated 999 ledger forgery rejected", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const policy = resolveRetentionModelCallBudgetPolicy("cheap");
    const forgedBudget = {
      version: 1 as const,
      qualityMode: "cheap" as const,
      policy,
      counts: {
        ...emptyCounts(),
        initial_narration: 999,
        total: 999,
      },
      remaining: {
        ...emptyCounts(),
        initial_narration: 999,
        total: 999,
      },
      events: [],
      exhausted: false,
    };
    assert.throws(
      () =>
        assertRetentionModelCallLedgerSnapshotCoherence(forgedBudget, "cheap", {
          requireClosed: true,
          requireSuccessfulInitialNarration: true,
          requireZeroRetentionBodyRewrite: true,
        }),
      (err: unknown) =>
        err instanceof Error &&
        "reason" in err &&
        (err as { reason: string }).reason === "model_call_ledger_invalid",
    );

    const bridge = Object.freeze({
      status: "ready" as const,
      title: "forged",
      approvedNarration: candidate.assembledNarration,
      candidate,
      diagnostics: Object.freeze({
        qualityMode: "cheap",
        plannerAttempts: 777,
        composerAttempts: 888,
        hookAdapterRan: true,
        budget: forgedBudget,
        outcome: "hook_approved" as const,
        planFingerprint: env.plan.planFingerprint,
        candidateFingerprint: candidate.candidateFingerprint,
      }) as unknown as RetentionHookBridgeResult,
    });
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(bridge, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N10B] ledger snapshot negatives — counts/remaining/events/diagnostics", async () => {
    const policy = resolveRetentionModelCallBudgetPolicy("cheap");
    const goodLedger = createRetentionModelCallLedger("cheap");
    goodLedger.consume("initial_narration");
    goodLedger.recordOutcome("initial_narration", "succeeded");
    const good = goodLedger.snapshot();

    const reject = (snap: unknown) => {
      assert.throws(
        () => assertRetentionModelCallLedgerSnapshotCoherence(snap, "cheap"),
        (err: unknown) =>
          err instanceof Error &&
          "reason" in err &&
          (err as { reason: string }).reason === "model_call_ledger_invalid",
      );
    };

    // Sprint 10H.3 — maxInitialNarration is 2; forge above the policy ceiling.
    reject({
      ...good,
      counts: { ...good.counts, initial_narration: 3, total: 3 },
      remaining: {
        ...good.remaining,
        initial_narration: policy.maxInitialNarration - 3,
        total: policy.totalCeiling - 3,
      },
    });
    reject({
      ...good,
      counts: { ...good.counts, total: 99 },
      remaining: { ...good.remaining, total: policy.totalCeiling - 99 },
    });
    // With maxInitialNarration=2 and one consume, remaining is already 1 — forge 0.
    reject({
      ...good,
      remaining: { ...good.remaining, initial_narration: 0 },
    });
    reject({
      ...good,
      remaining: { ...good.remaining, total: policy.totalCeiling },
    });
    reject({ ...good, exhausted: true });

    reject({
      ...good,
      counts: { ...good.counts, planner: Number.NaN },
    });
    reject({
      ...good,
      counts: { ...good.counts, planner: -1 },
      remaining: { ...good.remaining, planner: policy.maxPlanner + 1 },
    });
    reject({ ...good, extra: true });
    reject({ ...good, policy: { ...good.policy, extra: true } });
    reject({
      ...good,
      counts: { ...good.counts, extra: 1 },
    });
    reject({
      ...good,
      events: [{ ...good.events[0]!, extra: true }],
    });
    reject({
      ...good,
      counts: {
        ...emptyCounts(),
        initial_narration: 1,
        total: 1,
      },
      remaining: rebuildRemainingForTest(policy, {
        ...emptyCounts(),
        initial_narration: 1,
        total: 1,
      }) as unknown as RetentionHookBridgeResult,
      events: [],
    });
    reject({
      ...good,
      events: [{ category: "initial_narration", outcome: "attempted", sequence: 1 }],
      counts: emptyCounts(),
      remaining: rebuildRemainingForTest(policy, emptyCounts()),
      exhausted: false,
    });
    reject({
      ...good,
      events: [
        { category: "initial_narration", outcome: "succeeded", sequence: 1 },
      ],
      counts: emptyCounts(),
      remaining: rebuildRemainingForTest(policy, emptyCounts()),
    });
    reject({
      ...good,
      events: [
        { category: "initial_narration", outcome: "attempted", sequence: 1 },
        { category: "hook_repair", outcome: "succeeded", sequence: 2 },
      ],
      counts: {
        ...emptyCounts(),
        initial_narration: 1,
        total: 1,
      },
      remaining: rebuildRemainingForTest(policy, {
        ...emptyCounts(),
        initial_narration: 1,
        total: 1,
      }) as unknown as RetentionHookBridgeResult,
    });
    reject({
      ...good,
      events: [
        { category: "initial_narration", outcome: "attempted", sequence: 1 },
        { category: "length_compression", outcome: "attempted", sequence: 2 },
        { category: "initial_narration", outcome: "succeeded", sequence: 3 },
      ],
      counts: {
        ...emptyCounts(),
        initial_narration: 1,
        length_compression: 1,
        total: 2,
      },
      remaining: rebuildRemainingForTest(policy, {
        ...emptyCounts(),
        initial_narration: 1,
        length_compression: 1,
        total: 2,
      }),
    });
    reject({
      ...good,
      events: [
        { category: "initial_narration", outcome: "attempted", sequence: 1 },
        { category: "initial_narration", outcome: "succeeded", sequence: 3 },
      ],
    });
    reject({
      ...good,
      events: [
        {
          category: "unknown_category",
          outcome: "attempted",
          sequence: 1,
        },
      ],
      counts: emptyCounts(),
      remaining: rebuildRemainingForTest(policy, emptyCounts()),
    });
    // Sprint 10H.3A — skipped_deterministic on initial_narration is valid
    // (deterministic rescue). Reject it on an unsupported category instead.
    reject({
      ...good,
      events: [
        ...good.events,
        {
          category: "planner",
          outcome: "skipped_deterministic",
          sequence: 3,
        },
      ],
    });
    // Valid: model success followed by zero-cost deterministic rescue marker.
    assert.doesNotThrow(() =>
      assertRetentionModelCallLedgerSnapshotCoherence(
        {
          ...good,
          events: [
            ...good.events,
            {
              category: "initial_narration",
              outcome: "skipped_deterministic",
              sequence: 3,
            },
          ],
        },
        "cheap",
        { requireClosed: true, requireSuccessfulInitialNarration: true },
      ),
    );

    // Ready-bridge: zero initial narration / nonzero rewrite
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const zeroInitial = createRetentionModelCallLedger("cheap").snapshot();
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(
          Object.freeze({
            status: "ready",
            title: "t",
            approvedNarration: candidate.assembledNarration,
            candidate,
            diagnostics: Object.freeze({
              qualityMode: "cheap",
              plannerAttempts: 0,
              composerAttempts: 0,
              hookAdapterRan: true,
              budget: zeroInitial,
              outcome: "hook_approved",
              planFingerprint: env.plan.planFingerprint,
              candidateFingerprint: candidate.candidateFingerprint,
            }),
          }),
          {
            contract: env.contract,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
            plan: env.plan,
            candidate,
          },
        ),
      "hook_bridge_coherence_mismatch",
    );

    const rewriteLedger = createRetentionModelCallLedger("best");
    rewriteLedger.consume("planner");
    rewriteLedger.recordOutcome("planner", "succeeded");
    rewriteLedger.consume("initial_narration");
    rewriteLedger.recordOutcome("initial_narration", "succeeded");
    rewriteLedger.consume("retention_body_rewrite");
    rewriteLedger.recordOutcome("retention_body_rewrite", "succeeded");
    const studioEnv = await coherentEnvelope("best");
    const studioCandidate = buildFinalCandidate(
      studioEnv.plan,
      studioEnv.grounding,
      studioEnv.strategySeed,
    );
    const rewriteSnap = rewriteLedger.snapshot();
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(
          Object.freeze({
            status: "ready",
            title: "t",
            approvedNarration: studioCandidate.assembledNarration,
            candidate: studioCandidate,
            diagnostics: Object.freeze({
              qualityMode: "best",
              plannerAttempts: rewriteSnap.counts.planner,
              composerAttempts:
                rewriteSnap.counts.initial_narration +
                rewriteSnap.counts.length_compression +
                rewriteSnap.counts.hook_repair +
                rewriteSnap.counts.hook_fallback,
              hookAdapterRan: true,
              budget: rewriteSnap,
              outcome: "hook_approved",
              planFingerprint: studioEnv.plan.planFingerprint,
              candidateFingerprint: studioCandidate.candidateFingerprint,
            }),
          }),
          {
            contract: studioEnv.contract,
            grounding: studioEnv.grounding,
            strategySeed: studioEnv.strategySeed,
            plan: studioEnv.plan,
            candidate: studioCandidate,
          },
        ),
      "hook_bridge_coherence_mismatch",
    );

    // Diagnostics disagree with coherent snapshot counts
    const base = readyBridge(candidate, env.plan);
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(
          Object.freeze({
            ...base,
            diagnostics: Object.freeze({
              ...base.diagnostics,
              plannerAttempts: 1,
            }),
          }),
          {
            contract: env.contract,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
            plan: env.plan,
            candidate,
          },
        ),
      "hook_bridge_coherence_mismatch",
    );
    expectValidationError(
      () =>
        assertRetentionHookBridgeReadyCoherence(
          Object.freeze({
            ...base,
            diagnostics: Object.freeze({
              ...base.diagnostics,
              composerAttempts: 99,
            }),
          }),
          {
            contract: env.contract,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
            plan: env.plan,
            candidate,
          },
        ),
      "hook_bridge_coherence_mismatch",
    );
  });

  await check("[N10C] ready planner-evidence — zero/failed/mismatched planner", async () => {
    type BridgeCtx = {
      contract: Awaited<ReturnType<typeof coherentEnvelope>>["contract"];
      grounding: Awaited<ReturnType<typeof coherentEnvelope>>["grounding"];
      strategySeed: RetentionStrategySeed;
      plan: RetentionStoryPlan;
      candidate: RetentionNarrationCandidate;
    };

    const rejectBridge = (bridge: RetentionHookBridgeResult, ctx: BridgeCtx) => {
      expectValidationError(
        () => assertRetentionHookBridgeReadyCoherence(bridge, ctx),
        "hook_bridge_coherence_mismatch",
      );
    };
    const acceptBridge = (bridge: RetentionHookBridgeResult, ctx: BridgeCtx) => {
      assert.doesNotThrow(() =>
        assertRetentionHookBridgeReadyCoherence(bridge, ctx),
      );
    };

    const envBalanced = await coherentEnvelope("balanced");
    const balancedCandidate = buildFinalCandidate(
      envBalanced.plan,
      envBalanced.grounding,
      envBalanced.strategySeed,
    );
    const balancedCtx: BridgeCtx = {
      contract: envBalanced.contract,
      grounding: envBalanced.grounding,
      strategySeed: envBalanced.strategySeed,
      plan: envBalanced.plan,
      candidate: balancedCandidate,
    };

    const envStudio = await coherentEnvelope("best");
    const studioCandidate = buildFinalCandidate(
      envStudio.plan,
      envStudio.grounding,
      envStudio.strategySeed,
    );
    const studioCtx: BridgeCtx = {
      contract: envStudio.contract,
      grounding: envStudio.grounding,
      strategySeed: envStudio.strategySeed,
      plan: envStudio.plan,
      candidate: studioCandidate,
    };

    const envFast = await coherentEnvelope("cheap");
    const fastCandidate = buildFinalCandidate(
      envFast.plan,
      envFast.grounding,
      envFast.strategySeed,
    );
    const fastCtx: BridgeCtx = {
      contract: envFast.contract,
      grounding: envFast.grounding,
      strategySeed: envFast.strategySeed,
      plan: envFast.plan,
      candidate: fastCandidate,
    };

    const bridgeFromLedger = (
      candidate: RetentionNarrationCandidate,
      plan: RetentionStoryPlan,
      qualityMode: "cheap" | "balanced" | "best",
      ledger: RetentionModelCallLedger,
      diagnosticsOverrides: Partial<{
        plannerAttempts: number;
        composerAttempts: number;
      }> = {},
    ): RetentionHookBridgeResult => {
      const budget = ledger.snapshot();
      const composerAttempts =
        budget.counts.initial_narration +
        budget.counts.length_compression +
        budget.counts.hook_repair +
        budget.counts.hook_fallback;
      const terminalHookAuthority = buildTerminalHookAuthority(
        candidate.assembledNarration,
      );
      const safeHook = deriveSafeHookEnvelopeFromAuthority(terminalHookAuthority);
      const hasDeterministicRescue = budget.events.some(
        (e) =>
          e.category === "initial_narration" &&
          e.outcome === "skipped_deterministic",
      );
      return Object.freeze({
        status: "ready" as const,
        title: "Spain pressure story",
        approvedNarration: candidate.assembledNarration,
        candidate,
        diagnostics: Object.freeze({
          qualityMode,
          plannerAttempts:
            diagnosticsOverrides.plannerAttempts ?? budget.counts.planner,
          composerAttempts:
            diagnosticsOverrides.composerAttempts ?? composerAttempts,
          hookAdapterRan: true,
          budget,
          outcome: "hook_approved" as const,
          planFingerprint: plan.planFingerprint,
          candidateFingerprint: candidate.candidateFingerprint,
          compositionAuthority: hasDeterministicRescue
            ? ("deterministic_rescue" as const)
            : ("model_initial" as const),
        }),
        terminalHookAuthority,
        hookPlanSnapshot: safeHook.hookPlanSnapshot,
        hookDiagnostics: safeHook.hookDiagnostics,
      });
    };

    // Sprint 10H.3 — planner is advisory: zero / failed / malformed planner
    // still allows a ready bridge when composition + Hook succeed.
    const balancedZeroPlanner = createRetentionModelCallLedger("balanced");
    balancedZeroPlanner.consume("initial_narration");
    balancedZeroPlanner.recordOutcome("initial_narration", "succeeded");
    acceptBridge(
      bridgeFromLedger(
        balancedCandidate,
        envBalanced.plan,
        "balanced",
        balancedZeroPlanner,
      ),
      balancedCtx,
    );

    const studioZeroPlanner = createRetentionModelCallLedger("best");
    studioZeroPlanner.consume("initial_narration");
    studioZeroPlanner.recordOutcome("initial_narration", "succeeded");
    acceptBridge(
      bridgeFromLedger(
        studioCandidate,
        envStudio.plan,
        "best",
        studioZeroPlanner,
      ),
      studioCtx,
    );

    const balancedFailed = createRetentionModelCallLedger("balanced");
    balancedFailed.consume("planner");
    balancedFailed.recordOutcome("planner", "failed");
    balancedFailed.consume("initial_narration");
    balancedFailed.recordOutcome("initial_narration", "succeeded");
    acceptBridge(
      bridgeFromLedger(
        balancedCandidate,
        envBalanced.plan,
        "balanced",
        balancedFailed,
      ),
      balancedCtx,
    );

    const studioMalformed = createRetentionModelCallLedger("best");
    studioMalformed.consume("planner");
    studioMalformed.recordOutcome("planner", "malformed");
    studioMalformed.consume("initial_narration");
    studioMalformed.recordOutcome("initial_narration", "succeeded");
    acceptBridge(
      bridgeFromLedger(
        studioCandidate,
        envStudio.plan,
        "best",
        studioMalformed,
      ),
      studioCtx,
    );

    // planner count 1 but no planner events
    const balancedPolicy = resolveRetentionModelCallBudgetPolicy("balanced");
    const forgedCountNoEvents = {
      version: 1 as const,
      qualityMode: "balanced" as const,
      policy: balancedPolicy,
      counts: {
        ...emptyCounts(),
        planner: 1,
        initial_narration: 1,
        total: 2,
      },
      remaining: rebuildRemainingForTest(balancedPolicy, {
        ...emptyCounts(),
        planner: 1,
        initial_narration: 1,
        total: 2,
      }),
      events: [
        {
          category: "initial_narration" as const,
          outcome: "attempted" as const,
          sequence: 1,
        },
        {
          category: "initial_narration" as const,
          outcome: "succeeded" as const,
          sequence: 2,
        },
      ],
      exhausted: false,
    };
    rejectBridge(
      Object.freeze({
        status: "ready" as const,
        title: "t",
        approvedNarration: balancedCandidate.assembledNarration,
        candidate: balancedCandidate,
        diagnostics: Object.freeze({
          qualityMode: "balanced" as const,
          plannerAttempts: 1,
          composerAttempts: 1,
          hookAdapterRan: true,
          budget: forgedCountNoEvents,
          outcome: "hook_approved" as const,
          planFingerprint: envBalanced.plan.planFingerprint,
          candidateFingerprint: balancedCandidate.candidateFingerprint,
        }),
      }) as unknown as RetentionHookBridgeResult,
      balancedCtx,
    );

    // planner events present but diagnostics says 0
    const balancedOk = createRetentionModelCallLedger("balanced");
    balancedOk.consume("planner");
    balancedOk.recordOutcome("planner", "succeeded");
    balancedOk.consume("initial_narration");
    balancedOk.recordOutcome("initial_narration", "succeeded");
    rejectBridge(
      bridgeFromLedger(
        balancedCandidate,
        envBalanced.plan,
        "balanced",
        balancedOk,
        { plannerAttempts: 0 },
      ),
      balancedCtx,
    );

    // planner succeeded event with count mismatch
    const mismatchSnap = balancedOk.snapshot();
    rejectBridge(
      Object.freeze({
        status: "ready" as const,
        title: "t",
        approvedNarration: balancedCandidate.assembledNarration,
        candidate: balancedCandidate,
        diagnostics: Object.freeze({
          qualityMode: "balanced" as const,
          plannerAttempts: 0,
          composerAttempts: 1,
          hookAdapterRan: true,
          budget: {
            ...mismatchSnap,
            counts: { ...mismatchSnap.counts, planner: 0, total: 1 },
            remaining: rebuildRemainingForTest(balancedPolicy, {
              ...emptyCounts(),
              planner: 0,
              initial_narration: 1,
              total: 1,
            }),
          },
          outcome: "hook_approved" as const,
          planFingerprint: envBalanced.plan.planFingerprint,
          candidateFingerprint: balancedCandidate.candidateFingerprint,
        }),
      }) as unknown as RetentionHookBridgeResult,
      balancedCtx,
    );

    // Fast with any planner event (forged — cheap policy forbids planner count > 0)
    const fastPolicy = resolveRetentionModelCallBudgetPolicy("cheap");
    const fastWithPlanner = {
      version: 1 as const,
      qualityMode: "cheap" as const,
      policy: fastPolicy,
      counts: {
        ...emptyCounts(),
        planner: 1,
        initial_narration: 1,
        total: 2,
      },
      remaining: rebuildRemainingForTest(fastPolicy, {
        ...emptyCounts(),
        planner: 1,
        initial_narration: 1,
        total: 2,
      }),
      events: [
        {
          category: "planner" as const,
          outcome: "attempted" as const,
          sequence: 1,
        },
        {
          category: "planner" as const,
          outcome: "succeeded" as const,
          sequence: 2,
        },
        {
          category: "initial_narration" as const,
          outcome: "attempted" as const,
          sequence: 3,
        },
        {
          category: "initial_narration" as const,
          outcome: "succeeded" as const,
          sequence: 4,
        },
      ],
      exhausted: false,
    };
    rejectBridge(
      Object.freeze({
        status: "ready" as const,
        title: "t",
        approvedNarration: fastCandidate.assembledNarration,
        candidate: fastCandidate,
        diagnostics: Object.freeze({
          qualityMode: "cheap" as const,
          plannerAttempts: 1,
          composerAttempts: 1,
          hookAdapterRan: true,
          budget: fastWithPlanner,
          outcome: "hook_approved" as const,
          planFingerprint: envFast.plan.planFingerprint,
          candidateFingerprint: fastCandidate.candidateFingerprint,
        }),
      }) as unknown as RetentionHookBridgeResult,
      fastCtx,
    );
  });

  await check("[N10D] ready ledger phase-order — reversed / early later-phase", async () => {
    type BridgeCtx = {
      contract: Awaited<ReturnType<typeof coherentEnvelope>>["contract"];
      grounding: Awaited<ReturnType<typeof coherentEnvelope>>["grounding"];
      strategySeed: RetentionStrategySeed;
      plan: RetentionStoryPlan;
      candidate: RetentionNarrationCandidate;
    };

    const rejectBridge = (bridge: RetentionHookBridgeResult, ctx: BridgeCtx) => {
      expectValidationError(
        () => assertRetentionHookBridgeReadyCoherence(bridge, ctx),
        "hook_bridge_coherence_mismatch",
      );
    };

    const forgeBridge = (
      ctx: BridgeCtx,
      qualityMode: "cheap" | "balanced" | "best",
      counts: ReturnType<typeof emptyCounts>,
      events: RetentionModelCallLedgerSnapshot["events"],
      options: { readonly requireSnapshotOk?: boolean } = {},
    ): RetentionHookBridgeResult => {
      const policy = resolveRetentionModelCallBudgetPolicy(qualityMode);
      const budget = {
        version: 1 as const,
        qualityMode,
        policy,
        counts,
        remaining: rebuildRemainingForTest(policy, counts),
        events,
        exhausted: counts.total >= policy.totalCeiling,
      };
      if (options.requireSnapshotOk !== false) {
        // Chronology-only failures must remain snapshot-valid.
        assertRetentionModelCallLedgerSnapshotCoherence(budget, qualityMode, {
          requireClosed: true,
          requireSuccessfulInitialNarration: true,
          requireZeroRetentionBodyRewrite: true,
        });
      }
      const terminalHookAuthority = buildTerminalHookAuthority(
        ctx.candidate.assembledNarration,
      );
      const safeHook = deriveSafeHookEnvelopeFromAuthority(terminalHookAuthority);
      const hasDeterministicRescue = events.some(
        (e) =>
          e.category === "initial_narration" &&
          e.outcome === "skipped_deterministic",
      );
      return Object.freeze({
        status: "ready" as const,
        title: "Spain pressure story",
        approvedNarration: ctx.candidate.assembledNarration,
        candidate: ctx.candidate,
        diagnostics: Object.freeze({
          qualityMode,
          plannerAttempts: counts.planner,
          composerAttempts:
            counts.initial_narration +
            counts.length_compression +
            counts.hook_repair +
            counts.hook_fallback,
          hookAdapterRan: true,
          budget,
          outcome: "hook_approved" as const,
          planFingerprint: ctx.plan.planFingerprint,
          candidateFingerprint: ctx.candidate.candidateFingerprint,
          compositionAuthority: hasDeterministicRescue
            ? ("deterministic_rescue" as const)
            : ("model_initial" as const),
        }),
        terminalHookAuthority,
        hookPlanSnapshot: safeHook.hookPlanSnapshot,
        hookDiagnostics: safeHook.hookDiagnostics,
      });
    };

    const envBalanced = await coherentEnvelope("balanced");
    const balancedCandidate = buildFinalCandidate(
      envBalanced.plan,
      envBalanced.grounding,
      envBalanced.strategySeed,
    );
    const balancedCtx: BridgeCtx = {
      contract: envBalanced.contract,
      grounding: envBalanced.grounding,
      strategySeed: envBalanced.strategySeed,
      plan: envBalanced.plan,
      candidate: balancedCandidate,
    };

    const envStudio = await coherentEnvelope("best");
    const studioCandidate = buildFinalCandidate(
      envStudio.plan,
      envStudio.grounding,
      envStudio.strategySeed,
    );
    const studioCtx: BridgeCtx = {
      contract: envStudio.contract,
      grounding: envStudio.grounding,
      strategySeed: envStudio.strategySeed,
      plan: envStudio.plan,
      candidate: studioCandidate,
    };

    const envFast = await coherentEnvelope("cheap");
    const fastCandidate = buildFinalCandidate(
      envFast.plan,
      envFast.grounding,
      envFast.strategySeed,
    );
    const fastCtx: BridgeCtx = {
      contract: envFast.contract,
      grounding: envFast.grounding,
      strategySeed: envFast.strategySeed,
      plan: envFast.plan,
      candidate: fastCandidate,
    };

    const baseTwo = {
      ...emptyCounts(),
      planner: 1,
      initial_narration: 1,
      total: 2,
    };

    // Demonstrated failure: narration before planner
    rejectBridge(
      forgeBridge(balancedCtx, "balanced", baseTwo, [
        { category: "initial_narration", outcome: "attempted", sequence: 1 },
        { category: "initial_narration", outcome: "succeeded", sequence: 2 },
        { category: "planner", outcome: "attempted", sequence: 3 },
        { category: "planner", outcome: "succeeded", sequence: 4 },
      ]),
      balancedCtx,
    );
    rejectBridge(
      forgeBridge(studioCtx, "best", baseTwo, [
        { category: "initial_narration", outcome: "attempted", sequence: 1 },
        { category: "initial_narration", outcome: "succeeded", sequence: 2 },
        { category: "planner", outcome: "attempted", sequence: 3 },
        { category: "planner", outcome: "succeeded", sequence: 4 },
      ]),
      studioCtx,
    );

    // Planner succeeds between initial attempt and terminal (also invalid pairing)
    rejectBridge(
      forgeBridge(
        balancedCtx,
        "balanced",
        baseTwo,
        [
          { category: "planner", outcome: "attempted", sequence: 1 },
          { category: "initial_narration", outcome: "attempted", sequence: 2 },
          { category: "planner", outcome: "succeeded", sequence: 3 },
          { category: "initial_narration", outcome: "succeeded", sequence: 4 },
        ],
        { requireSnapshotOk: false },
      ),
      balancedCtx,
    );

    const withCompression = {
      ...emptyCounts(),
      planner: 1,
      initial_narration: 1,
      length_compression: 1,
      total: 3,
    };
    rejectBridge(
      forgeBridge(balancedCtx, "balanced", withCompression, [
        { category: "planner", outcome: "attempted", sequence: 1 },
        { category: "planner", outcome: "succeeded", sequence: 2 },
        { category: "length_compression", outcome: "attempted", sequence: 3 },
        { category: "length_compression", outcome: "succeeded", sequence: 4 },
        { category: "initial_narration", outcome: "attempted", sequence: 5 },
        { category: "initial_narration", outcome: "succeeded", sequence: 6 },
      ]),
      balancedCtx,
    );

    const withRepair = {
      ...emptyCounts(),
      planner: 1,
      initial_narration: 1,
      hook_repair: 1,
      total: 3,
    };
    rejectBridge(
      forgeBridge(studioCtx, "best", withRepair, [
        { category: "planner", outcome: "attempted", sequence: 1 },
        { category: "planner", outcome: "succeeded", sequence: 2 },
        { category: "hook_repair", outcome: "attempted", sequence: 3 },
        { category: "hook_repair", outcome: "succeeded", sequence: 4 },
        { category: "initial_narration", outcome: "attempted", sequence: 5 },
        { category: "initial_narration", outcome: "succeeded", sequence: 6 },
      ]),
      studioCtx,
    );

    const withFallback = {
      ...emptyCounts(),
      planner: 1,
      initial_narration: 1,
      hook_fallback: 1,
      total: 3,
    };
    rejectBridge(
      forgeBridge(balancedCtx, "balanced", withFallback, [
        { category: "planner", outcome: "attempted", sequence: 1 },
        { category: "planner", outcome: "succeeded", sequence: 2 },
        { category: "hook_fallback", outcome: "attempted", sequence: 3 },
        { category: "hook_fallback", outcome: "succeeded", sequence: 4 },
        { category: "initial_narration", outcome: "attempted", sequence: 5 },
        { category: "initial_narration", outcome: "succeeded", sequence: 6 },
      ]),
      balancedCtx,
    );

    // Deterministic marker before initial success
    rejectBridge(
      forgeBridge(balancedCtx, "balanced", baseTwo, [
        { category: "planner", outcome: "attempted", sequence: 1 },
        { category: "planner", outcome: "succeeded", sequence: 2 },
        {
          category: "hook_fallback",
          outcome: "skipped_deterministic",
          sequence: 3,
        },
        { category: "initial_narration", outcome: "attempted", sequence: 4 },
        { category: "initial_narration", outcome: "succeeded", sequence: 5 },
      ]),
      balancedCtx,
    );

    // Fast with any event before initial attempt
    const fastEarlyCompression = {
      ...emptyCounts(),
      initial_narration: 1,
      length_compression: 1,
      total: 2,
    };
    rejectBridge(
      forgeBridge(fastCtx, "cheap", fastEarlyCompression, [
        { category: "length_compression", outcome: "attempted", sequence: 1 },
        { category: "length_compression", outcome: "succeeded", sequence: 2 },
        { category: "initial_narration", outcome: "attempted", sequence: 3 },
        { category: "initial_narration", outcome: "succeeded", sequence: 4 },
      ]),
      fastCtx,
    );
  });

  console.log("negatives — gates / scenes-only");
  await check("[N11] payoff setup not immediately before deliver / multiple setups", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    assert.equal(env.contract.constraints.requirePayoff, true);

    const earlySetup = env.plan.beatPlan.beats.map((b, i, arr) => {
      if (i === 0) return { ...b, payoffRelation: "setup" as const };
      if (i === arr.length - 1) return { ...b, payoffRelation: "deliver" as const };
      if (i === arr.length - 2) return { ...b, payoffRelation: "none" as const };
      return { ...b, payoffRelation: "none" as const };
    });
    const multiSetup = env.plan.beatPlan.beats.map((b, i, arr) => {
      if (i === arr.length - 1) return { ...b, payoffRelation: "deliver" as const };
      if (i === arr.length - 2 || i === arr.length - 3) {
        return { ...b, payoffRelation: "setup" as const };
      }
      return { ...b, payoffRelation: "none" as const };
    });

    for (const beats of [earlySetup, multiSetup]) {
      const forgedPlan = {
        ...env.plan,
        beatPlan: { ...env.plan.beatPlan, beats },
      } as RetentionStoryPlan;
      const gates = evaluateRetentionHardGates({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: forgedPlan,
        candidate,
        hookBridge: bridge,
      });
      assert.equal(
        gates.find((g) => g.id === "required_payoff_beat_present")?.passed,
        false,
      );
    }
  });

  await check("[N12] scenes-only with contract alone does not throw", async () => {
    const scenesContract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "scenes_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "cheap",
    });
    const trapping: Record<string, unknown> = { contract: scenesContract };
    for (const key of [
      "grounding",
      "strategySeed",
      "plan",
      "hookBridge",
      "candidate",
    ]) {
      Object.defineProperty(trapping, key, {
        enumerable: true,
        configurable: true,
        get() {
          throw new Error(`unexpected_access:${key}`);
        },
      });
    }
    const outcome = validateRetentionStoryCandidate(
      trapping as Parameters<typeof validateRetentionStoryCandidate>[0],
    );
    assert.equal(outcome.status, "skipped");
    if (outcome.status !== "skipped") throw new Error("expected skipped");
    assert.equal(outcome.diagnostics.terminalState, "skipped");
    assert.equal(outcome.diagnostics.planFingerprint, null);
    assert.equal(outcome.diagnostics.candidateFingerprint, null);
    assert.equal(outcome.diagnostics.validationFingerprint, null);
  });

  await check("[N13] stale pre-Hook / forged bridge / one-char mutation", async () => {
    const env = await coherentEnvelope("cheap");
    const stale = buildRetentionNarrationCandidateFromProposal({
      proposal: openingComposerProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    }).candidate;
    const final = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    assert.equal(
      validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: readyBridge(final, env.plan),
        candidate: stale,
      }).status,
      "failed",
    );

    const candidate = final;
    const forgedReady = Object.freeze({
      ...readyBridge(candidate, env.plan),
      diagnostics: Object.freeze({
        ...readyBridge(candidate, env.plan).diagnostics,
        hookAdapterRan: false,
      }),
    });
    assert.equal(
      validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: forgedReady,
        candidate,
      }).status,
      "failed",
    );

    const mutated = Object.freeze({
      ...readyBridge(candidate, env.plan),
      approvedNarration: `${candidate.assembledNarration}x`,
    });
    assert.equal(
      validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: mutated,
        candidate,
      }).status,
      "failed",
    );
  });

  await check("[N14] structural hard-gate isolation via internal evaluator", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const emptySeg = {
      ...candidate,
      segments: candidate.segments.map((s, i) =>
        i === 0 ? { ...s, text: "" } : s,
      ),
    } as RetentionNarrationCandidate;
    assert.equal(
      evaluateRetentionHardGates({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        candidate: emptySeg,
        hookBridge: bridge,
      }).find((g) => g.id === "no_empty_segment")?.passed,
      false,
    );
  });

  await check("[N15] over-budget / forbidden intro / quality threshold", async () => {
    const env = await coherentEnvelope("cheap");
    const budget = env.plan.compressionGoals.targetWordBudget;
    const per = Math.ceil((budget + 20) / env.plan.beatPlan.beats.length);
    const over = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(
        env.plan,
        env.plan.beatPlan.beats.map((_, i) =>
          i === 0
            ? (() => {
                const open = "Why does Spain pressure matter?";
                const body = padWords(
                  "Spain tactical body keeps rising with clear spoken focus",
                  Math.max(8, per - 5),
                );
                return `${open} ${body}`;
              })()
            : padWords(
                `Spain pressure rising section ${SECTION_WORDS[i] ?? "next"}`,
                per,
              ),
        ),
      ),
    );
    const overOutcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: readyBridge(over, env.plan),
      candidate: over,
    });
    assert.equal(overOutcome.status, "validated");
    if (overOutcome.status !== "validated") throw new Error("expected validated");
    assert.equal(overOutcome.validation.failureClass, "hard_gate");
    assert.equal(
      validateRetentionCompressionWordPolicy({
        contract: env.contract,
        plan: env.plan,
        candidate: over,
      }).passed,
      false,
    );

    const introTexts = env.plan.beatPlan.beats.map((_, i) =>
      i === 0
        ? "In the world of Spain pressure the contest shifts hard tonight."
        : "Spain advances with clear spoken focus through the next stretch.",
    );
    const intro = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(env.plan, introTexts),
    );
    assert.equal(
      matchesRetentionForbiddenIntroPattern(intro.segments[0]!.text),
      true,
    );
    // Forbidden-intro openings are Hook-unapprovable; ready authority fails closed.
    const introOutcome = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: readyBridge(intro, env.plan),
      candidate: intro,
    });
    assert.equal(introOutcome.status, "failed");
    if (introOutcome.status !== "failed") throw new Error("expected failed");
    assert.equal(introOutcome.reason, "hook_bridge_not_approved");
    // Lexical forbidden-intro gate is evaluated against candidate opening text.
    const fitting = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const fittingBridge = readyBridge(fitting, env.plan);
    if (fittingBridge.status !== "ready") {
      throw new Error("expected ready Hook bridge");
    }
    assert.equal(
      evaluateRetentionHardGates({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        candidate: intro,
        hookBridge: {
          status: "ready" as const,
          title: "t",
          approvedNarration: intro.assembledNarration,
          candidate: intro,
          diagnostics: fittingBridge.diagnostics,
          hookPlanSnapshot: fittingBridge.hookPlanSnapshot!,
          hookDiagnostics: fittingBridge.hookDiagnostics!,
          terminalHookAuthority: fittingBridge.terminalHookAuthority!,
        },
      }).find((g) => g.id === "lexical_forbidden_intro_pattern")?.passed,
      false,
    );

    const std = await coherentEnvelope("cheap", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const weak = buildFinalCandidate(
      std.plan,
      std.grounding,
      std.strategySeed,
      proposalWithTexts(
        std.plan,
        std.plan.beatPlan.beats.map((_, i) =>
          i === 0 ? "Why does Spain pressure matter?" : "Pressure keeps rising.",
        ),
      ),
    );
    const weakOutcome = validateRetentionStoryCandidate({
      contract: std.contract,
      grounding: std.grounding,
      strategySeed: std.strategySeed,
      plan: std.plan,
      hookBridge: readyBridge(weak, std.plan, "cheap", undefined, std.ledger),
      candidate: weak,
    });
    assert.equal(weakOutcome.status, "validated");
    if (weakOutcome.status !== "validated") throw new Error("expected validated");
    assert.equal(weakOutcome.validation.failureClass, "quality_threshold");
    assert.ok(
      weakOutcome.validation.hardGates.every((g) => g.passed),
    );
  });

  console.log("positives");
  await check("[P1] Fast/Balanced/Studio pass full coherence", async () => {
    for (const mode of ["cheap", "balanced", "best"] as const) {
      const env = await coherentEnvelope(mode);
      const candidate = buildFinalCandidate(
        env.plan,
        env.grounding,
        env.strategySeed,
      );
      const bridge = readyBridge(
        candidate,
        env.plan,
        mode,
        undefined,
        env.ledger,
      );
      assert.equal(bridge.diagnostics.budget.counts.planner, mode === "cheap" ? 0 : 1, mode);
      assert.equal(
        bridge.diagnostics.budget.events.filter((e) => e.category === "planner").length,
        mode === "cheap" ? 0 : 2,
        mode,
      );
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
      });
      assert.equal(outcome.status, "validated", mode);
      if (outcome.status !== "validated") throw new Error("expected validated");
      assert.equal(outcome.validation.ok, true, mode);
      const asserted = assertRetentionValidationResultCoherence({
        result: outcome.validation,
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
      });
      assert.equal(asserted.validationFingerprint, outcome.validation.validationFingerprint);
      assert.ok(Object.isFrozen(asserted));
    }
  });

  await check("[P2] hard-gate failure and quality failure pass coherence", async () => {
    const env = await coherentEnvelope("cheap");
    const budget = env.plan.compressionGoals.targetWordBudget;
    const per = Math.ceil((budget + 25) / env.plan.beatPlan.beats.length);
    const over = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(
        env.plan,
        env.plan.beatPlan.beats.map((_, i) =>
          i === 0
            ? (() => {
                const open = "Why does Spain pressure matter?";
                const body = padWords(
                  "Spain tactical body keeps rising with clear spoken focus",
                  Math.max(8, per - 5),
                );
                return `${open} ${body}`;
              })()
            : padWords(
                `Spain pressure night section ${SECTION_WORDS[i] ?? "next"}`,
                per,
              ),
        ),
      ),
    );
    const bridge = readyBridge(over, env.plan);
    const hardFail = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate: over,
    });
    assert.equal(hardFail.status, "validated");
    if (hardFail.status !== "validated") throw new Error("expected validated");
    assert.equal(hardFail.validation.failureClass, "hard_gate");
    assertRetentionValidationResultCoherence({
      result: hardFail.validation,
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate: over,
    });

    const std = await coherentEnvelope("cheap", {
      formatStrategyId: "short_standard",
    });
    const weak = buildFinalCandidate(
      std.plan,
      std.grounding,
      std.strategySeed,
      proposalWithTexts(
        std.plan,
        std.plan.beatPlan.beats.map((_, i) =>
          i === 0 ? "Why does Spain pressure matter?" : "Pressure keeps rising.",
        ),
      ),
    );
    const weakBridge = readyBridge(weak, std.plan, "cheap", undefined, std.ledger);
    const qualityFail = validateRetentionStoryCandidate({
      contract: std.contract,
      grounding: std.grounding,
      strategySeed: std.strategySeed,
      plan: std.plan,
      hookBridge: weakBridge,
      candidate: weak,
    });
    assert.equal(qualityFail.status, "validated");
    if (qualityFail.status !== "validated") throw new Error("expected validated");
    assert.equal(qualityFail.validation.failureClass, "quality_threshold");
    assertRetentionValidationResultCoherence({
      result: qualityFail.validation,
      contract: std.contract,
      grounding: std.grounding,
      strategySeed: std.strategySeed,
      plan: std.plan,
      hookBridge: weakBridge,
      candidate: weak,
    });
  });

  await check("[P3] strategies + exact word limit + intro disabled", async () => {
    for (const c of [
      { formatStrategyId: "short_retention" as const, durationSec: 30, threshold: 0.62 },
      { formatStrategyId: "short_standard" as const, durationSec: 30, threshold: 0.55 },
      { formatStrategyId: "extended_short" as const, durationSec: 45, threshold: 0.58 },
    ]) {
      const env = await coherentEnvelope("cheap", {
        formatStrategyId: c.formatStrategyId,
        durationSec: c.durationSec,
      });
      assert.equal(
        resolveRetentionReadinessThreshold(env.contract.formatStrategyId),
        c.threshold,
      );
      const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: readyBridge(candidate, env.plan),
        candidate,
      });
      assert.equal(outcome.status, "validated");
      if (outcome.status !== "validated") throw new Error("expected validated");
      assert.equal(outcome.validation.ok, true);
    }

    const env = await coherentEnvelope("cheap");
    const budget = env.plan.compressionGoals.targetWordBudget;
    const n = env.plan.beatPlan.beats.length;
    const base = Math.floor(budget / n);
    let rem = budget - base * n;
    const texts = env.plan.beatPlan.beats.map((_, i) => {
      const target = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      // Keep seed shorter than per-beat target so padSpokenWords can hit exact totals.
      return padWords(`Spain ${SECTION_WORDS[i] ?? "next"} focus`, target);
    });
    const exact = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(env.plan, texts),
    );
    assert.equal(countRetentionNarrationWords(exact.assembledNarration), budget);

    const std = await coherentEnvelope("cheap", {
      formatStrategyId: "short_standard",
      constraints: { forbidGenericIntro: false },
    });
    // With forbidGenericIntro disabled, lexical gate is not enforced even if
    // the opening would match a forbidden pattern under an enforced contract.
    const intro = buildFinalCandidate(
      std.plan,
      std.grounding,
      std.strategySeed,
      proposalWithTexts(
        std.plan,
        std.plan.beatPlan.beats.map((_, i) =>
          i === 0
            ? "Why does Spain pressure matter? In the world of Spain the contest shifts."
            : "Spain advances with clear spoken focus through the next stretch.",
        ),
      ),
    );
    const introOutcome = validateRetentionStoryCandidate({
      contract: std.contract,
      grounding: std.grounding,
      strategySeed: std.strategySeed,
      plan: std.plan,
      hookBridge: readyBridge(intro, std.plan, "cheap", undefined, std.ledger),
      candidate: intro,
    });
    assert.equal(introOutcome.status, "validated");
    if (introOutcome.status !== "validated") throw new Error("expected validated");
    assert.equal(
      introOutcome.validation.hardGates.find(
        (g) => g.id === "lexical_forbidden_intro_pattern",
      )?.detail,
      "lexical_not_enforced",
    );
  });

  await check("[P4] correct nested bridge candidate + order stability + freeze", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    const bridge = readyBridge(candidate, env.plan);
    const assertedBridge = assertRetentionHookBridgeReadyCoherence(bridge, {
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      candidate,
    });
    assert.equal(assertedBridge.status, "ready");
    assert.equal(
      assertedBridge.candidate.candidateFingerprint,
      candidate.candidateFingerprint,
    );

    const a = validateRetentionStoryCandidate({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
    });
    const b = validateRetentionStoryCandidate({
      candidate,
      hookBridge: bridge,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      contract: env.contract,
    });
    assert.equal(a.status, "validated");
    assert.equal(b.status, "validated");
    if (a.status !== "validated" || b.status !== "validated") {
      throw new Error("expected validated");
    }
    assert.equal(
      a.validation.validationFingerprint,
      b.validation.validationFingerprint,
    );
    assert.ok(Object.isFrozen(a));
    assert.ok(Object.isFrozen(a.validation));
    assert.ok(Object.isFrozen(a.validation.editorial));
    assert.ok(Object.isFrozen(a.diagnostics));
    assert.equal(a.validation.hardGates.length, RETENTION_HARD_GATE_IDS.length);
  });

  await check("[P4A] coherent real-ledger histories + detached freeze", async () => {
    const readyHistories: Array<{
      mode: "cheap" | "balanced" | "best";
      label: string;
      /** Append post-plan categories onto the envelope's shared ledger. */
      run: (ledger: RetentionModelCallLedger) => void;
    }> = [
      {
        mode: "cheap",
        label: "fast_direct",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
        },
      },
      {
        mode: "balanced",
        label: "balanced_planner_direct",
        run: (ledger) => {
          // planner attempted→succeeded already on env.ledger from planning
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
        },
      },
      {
        mode: "best",
        label: "studio_planner_direct",
        run: (ledger) => {
          // planner attempted→succeeded already on env.ledger from planning
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
        },
      },
      {
        mode: "cheap",
        label: "compression_after_success",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("length_compression");
          ledger.recordOutcome("length_compression", "succeeded");
        },
      },
      {
        mode: "cheap",
        label: "repair_then_compression_after_initial",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("hook_repair");
          ledger.recordOutcome("hook_repair", "succeeded");
          ledger.consume("length_compression");
          ledger.recordOutcome("length_compression", "succeeded");
        },
      },
      {
        mode: "cheap",
        label: "repair_after_success_then_marker",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("hook_repair");
          ledger.recordOutcome("hook_repair", "succeeded");
        },
      },
      {
        mode: "cheap",
        label: "fallback_after_success",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("hook_fallback");
          ledger.recordOutcome("hook_fallback", "succeeded");
        },
      },
      {
        mode: "cheap",
        label: "deterministic_marker_after_path",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("hook_fallback");
          ledger.recordOutcome("hook_fallback", "failed");
          recordDeterministicOpeningReplacement(ledger);
        },
      },
      {
        mode: "balanced",
        label: "balanced_fallback_after_initial",
        run: (ledger) => {
          ledger.consume("initial_narration");
          ledger.recordOutcome("initial_narration", "succeeded");
          ledger.consume("hook_fallback");
          ledger.recordOutcome("hook_fallback", "succeeded");
        },
      },
    ];

    for (const h of readyHistories) {
      const env = await coherentEnvelope(h.mode === "cheap" ? "cheap" : h.mode);
      const candidate = buildFinalCandidate(
        env.plan,
        env.grounding,
        env.strategySeed,
      );
      if (h.mode !== "cheap") {
        assert.equal(env.ledger.snapshot().counts.planner, 1, h.label);
      }
      const bridge = readyBridge(
        candidate,
        env.plan,
        h.mode,
        h.run,
        env.ledger,
      );
      const asserted = assertRetentionHookBridgeReadyCoherence(bridge, {
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        candidate,
      });
      assert.ok(Object.isFrozen(asserted.diagnostics.budget), h.label);
      assert.ok(Object.isFrozen(asserted.diagnostics.budget.counts), h.label);
      assert.ok(Object.isFrozen(asserted.diagnostics.budget.events), h.label);

      const callerOwned = bridge.diagnostics.budget as RetentionModelCallLedgerSnapshot & {
        counts: { total: number };
      };
      const before = asserted.diagnostics.budget.counts.total;
      try {
        (callerOwned.counts as { total: number }).total = 999;
      } catch {
        // frozen mutation may throw
      }
      assert.equal(asserted.diagnostics.budget.counts.total, before, h.label);

      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
      });
      assert.equal(outcome.status, "validated", h.label);
      if (outcome.status !== "validated") throw new Error("expected validated");
      assertRetentionValidationResultCoherence({
        result: outcome.validation,
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
      });
    }

    // Repair / fallback failure→success paths are valid closed snapshots.
    const repairLedger = createRetentionModelCallLedger("cheap");
    repairLedger.consume("initial_narration");
    repairLedger.recordOutcome("initial_narration", "failed");
    repairLedger.consume("hook_repair");
    repairLedger.recordOutcome("hook_repair", "succeeded");
    assertRetentionModelCallLedgerSnapshotCoherence(repairLedger.snapshot(), "cheap", {
      requireClosed: true,
      requireZeroRetentionBodyRewrite: true,
    });

    const fallbackLedger = createRetentionModelCallLedger("cheap");
    fallbackLedger.consume("initial_narration");
    fallbackLedger.recordOutcome("initial_narration", "failed");
    fallbackLedger.consume("hook_repair");
    fallbackLedger.recordOutcome("hook_repair", "failed");
    fallbackLedger.consume("hook_fallback");
    fallbackLedger.recordOutcome("hook_fallback", "succeeded");
    assertRetentionModelCallLedgerSnapshotCoherence(
      fallbackLedger.snapshot(),
      "cheap",
      { requireClosed: true, requireZeroRetentionBodyRewrite: true },
    );

    const markerLedger = createRetentionModelCallLedger("cheap");
    markerLedger.consume("initial_narration");
    markerLedger.recordOutcome("initial_narration", "failed");
    markerLedger.consume("hook_repair");
    markerLedger.recordOutcome("hook_repair", "failed");
    markerLedger.consume("hook_fallback");
    markerLedger.recordOutcome("hook_fallback", "failed");
    recordDeterministicOpeningReplacement(markerLedger);
    assertRetentionModelCallLedgerSnapshotCoherence(markerLedger.snapshot(), "cheap", {
      requireClosed: true,
      requireZeroRetentionBodyRewrite: true,
    });

    // Fast ceiling combination with successful initial narration (+ reliability slot)
    const ceilingLedger = createRetentionModelCallLedger("cheap");
    ceilingLedger.consume("initial_narration");
    ceilingLedger.recordOutcome("initial_narration", "failed");
    ceilingLedger.consume("initial_narration");
    ceilingLedger.recordOutcome("initial_narration", "succeeded");
    ceilingLedger.consume("length_compression");
    ceilingLedger.recordOutcome("length_compression", "succeeded");
    ceilingLedger.consume("hook_repair");
    ceilingLedger.recordOutcome("hook_repair", "succeeded");
    ceilingLedger.consume("hook_fallback");
    ceilingLedger.recordOutcome("hook_fallback", "succeeded");
    const ceilingSnap = assertRetentionModelCallLedgerSnapshotCoherence(
      ceilingLedger.snapshot(),
      "cheap",
      {
        requireClosed: true,
        requireSuccessfulInitialNarration: true,
        requireZeroRetentionBodyRewrite: true,
      },
    );
    assert.equal(ceilingSnap.counts.total, 5);
    assert.equal(ceilingSnap.exhausted, true);
  });

  await check("[P5] scenes-only skipped diagnostics + payoff relation terminals", async () => {
    const scenesContract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "scenes_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "cheap",
    });
    const outcome = validateRetentionStoryCandidate({ contract: scenesContract });
    assert.equal(outcome.status, "skipped");
    if (outcome.status !== "skipped") throw new Error("expected skipped");
    assert.equal(outcome.diagnostics.terminalState, "skipped");
    assert.equal(outcome.diagnostics.planFingerprint, null);

    const env = await coherentEnvelope("cheap", {
      formatStrategyId: "short_standard",
      constraints: { requirePayoff: true },
    });
    const last = env.plan.beatPlan.beats[env.plan.beatPlan.beats.length - 1]!;
    const prev = env.plan.beatPlan.beats[env.plan.beatPlan.beats.length - 2]!;
    assert.equal(last.purpose, "resolution");
    assert.equal(last.payoffRelation, "deliver");
    assert.equal(prev.payoffRelation, "setup");
    const candidate = buildFinalCandidate(env.plan, env.grounding, env.strategySeed);
    for (const purpose of ["challenge", "resolution", "twist"] as const) {
      const beats = env.plan.beatPlan.beats.map((b, i, arr) =>
        i === arr.length - 1 ? { ...b, purpose } : b,
      );
      const forgedPlan = {
        ...env.plan,
        beatPlan: { ...env.plan.beatPlan, beats },
      } as RetentionStoryPlan;
      assert.equal(
        evaluateRetentionHardGates({
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: forgedPlan,
          candidate,
          hookBridge: readyBridge(candidate, env.plan),
        }).find((g) => g.id === "required_payoff_beat_present")?.passed,
        true,
        purpose,
      );
    }
  });

  await check("[P6] word counter unicode fixtures", () => {
    assert.equal(countRetentionNarrationWords(""), 0);
    assert.equal(countRetentionNarrationWords("Spain's pressure night."), 3);
    assert.equal(countRetentionNarrationWords("café football night"), 3);
  });

  await check("[H2] curiosity heuristic credits declarative / cold-open / question openings", async () => {
    const env = await coherentEnvelope("cheap");
    const question = fittingProposal(env.plan);
    const qCandidate = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      question,
    );
    const qScores = scoreRetentionEditorialQuality({
      contract: env.contract,
      plan: env.plan,
      candidate: qCandidate,
    });
    assert.ok(qScores.curiosity >= 0.7);

    const declarativeProposal = {
      ...question,
      segments: question.segments.map((s, i) =>
        i === 0
          ? {
              ...s,
              text: s.text.replace(
                /^Why does Spain pressure matter\?/,
                "Spain never saw this pressure coming.",
              ),
            }
          : s,
      ),
    };
    const dCandidate = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      declarativeProposal,
    );
    const dScores = scoreRetentionEditorialQuality({
      contract: env.contract,
      plan: env.plan,
      candidate: dCandidate,
    });
    assert.ok(
      dScores.curiosity >= 0.6,
      `declarative curiosity too low: ${dScores.curiosity}`,
    );

    const flatProposal = {
      ...question,
      segments: question.segments.map((s, i) =>
        i === 0
          ? {
              ...s,
              text: "In today's match preview we look at Spain versus France pressure patterns across the middle third tonight.",
            }
          : s,
      ),
    };
    const fCandidate = buildFinalCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      flatProposal,
    );
    const fScores = scoreRetentionEditorialQuality({
      contract: env.contract,
      plan: env.plan,
      candidate: fCandidate,
    });
    assert.ok(
      fScores.curiosity < dScores.curiosity,
      "generic intro must not outscore declarative cold-open",
    );
    assert.equal(getRetentionHeuristicRegistryVersion(), "heuristic-registry/2");
  });

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
