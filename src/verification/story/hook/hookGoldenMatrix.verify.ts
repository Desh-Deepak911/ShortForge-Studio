/**
 * Sprint 7E — Hook Golden Matrix (executable QA against real Hook Engine APIs).
 * Exercises the canonical adapter, strategy library, validator, bounded repair, and
 * all three generation paths directly — source assertions are a supplement only,
 * never the primary evidence.
 * Run: npm run test:hook-golden-matrix
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "server-only" throws unconditionally when required outside a Next.js Server
// Component bundle. Story services legitimately guard themselves with it; for
// this Node-executed QA we pre-seed the require cache with a satisfied module
// record so real generation-path functions can be exercised without network.
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

import {
  assertRequestPlanCoherence,
  buildHookCandidate,
  buildHookDirective,
  buildHookGenerationContext,
  buildHookPlanFromRequest,
  buildNeutralResearchEvidence,
  extractOpeningSpan,
  generateHookedNarration,
  HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
  HOOK_EVIDENCE_SURPRISE_STRATEGY_ID,
  HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES,
  HOOK_STRATEGY_IDS,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
  HOOK_USER_DIRECTED_STRATEGY_ID,
  normalizeHookRequest,
  runBoundedHookRepair,
  storyScriptFromHookedNarration,
  validateHookCandidate,
  type HookedNarrationModelCall,
} from "@/features/hook-engine";
import type {
  RetentionComposerCallback,
  RetentionHookRunner,
} from "@/features/retention-story";
import { CREATOR_TEMPLATE_IDS } from "@/features/creator-templates";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import { buildNarrativePlan } from "@/features/intelligence/prompts/build-narrative-plan";
import { resolveEvidenceLedSurprisePreference } from "@/features/intelligence/prompts/resolve-evidence-led-surprise-preference";
import { resolveResearchPromptText } from "@/features/intelligence/context/resolve-research-prompt-text";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import type { ScriptMode } from "@/types/footiebitz";
import {
  buildTerminalHookAuthority,
  deriveSafeHookEnvelopeFromAuthority,
  toHookTerminalEvidence,
} from "../retention/retentionStoryReadyBridge";
import {
  SECTION_WORDS,
} from "../retention/retentionStoryCoherentEnvelope";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

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

function punchyNarration(
  topic: string,
  body = "The rest of the narration covers tactics and context for a full short.",
): string {
  return `${topic.split(/\s+/).slice(0, 3).join(" ")} erupts. ${body}`;
}

/**
 * Strategy-aware openings so mode/template goldens prove the *selected* strategy
 * can commit — not that a generic line silently fell back to compatibility_punchy.
 * Openings stay within the registry hard max of 5 opening words.
 */
function narrationForStrategy(strategyId: string, topic: string): string {
  const subject = topic.split(/\s+/).find((t) => t.length >= 3) ?? "City";
  const body =
    "The rest of the narration covers tactics and context for a full short.";
  switch (strategyId) {
    case "countdown_tease":
      // Must preserve subject tokens; avoid bare rankings that require claim refs.
      return `Wait — ${subject} list teases. ${body}`;
    case "myth_challenge":
      return `That ${subject} myth ends. ${body}`;
    case "stakes_first":
      return `${subject} stakes erupt now. ${body}`;
    case "headline_first":
      return `${subject} derby night erupts. ${body}`;
    case "evidence_surprise":
      return `Wait ${subject} hid shock. ${body}`;
    case "curiosity_gap":
      return `Nobody saw ${subject} twist. ${body}`;
    case "provocative_question":
      return `What if ${subject} never? ${body}`;
    case "contrarian_claim":
      return `${subject} is never destiny. ${body}`;
    case "user_directed":
    case "compatibility_punchy":
    case "cold_open":
    default:
      return `${subject} derby night erupts. ${body}`;
  }
}

function makePassModelCall(
  topic: string,
  strategyId?: string,
): HookedNarrationModelCall {
  return async () => ({
    title: "Golden",
    narration: strategyId
      ? narrationForStrategy(strategyId, topic)
      : punchyNarration(topic),
    hookClaimRefs: [],
  });
}

function padWords(base: string, target: number): string {
  const cleaned = base
    .trim()
    .replace(/[.!?…]+$/u, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const desired = Math.max(3, target, tokens.length);
  while (tokens.length < desired) tokens.push("pace");
  return `${tokens.join(" ")}.`;
}

function joinOpeningAndBody(opening: string, body: string): string {
  const open = opening.trim();
  const rest = body.trim().replace(/^[.!?…]+/, "").trim();
  if (!rest) return open;
  const completeBody = /[.!?…]$/u.test(rest)
    ? rest
    : `${rest.replace(/[.!?…]+$/u, "")}.`;
  return `${open} ${completeBody}`.replace(/\s+/g, " ").trim();
}

/** Retention composer double that clears short_retention hard word + editorial gates. */
function makeRetentionPassComposer(): RetentionComposerCallback {
  return (request) => {
    const n = request.orderedBeatIds.length;
    const budget = Math.round(request.durationSec * 2.4);
    const minPer = 4;
    const targetTotal = Math.min(
      Math.max(n * minPer, budget - 8),
      Math.max(n * minPer, Math.floor(budget * 0.78)),
    );
    const base = Math.floor(targetTotal / n);
    let rem = targetTotal - base * n;
    return {
      title: "Golden Retention",
      hookClaimRefs: [] as unknown as string[],
      segments: request.orderedBeatIds.map((beatId, i) => {
        const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
        if (rem > 0) rem -= 1;
        const section = SECTION_WORDS[i] ?? "next";
        if (i === 0) {
          const open = "Why does Spain pressure matter?";
          const openWords = open.trim().split(/\s+/).filter(Boolean).length;
          const body = padWords(
            "Spain focus reshapes this preview tonight",
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
            ? "Spain pressure closes this preview tonight"
            : `Spain ${section} focus advances tonight`;
        return {
          beatId,
          text: padWords(seed, target),
          claimRefs: [] as unknown as string[],
        };
      }),
    };
  };
}

/** Hook runner double: exercises Retention modelCall, then commits coherent Hook authority. */
const retentionPassHookRunner: RetentionHookRunner = async (input) => {
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

function retentionPathDoubles() {
  return {
    retentionPlanner: null,
    retentionComposer: makeRetentionPassComposer(),
    retentionHookRunner: retentionPassHookRunner,
    qualityMode: "cheap" as const,
    qualityModeExplicit: true as const,
  };
}

function minimalGraph(overrides: Record<string, unknown> = {}): GraphContext {
  return {
    queryId: "q-golden",
    topic: "City derby night",
    selectedMode: "match_recap",
    primaryEntities: [],
    rankedFacts: [],
    verifiedFacts: [],
    fixtureFacts: [],
    statisticFacts: [],
    timelineFacts: [],
    entitySummaries: [],
    relationshipSummaries: [],
    groundingRules: [],
    warnings: [],
    confidence: { score: 80, label: "high" },
    provenance: { source: "provider" },
    diagnostics: {
      nodeCount: 0,
      edgeCount: 0,
      factCount: 0,
      verifiedFactCount: 0,
      rankedFactCount: 0,
      timelineFactCount: 0,
      statisticFactCount: 0,
      fixtureFactCount: 0,
      entitySummaryCount: 0,
      relationshipSummaryCount: 0,
      providerDiagnostics: [],
    },
    ...overrides,
  } as unknown as GraphContext;
}

function assembledContext(
  queryId: string,
  topic: string,
  mode: ScriptMode,
  manualNotes?: string,
) {
  return {
    queryId,
    topic,
    selectedMode: mode,
    verifiedFacts: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    provenance: { source: "api-football" },
    ...(manualNotes ? { manualNotes } : {}),
  } as never;
}

/** Canonical adapter → generation lifecycle used by most goldens below. */
async function buildAndGenerate(input: {
  readonly topic: string;
  readonly scriptMode?: ScriptMode;
  readonly templateId?: CreatorTemplateId;
  readonly userAuthoredHook?: string;
  readonly researchEvidence?: ReturnType<typeof buildNeutralResearchEvidence>;
  readonly modelCall?: HookedNarrationModelCall;
  readonly durationSeconds?: number;
}) {
  const scriptMode = input.scriptMode ?? "story";
  const durationSeconds = input.durationSeconds ?? 30;
  const ctx = buildHookGenerationContext({
    topic: input.topic,
    scriptMode,
    tone: "dramatic",
    durationSeconds,
    generationPath: "script_only",
    ...(input.templateId ? { template: { templateId: input.templateId } } : {}),
    ...(input.userAuthoredHook ? { userAuthoredHook: input.userAuthoredHook } : {}),
    ...(input.researchEvidence ? { researchEvidence: input.researchEvidence } : {}),
  });
  assertRequestPlanCoherence(ctx.request, ctx.plan);

  const directive = buildHookDirective({ request: ctx.request, plan: ctx.plan });
  assert.equal(directive.planFingerprint, ctx.plan.planFingerprint);
  assert.equal(directive.promptBlock, ctx.directive.promptBlock);

  const result = await generateHookedNarration({
    hookContext: ctx,
    topic: input.topic,
    tone: "dramatic",
    duration: durationSeconds,
    scriptMode,
    modelCall: input.modelCall ?? makePassModelCall(input.topic),
  });

  return { ctx, directive, result };
}

async function main() {
  let modeCount = 0;
  let templateCount = 0;
  let strategyCount = 0;
  let pathCount = 0;
  let evidenceCount = 0;
  const coveredStrategies = new Set<string>();

  // ── A. Every ScriptMode (8) → default strategy ──────────────────────────
  await runTests("A. script-mode defaults", [
    ...Object.entries(HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES).map(
      ([mode, expectedStrategyId]): [string, () => Promise<void>] => [
        `${mode} → ${expectedStrategyId}`,
        async () => {
          const topic = `City derby night ${mode}`;
          const { ctx, result } = await buildAndGenerate({
            topic,
            scriptMode: mode as ScriptMode,
            modelCall: makePassModelCall(topic, expectedStrategyId),
          });

          assert.equal(ctx.plan.strategyId, expectedStrategyId);
          assert.equal(ctx.plan.strategySource, "strategy_library");
          assert.equal(ctx.plan.requestFingerprint, ctx.request.requestFingerprint);

          assert.equal(result.ok, true);
          if (!result.ok) return;

          // Committed strategy must be the mode default — silent fallback fails this golden.
          assert.equal(result.diagnostics.strategyId, expectedStrategyId);
          assert.equal(result.diagnostics.strategySource, "strategy_library");
          assert.notEqual(result.diagnostics.strategyId, "compatibility_punchy");
          assert.equal(result.diagnostics.requestFingerprint, ctx.request.requestFingerprint);
          assert.equal(result.diagnostics.planFingerprint, ctx.plan.planFingerprint);
          assert.ok(result.approvedNarration.includes(result.selection.openingText));
          assert.ok(result.diagnostics.repairAttempts <= 1);
          assert.ok(
            ["none", "compressed", "truncated", "compressed_then_truncated"].includes(
              result.diagnostics.lengthEnforcement ?? "none",
            ),
          );
          assert.equal(result.diagnostics.adapterRan, true);
          modeCount += 1;
        },
      ],
    ),
  ]);
  assert.equal(modeCount, 8);

  // ── B. Every creator template → preferred strategy (advisory) ───────────
  assert.equal(CREATOR_TEMPLATE_IDS.length, 9);
  assert.equal(Object.keys(HOOK_TEMPLATE_STRATEGY_PREFERENCES).length, 9);

  await runTests("B. creator-template mappings", [
    ...CREATOR_TEMPLATE_IDS.map((templateId): [string, () => void] => [
      `${templateId} → ${HOOK_TEMPLATE_STRATEGY_PREFERENCES[templateId]}`,
      () => {
        const preferred = HOOK_TEMPLATE_STRATEGY_PREFERENCES[templateId];
        assert.ok(preferred, `missing preference for ${templateId}`);
        const ctx = buildHookGenerationContext({
          topic: `Template topic for ${templateId}`,
          generationPath: "script_only",
          durationSeconds: 30,
          template: { templateId },
        });
        assert.equal(ctx.request.templateId, templateId);
        assert.equal(ctx.plan.strategyId, preferred);
        templateCount += 1;
      },
    ]),
  ]);
  assert.equal(templateCount, CREATOR_TEMPLATE_IDS.length);

  // ── C. Dedicated strategy goldens (every entry in HOOK_STRATEGY_IDS) ─────
  await runTests("C. dedicated strategy goldens", [
    [
      "user_directed — sanitized user-authored opening honored + low-level candidate validates",
      async () => {
        const topic = "City title race tonight";
        const userHook = "City title race erupts tonight.";
        const { ctx, result } = await buildAndGenerate({
          topic,
          userAuthoredHook: userHook,
        });
        assert.equal(ctx.plan.strategyId, HOOK_USER_DIRECTED_STRATEGY_ID);
        assert.equal(ctx.request.userAuthoredHook, userHook);
        assert.equal(result.ok, true);

        // Direct use of the low-level candidate builder + validator against the same plan.
        const candidate = buildHookCandidate({
          narration: punchyNarration(topic),
          request: ctx.request,
          plan: ctx.plan,
          origin: "model_narration_opening",
        });
        const validation = validateHookCandidate({
          request: ctx.request,
          plan: ctx.plan,
          candidate,
        });
        assert.equal(validation.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "compatibility_punchy — forced via genuine quality-only validation failure → bounded fallback",
      async () => {
        const topic = "Compatibility punchy golden";
        const request = normalizeHookRequest({
          topic,
          scriptMode: "story",
          durationSeconds: 30,
          generationPath: "script_only",
        });
        const { plan } = buildHookPlanFromRequest(request);
        assert.equal(plan.strategyId, "cold_open");

        // Deliberately exceeds cold_open's opening-word ceiling while staying
        // subject-faithful and free of any grounding/safety risk signal —
        // a genuine quality-only failure, not a hard-gate failure.
        const overLongNarration =
          `${topic} keeps talking well beyond the point where a punchy opening ` +
          "line was ever supposed to stop before finally slowing down.";
        const candidate = buildHookCandidate({
          narration: overLongNarration,
          request,
          plan,
          origin: "model_narration_opening",
        });
        const validation = validateHookCandidate({ request, plan, candidate });
        assert.equal(validation.ok, false);
        assert.equal(validation.hardGatesPassed.grounding, true);
        assert.equal(validation.hardGatesPassed.safety, true);
        assert.ok(validation.reasons.includes("quality.over_word_limit"));

        const workflow = await runBoundedHookRepair({
          request,
          plan,
          narration: overLongNarration,
          claimRefs: [],
          compatibilityFallback: async () => ({
            narration: punchyNarration(topic),
            claimRefs: [],
          }),
        });

        assert.equal(workflow.ok, true);
        assert.equal(workflow.activePlan.strategyId, HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID);
        assert.equal(workflow.diagnostics.strategyId, HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID);
        assert.equal(workflow.diagnostics.validationOutcome, "fallback");
        // Terminal fallback rewrites the model opening deterministically.
        assert.match(
          workflow.approvedNarration ?? "",
          /^Nobody saw Compatibility coming\./,
        );
        assert.ok(
          (workflow.approvedNarration ?? "").includes(
            "The rest of the narration covers tactics and context for a full short.",
          ),
        );
        coveredStrategies.add(HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID);
        strategyCount += 1;
      },
    ],
    [
      "curiosity_gap — historical_explainer default",
      async () => {
        const topic = "Why this rivalry never fades";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "historical_explainer",
        });
        assert.equal(ctx.plan.strategyId, "curiosity_gap");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "stakes_first — match_preview default",
      async () => {
        const topic = "Derby weekend stakes preview";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "match_preview",
        });
        assert.equal(ctx.plan.strategyId, "stakes_first");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "provocative_question — tactical_review default",
      async () => {
        const topic = "Why the press trap keeps failing";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "tactical_review",
        });
        assert.equal(ctx.plan.strategyId, "provocative_question");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "contrarian_claim — opinion_debate default",
      async () => {
        const topic = "Overrated star striker debate";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "opinion_debate",
        });
        assert.equal(ctx.plan.strategyId, "contrarian_claim");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "myth_challenge — myth_vs_reality template preference",
      async () => {
        const topic = "The myth about this legendary match";
        const { ctx, result } = await buildAndGenerate({
          topic,
          templateId: "myth_vs_reality",
        });
        assert.equal(ctx.plan.strategyId, "myth_challenge");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "countdown_tease — top_5 default",
      async () => {
        const topic = "Top scorers countdown this season";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "top_5",
        });
        assert.equal(ctx.plan.strategyId, "countdown_tease");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "headline_first — match_recap default",
      async () => {
        const topic = "City derby night final score";
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "match_recap",
        });
        assert.equal(ctx.plan.strategyId, "headline_first");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "cold_open — story default; low-level normalizeHookRequest + buildHookPlanFromRequest parity",
      async () => {
        const topic = "City derby night cold open";
        const { ctx, result } = await buildAndGenerate({ topic, scriptMode: "story" });
        assert.equal(ctx.plan.strategyId, "cold_open");
        assert.equal(result.ok, true);

        const directRequest = normalizeHookRequest({
          topic,
          scriptMode: "story",
          durationSeconds: 30,
          generationPath: "script_only",
        });
        assert.equal(directRequest.requestFingerprint, ctx.request.requestFingerprint);

        const direct = buildHookPlanFromRequest(directRequest);
        assert.equal(direct.plan.planFingerprint, ctx.plan.planFingerprint);
        assert.equal(direct.plan.strategyId, ctx.plan.strategyId);
        assert.equal(direct.resolution.strategySource, "strategy_library");
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
    [
      "evidence_surprise — explicit PI statistic preference + eligible statistic fact",
      async () => {
        const topic =
          "Manchester City's latest completed match recap with a surprising statistic";
        const graph = minimalGraph({
          queryId: "q-ev-golden",
          topic,
          selectedMode: "match_recap",
          fixtureFacts: [
            {
              id: "fx-golden",
              text: "City won 2-0",
              type: "reference",
              confidence: { score: 95, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
          statisticFacts: [
            {
              id: "stat-golden",
              text: "Possession 28%",
              type: "statistic",
              value: 28,
              confidence: { score: 90, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
        });
        const plan = buildNarrativePlan({
          graphContext: graph,
          evidenceLedSurprisePreference: "evidence_statistic",
        });
        assert.equal(plan.openingIntent?.kind, "evidence_led_surprise");
        assert.deepEqual(plan.openingIntent?.factIds, ["stat-golden"]);

        const evidence = buildNeutralResearchEvidence({
          graphContext: graph,
          narrativePlan: plan,
          researchApplied: true,
        });
        const { ctx, result } = await buildAndGenerate({
          topic,
          scriptMode: "match_recap",
          researchEvidence: evidence,
        });
        assert.equal(ctx.plan.strategyId, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
        assert.equal(ctx.plan.strategySource, "prompt_intelligence");
        assert.equal(result.ok, true);
        coveredStrategies.add(ctx.plan.strategyId);
        strategyCount += 1;
      },
    ],
  ]);

  assert.equal(strategyCount, HOOK_STRATEGY_IDS.length);
  assert.equal(coveredStrategies.size, HOOK_STRATEGY_IDS.length);
  for (const id of HOOK_STRATEGY_IDS) {
    assert.ok(coveredStrategies.has(id), `no dedicated golden covered strategy ${id}`);
  }

  // ── D. Evidence-surprise semantic matrix ─────────────────────────────────
  await runTests("D. evidence-surprise semantic matrix", [
    [
      "surprising statistic + eligible statistic fact → evidence_surprise (opening references the statistic)",
      () => {
        const topic = "City with a surprising statistic";
        assert.equal(
          resolveEvidenceLedSurprisePreference({ topic }),
          "evidence_statistic",
        );
        const graph = minimalGraph({
          queryId: "q-sem-stat",
          topic,
          selectedMode: "match_recap",
          fixtureFacts: [
            {
              id: "fx-sem-stat",
              text: "Final 2-0",
              type: "reference",
              confidence: { score: 95, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
          statisticFacts: [
            {
              id: "stat-sem",
              text: "xG 0.4",
              type: "statistic",
              value: 0.4,
              confidence: { score: 90, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
        });
        const plan = buildNarrativePlan({
          graphContext: graph,
          evidenceLedSurprisePreference: resolveEvidenceLedSurprisePreference({ topic }),
        });
        assert.equal(plan.openingIntent?.kind, "evidence_led_surprise");
        assert.deepEqual(plan.openingIntent?.factIds, ["stat-sem"]);

        const evidence = buildNeutralResearchEvidence({
          graphContext: graph,
          narrativePlan: plan,
          researchApplied: true,
        });
        const ctx = buildHookGenerationContext({
          topic,
          scriptMode: "match_recap",
          generationPath: "script_only",
          researchEvidence: evidence,
        });
        assert.equal(ctx.plan.strategyId, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
        evidenceCount += 1;
      },
    ],
    [
      "surprising statistic + only fixture (no eligible stats) → NOT evidence_surprise (headline_first)",
      () => {
        const topic = "City with a surprising statistic";
        const fixtureOnly = minimalGraph({
          queryId: "q-sem-fixture-only",
          topic,
          selectedMode: "match_recap",
          fixtureFacts: [
            {
              id: "fx-only",
              text: "Final 2-0",
              type: "reference",
              confidence: { score: 95, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
        });
        const noStatPlan = buildNarrativePlan({
          graphContext: fixtureOnly,
          evidenceLedSurprisePreference: "evidence_statistic",
        });
        assert.equal(noStatPlan.openingIntent, undefined);

        const resolved = resolveResearchPromptText({
          assembled: assembledContext("q-sem-fixture-only", topic, "match_recap"),
          graphContext: fixtureOnly,
        });
        const evidence = buildNeutralResearchEvidence({
          graphContext: fixtureOnly,
          narrativePlan: resolved.narrativePlan,
          researchApplied: true,
        });
        const ctx = buildHookGenerationContext({
          topic,
          scriptMode: "match_recap",
          generationPath: "script_only",
          researchEvidence: evidence,
        });
        assert.equal(ctx.plan.strategyId, "headline_first");
        assert.notEqual(ctx.plan.strategyId, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
        evidenceCount += 1;
      },
    ],
    [
      "surprising fact + fixture → may select evidence_surprise via generic fact class",
      () => {
        const topic = "City with a surprising fact";
        assert.equal(resolveEvidenceLedSurprisePreference({ topic }), "evidence_fact");
        const graph = minimalGraph({
          queryId: "q-sem-fact",
          topic,
          selectedMode: "match_recap",
          fixtureFacts: [
            {
              id: "fx-fact",
              text: "City won 2-0",
              type: "reference",
              confidence: { score: 95, label: "high" },
              provenance: { source: "api-football" },
            },
          ],
        });
        const plan = buildNarrativePlan({
          graphContext: graph,
          evidenceLedSurprisePreference: "evidence_fact",
        });
        assert.equal(plan.openingIntent?.kind, "evidence_led_surprise");
        assert.ok(plan.openingIntent?.factIds.includes("fx-fact"));

        const evidence = buildNeutralResearchEvidence({
          graphContext: graph,
          narrativePlan: plan,
          researchApplied: true,
        });
        const ctx = buildHookGenerationContext({
          topic,
          scriptMode: "match_recap",
          generationPath: "script_only",
          researchEvidence: evidence,
        });
        assert.equal(ctx.plan.strategyId, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
        evidenceCount += 1;
      },
    ],
    [
      "user/inferred statistics remain ineligible for evidence_surprise",
      () => {
        const topic = "City with a surprising statistic";
        const graph = minimalGraph({
          queryId: "q-sem-ineligible",
          topic,
          selectedMode: "match_recap",
          statisticFacts: [
            {
              id: "stat-user",
              text: "My 99% possession claim",
              type: "statistic",
              value: 99,
              confidence: { score: 10, label: "low" },
              provenance: { source: "user" },
            },
          ],
        });
        const plan = buildNarrativePlan({
          graphContext: graph,
          evidenceLedSurprisePreference: "evidence_statistic",
        });
        assert.equal(plan.openingIntent, undefined);

        const evidence = buildNeutralResearchEvidence({
          graphContext: graph,
          narrativePlan: plan,
          researchApplied: true,
        });
        const ctx = buildHookGenerationContext({
          topic,
          scriptMode: "match_recap",
          generationPath: "script_only",
          researchEvidence: evidence,
        });
        assert.notEqual(ctx.plan.strategyId, HOOK_EVIDENCE_SURPRISE_STRATEGY_ID);
        assert.equal(ctx.plan.strategyId, "headline_first");
        evidenceCount += 1;
      },
    ],
    [
      "ordinary researched topics retain mode defaults across all 8 modes",
      () => {
        for (const [mode, expected] of Object.entries(HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES)) {
          const topic = `Ordinary ${mode} research topic`;
          assert.equal(resolveEvidenceLedSurprisePreference({ topic }), undefined);
          const ctx = buildHookGenerationContext({
            topic,
            scriptMode: mode as ScriptMode,
            generationPath: "script_only",
          });
          assert.equal(ctx.plan.strategyId, expected);
        }
        evidenceCount += 1;
      },
    ],
  ]);
  assert.equal(evidenceCount, 5);

  // ── E. Generation-path matrix (script-only / audio-first / scenes-only) ─
  const service = await import(
    "@/features/story/services/audio-first-generation.service"
  );

  await runTests("E. generation-path matrix", [
    [
      "script-only: generateScriptOnlyStory commits Retention→Hook approved narration + envelopes; no leaked internals",
      async () => {
        const topic = "City derby night script only";
        const result = await service.generateScriptOnlyStory({
          prompt: topic,
          sceneCount: 4,
          duration: 30,
          scriptMode: "story",
          ...retentionPathDoubles(),
        });
        assert.equal(result.success, true);
        if (!result.success) return;

        assert.ok(result.footieScript.narration.length > 0);
        assert.ok(result.hookEnvelope?.snapshot);
        assert.ok(result.hookEnvelope?.diagnostics);
        assert.equal(result.hookEnvelope?.diagnostics.adapterRan, true);
        assert.ok(result.retentionEnvelope?.planSnapshot);
        assert.ok(result.retentionEnvelope?.validationSummary);

        const blob = JSON.stringify(result);
        assert.doesNotMatch(blob, /hookClaimRefs/);
        assert.doesNotMatch(blob, /promptBlock/);
        assert.doesNotMatch(blob, /terminalEvidence/);
        assert.doesNotMatch(blob, /ledgerEvents/);

        const rebuiltScript = storyScriptFromHookedNarration({
          title: "T",
          approvedNarration: result.footieScript.narration,
        });
        assert.equal(rebuiltScript.narration, result.footieScript.narration);
        pathCount += 1;
      },
    ],
    [
      "audio-first: Retention commit → voiceover → scenes; irrecoverable Precise Hook miss blocks VO/scenes",
      async () => {
        const topic = "City derby night audio first";
        const order: string[] = [];
        let committedNarration = "";
        const ok = await service.generateAudioFirstStory({
          prompt: topic,
          sceneCount: 3,
          duration: 30,
          scriptMode: "story",
          ...retentionPathDoubles(),
          retentionComposer: ((request) => {
            order.push("retention");
            return makeRetentionPassComposer()(request);
          }) as RetentionComposerCallback,
          voiceoverFromScript: async (script: { narration: string }) => {
            order.push("vo");
            committedNarration = script.narration;
            assert.ok(script.narration.length > 0);
            return {
              durationMs: 12000,
              provider: "test",
              audioBase64: "AAAA",
              metadata: { durationSource: "measured" as const },
            };
          },
          scenesFromScriptAndAudio: async (input: {
            script: { narration: string };
          }) => {
            order.push("scenes");
            assert.equal(input.script.narration, committedNarration);
            return {
              success: true as const,
              scenes: [
                {
                  id: "1",
                  subtitle: input.script.narration,
                  start: 0,
                  end: 12,
                  duration: 12,
                },
              ],
            };
          },
        });
        assert.equal(ok.success, true);
        assert.deepEqual(order, ["retention", "vo", "scenes"]);

        // Flexible: composer throw → deterministic rescue still commits → VO/scenes run.
        const throwOrder: string[] = [];
        const thrown = await service.generateAudioFirstStory({
          prompt: topic,
          sceneCount: 3,
          duration: 30,
          creationReliabilityMode: "flexible",
          ...retentionPathDoubles(),
          retentionComposer: () => {
            throwOrder.push("retention");
            throw new Error("model_down");
          },
          voiceoverFromScript: async () => {
            throwOrder.push("vo");
            return { durationMs: 1, provider: "test", audioBase64: "X" };
          },
          scenesFromScriptAndAudio: async () => {
            throwOrder.push("scenes");
            return {
              success: true as const,
              scenes: [
                {
                  id: "1",
                  subtitle: "rescued",
                  start: 0,
                  end: 1,
                  duration: 1,
                },
              ],
            };
          },
        });
        assert.equal(thrown.success, true);
        assert.deepEqual(throwOrder, ["retention", "vo", "scenes"]);

        // Precise + explicit Hook reject: no silent Auto/det promote → VO/scenes blocked.
        const invalidOrder: string[] = [];
        const invalid = await service.generateAudioFirstStory({
          prompt: topic,
          sceneCount: 3,
          duration: 30,
          scriptMode: "story",
          creationReliabilityMode: "precise",
          hookStyle: "curiosity_gap",
          ...retentionPathDoubles(),
          retentionHookRunner: async (input) => {
            invalidOrder.push("hook");
            await input.modelCall({
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
            return {
              ok: false as const,
              error: "hook_rejected",
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
                repairAttempts: 0,
                templateInfluenced: false,
                promptIntelligenceInfluenced: false,
                adapterRan: true,
              },
              snapshot: input.hookContext.snapshot,
            };
          },
          voiceoverFromScript: async () => {
            invalidOrder.push("vo");
            return { durationMs: 1, provider: "test", audioBase64: "X" };
          },
          scenesFromScriptAndAudio: async () => {
            invalidOrder.push("scenes");
            return { success: false as const, error: "nope", kind: "empty" as const, response: null };
          },
        });
        assert.equal(invalid.success, false);
        assert.ok(invalidOrder.includes("hook"));
        assert.ok(!invalidOrder.includes("vo"));
        assert.ok(!invalidOrder.includes("scenes"));
        pathCount += 1;
      },
    ],
    [
      "scenes-only: executable path preserves exact narration; Hook never runs; no Hook envelope",
      async () => {
        const exactNarration =
          "  Exact scenes-only narration must be preserved byte-for-byte.  ";
        const exactTitle = "Scenes Only Title";
        let plannerSawNarration: string | undefined;

        const result = await service.generateScenesForReviewedScript({
          prompt: "City derby",
          title: exactTitle,
          narration: exactNarration,
          voiceoverDurationMs: 15000,
          sceneCount: 3,
          scenesFromScriptAndAudio: async (input) => {
            plannerSawNarration = input.script.narration;
            return {
              success: true as const,
              scenes: [
                {
                  id: "1",
                  subtitle: input.script.narration,
                  start: 0,
                  end: 15,
                  duration: 15,
                },
              ],
            };
          },
        });

        assert.equal(result.success, true);
        if (!result.success) return;

        assert.equal(plannerSawNarration, exactNarration);
        assert.equal(result.footieScript.narration, exactNarration);
        assert.equal(result.footieScript.title, exactTitle);
        assert.equal(
          (result as { hookEnvelope?: unknown }).hookEnvelope,
          undefined,
        );

        // Early-validation branches remain executable without network.
        const missingPrompt = await service.generateScenesForReviewedScript({
          prompt: "",
          title: "Some Title",
          narration: "Some narration text.",
          voiceoverDurationMs: 12000,
          sceneCount: 4,
        });
        assert.equal(missingPrompt.success, false);

        // Supplementary source checks (not primary evidence).
        const serviceSrc = readSrc(
          "src/features/story/services/audio-first-generation.service.ts",
        );
        const scenesFn = serviceSrc.slice(
          serviceSrc.indexOf("export async function generateScenesForReviewedScript"),
          serviceSrc.indexOf("export async function generateAudioFirstStory"),
        );
        assert.doesNotMatch(scenesFn, /buildHookGenerationContext/);
        assert.doesNotMatch(scenesFn, /generateHookedNarration/);
        assert.doesNotMatch(scenesFn, /runBoundedHookRepair/);
        assert.match(scenesFn, /const narration = input\.narration;/);
        assert.match(
          scenesFn,
          /scenesFromScriptAndAudio \?\? generateScenesFromScriptAndAudio/,
        );

        const route = readSrc("src/app/api/generate-script/route.ts");
        assert.match(route, /mode === "scenes-only"/);
        assert.match(route, /generateScenesForReviewedScript/);
        const scenesRouteStart = route.indexOf('if (params.mode === "scenes-only")');
        const scenesRouteEnd = route.indexOf(
          "const resolvedContext = await resolveNarrationGenerationContext",
        );
        const scenesRouteBlock = route.slice(scenesRouteStart, scenesRouteEnd);
        assert.doesNotMatch(scenesRouteBlock, /buildHookGenerationContext/);
        assert.doesNotMatch(scenesRouteBlock, /hookEnvelope/);
        // API must not accept scene-planning doubles from request JSON.
        assert.doesNotMatch(scenesRouteBlock, /scenesFromScriptAndAudio/);
        // API boundary must preserve reviewed narration (not buildStoryResponse/normalize trim).
        assert.match(scenesRouteBlock, /buildScenesOnlyStoryResponse/);
        assert.doesNotMatch(scenesRouteBlock, /buildStoryResponse\(scenesResult/);

        // Executable API-boundary adapter (the layer that previously trimmed).
        const { buildScenesOnlyStoryResponse, normalizeFootieStory } = await import(
          "@/features/story/services"
        );
        const adapted = buildScenesOnlyStoryResponse(result.footieScript);
        assert.equal(adapted.narration, exactNarration);
        assert.equal(adapted.title, exactTitle);
        assert.ok(adapted.narration.startsWith("  "));
        assert.ok(adapted.narration.endsWith("  "));
        assert.ok(Array.isArray(adapted.scenes));
        assert.ok(adapted.scenes.length > 0);
        // Contrast: normalizeFootieStory would trim (the prior defect).
        const trimmed = normalizeFootieStory(result.footieScript);
        assert.notEqual(trimmed.narration, exactNarration);
        assert.equal(trimmed.narration, exactNarration.trim());

        // Whitespace-only narration still fails service validation.
        const blank = await service.generateScenesForReviewedScript({
          prompt: "City derby",
          title: "T",
          narration: "   ",
          voiceoverDurationMs: 12000,
          sceneCount: 3,
        });
        assert.equal(blank.success, false);

        pathCount += 1;
      },
    ],
  ]);
  assert.equal(pathCount, 3);

  console.log(
    `\nGolden matrix summary — modes: ${modeCount}, templates: ${templateCount}, ` +
      `strategies: ${strategyCount}, generation paths: ${pathCount}, evidence semantic: ${evidenceCount}`,
  );
  console.log("\nAll Hook golden matrix checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
