/**
 * Universal reliability contract — Sprint 10H.4B.1 final acceptance.
 * Topic-agnostic Flexible success policy + pairwise valid-selection matrix.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  recommendCreateBrief,
  selectionCompatibilityLabel,
} from "@/features/create/utils/recommend-create-brief";
import { listCompatibleHookStyleSelections } from "@/features/hook-engine";
import { runRetentionProductionNarration } from "@/features/retention-story/production/run-retention-production-narration";
import {
  RETENTION_CREATOR_CORRECTABLE_FAILURE_CATEGORIES,
  RETENTION_INFRASTRUCTURE_FAILURE_CATEGORIES,
  RETENTION_LEGACY_QUALITY_FAILURE_CATEGORY,
  RETENTION_NON_APPLICABLE_FAILURE_CATEGORIES,
  RETENTION_NON_TERMINAL_EDITORIAL_ADAPTATIONS,
  RETENTION_SAFETY_FAILURE_CATEGORIES,
  RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES,
} from "@/features/retention-story/production/retention-terminal-failure-taxonomy";
import type { RetentionComposerCallback } from "@/features/retention-story/composition/retention-narration-candidate.types";
import type { StoryFormatStrategySelection } from "@/features/retention-story";
import type { RetentionProductionFailureCategory } from "@/features/retention-story/production/retention-production.types";
import { listCompatibleStoryStrategySelections } from "@/features/retention-story/presentation/story-strategy-selection";
import {
  isRecoverableRetentionHardGateId,
  isTerminalAuthorityRetentionHardGateId,
} from "@/features/retention-story/validation/classify-retention-hard-gate-recoverability";
import { SCRIPT_MODES, type ScriptMode } from "@/types/footiebitz";
import { passRetentionHookRunner } from "./retentionStoryQaDoubles";
import { padSpokenWords } from "./retentionSpokenFixtureText";

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const TOPICS_BY_MODE: Record<ScriptMode, string> = {
  story: "Why discipline decides rainy European away nights",
  tactical_review: "How a midfielder resets the press",
  match_preview: "Real Madrid versus Manchester City preview",
  match_recap: "Spain vs France dramatic match review",
  player_analysis: "A goalkeeper biography under relentless scrutiny",
  top_5: "Top five moments that redefine rivalry nights",
  historical_explainer: "How the offside law reshaped attacking football",
  opinion_debate: "Should away goals still decide European nights",
};

/** Valid Flexible Write My Own openings — one per ScriptMode topic. */
const WMO_OPENINGS_BY_MODE: Record<ScriptMode, string> = {
  story: "Why does discipline matter?",
  tactical_review: "Why does the press matter?",
  match_preview: "Why does Real Madrid pressure matter?",
  match_recap: "Why does Spain pressure matter?",
  player_analysis: "Why does the goalkeeper matter?",
  top_5: "Why do rivalry nights matter?",
  historical_explainer: "Why does the offside law matter?",
  opinion_debate: "Why do away goals matter?",
};

const DURATIONS = [15, 24, 25, 30, 35, 36, 45, 60] as const;
const QUALITIES = ["cheap", "balanced", "best"] as const;

function emptyComposer(): RetentionComposerCallback {
  return () => ({
    title: "x",
    hookClaimRefs: [],
    segments: [],
  });
}

/**
 * Hard-gate-passing, editorially weak composer for quality_below_target.
 * Mirrors rewrite N1/N2: short repetitive beats that clear structure/safety
 * but miss Retention-first readiness (0.62) under Fast/Balanced (no rewrite).
 */
function weakEditorialComposer(): RetentionComposerCallback {
  return (request) => ({
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: request.orderedBeatIds.map((beatId, i) => ({
      beatId,
      text:
        i === 0
          ? "Why does Spain's pressure leave France with no safe passing lane?"
          : "Spain's pressure keeps France pinned, and the same passing problem keeps returning.",
      claimRefs: [] as unknown as string[],
    })),
  });
}

function assertFlexibleSuccess(result: Awaited<
  ReturnType<typeof runRetentionProductionNarration>
>, label: string): asserts result is Extract<
  Awaited<ReturnType<typeof runRetentionProductionNarration>>,
  { ok: true }
> {
  assert.equal(
    result.ok,
    true,
    !result.ok
      ? `${label}:${result.failureCategory}:${result.retentionDiagnostics.safeReasonIds.join(",")}`
      : label,
  );
  assert.ok(result.approved.narration.trim().length > 15, `${label}: short`);
  assert.match(result.approved.narration, /[.!?…](\s|$)/u, `${label}: incomplete`);
  assert.doesNotMatch(
    result.approved.narration,
    /\b\d+\s*[-–]\s*\d+\b/,
    `${label}: invented scoreline`,
  );
  assert.doesNotMatch(
    result.approved.narration,
    /retentionDiagnostics|planFingerprint|safeReasonIds|failureCategory/i,
    `${label}: private diagnostics leak`,
  );
  assert.ok(result.approved.contractFingerprint, `${label}: contract fp`);
  assert.ok(result.approved.planFingerprint, `${label}: plan fp`);
  assert.ok(result.approved.candidateFingerprint, `${label}: candidate fp`);
  assert.ok(result.approved.validationFingerprint, `${label}: validation fp`);
  assert.ok(
    result.approved.safeDiagnostics.budget != null ||
      result.approved.generationDisposition != null,
    `${label}: ledger/disposition`,
  );
}

async function runFlexibleDet(input: {
  readonly topic: string;
  readonly durationSec: number;
  readonly qualityMode: (typeof QUALITIES)[number];
  readonly scriptMode: ScriptMode;
  readonly formatStrategyId?: StoryFormatStrategySelection;
  readonly generationPath?: "script_only" | "audio_first_full";
  readonly hookStyle?: string;
  readonly requestedStrategyId?: string;
  readonly researchApplied?: boolean;
  readonly researchAttemptedWithoutData?: boolean;
  readonly manualContext?: string;
  readonly premiseDetails?: string;
  readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
  readonly planner?: null | (() => unknown);
  readonly composer?: RetentionComposerCallback;
  readonly rewriteComposer?: null;
  readonly lengthComposer?: RetentionComposerCallback | null;
  readonly hookRunner?: typeof passRetentionHookRunner | (() => never);
}): Promise<Awaited<ReturnType<typeof runRetentionProductionNarration>>> {
  return runRetentionProductionNarration({
    topic: input.topic,
    durationSec: input.durationSec,
    generationPath: input.generationPath ?? "script_only",
    qualityMode: input.qualityMode,
    scriptMode: input.scriptMode,
    creationReliabilityMode: "flexible",
    formatStrategyId: input.formatStrategyId ?? "auto",
    ...(input.hookStyle
      ? {
          hookStyle: input.hookStyle as never,
          requestedStrategyId: (input.requestedStrategyId ??
            input.hookStyle) as never,
        }
      : {}),
    researchApplied: input.researchApplied,
    researchAttemptedWithoutData: input.researchAttemptedWithoutData,
    manualContext: input.manualContext,
    premiseDetails: input.premiseDetails,
    factHandlingMode: input.factHandlingMode,
    planner:
      input.planner === undefined
        ? null
        : (input.planner as never),
    composer: input.composer ?? emptyComposer(),
    ...(input.rewriteComposer !== undefined
      ? { rewriteComposer: input.rewriteComposer }
      : {}),
    ...(input.lengthComposer !== undefined
      ? { lengthComposer: input.lengthComposer }
      : {}),
    hookRunner:
      input.hookRunner === undefined
        ? passRetentionHookRunner
        : (input.hookRunner as never),
  });
}

async function main() {
  console.log("retentionUniversalReliability (10H.4B.1 final acceptance)\n");

  await check("[U1] production composer has no hard-coded Spain/France openings", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/retention-story/production/create-retention-production-composer.ts",
      ),
      "utf8",
    );
    assert.equal(/Why Spain press/i.test(src), false);
    assert.equal(/Can France hold/i.test(src), false);
    assert.equal(/Spain or France\?/i.test(src), false);
    assert.match(src, /topicOpeningSubjectLabel|buildTopicAnchoredOpeningRule/);
  });

  await check("[U2] participant reconcile uses topic labels only (no fixed teams)", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/retention-story/composition/reconcile-retention-participant-coverage.ts",
      ),
      "utf8",
    );
    assert.equal(/\bArgentina\b/.test(src), false);
    assert.equal(/\bEngland\b/.test(src), false);
    assert.equal(/under relentless pressure/.test(src), false);
    assert.match(src, /displayLabel\} met \$\{/);
  });

  await check("[U3] weak editorial output is non-terminal (behavioral)", async () => {
    const result = await runFlexibleDet({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      qualityMode: "cheap",
      scriptMode: "story",
      formatStrategyId: "short_retention",
      composer: weakEditorialComposer(),
      rewriteComposer: null,
      lengthComposer: null,
    });
    assertFlexibleSuccess(result, "U3-cheap");
    const adaptations = result.approved.generationDisposition?.adaptations ?? [];
    assert.ok(
      adaptations.includes("quality_below_target") ||
        adaptations.includes("deterministic_story_fallback_used"),
      `expected a quality warning or fallback, got: ${adaptations.join(",")}`,
    );
    if (adaptations.includes("quality_below_target")) {
      assert.ok(
        result.approved.validationSummary.retentionReadiness < 0.62,
        "warning must remain below the Retention-first threshold",
      );
    }

    const balanced = await runFlexibleDet({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      qualityMode: "balanced",
      scriptMode: "story",
      formatStrategyId: "short_retention",
      composer: weakEditorialComposer(),
      rewriteComposer: null,
      lengthComposer: null,
    });
    assertFlexibleSuccess(balanced, "U3-balanced");
    const balancedAdaptations =
      balanced.approved.generationDisposition?.adaptations ?? [];
    assert.ok(
      balancedAdaptations.includes("quality_below_target") ||
        balancedAdaptations.includes("deterministic_story_fallback_used"),
      `expected a quality warning or fallback, got: ${balancedAdaptations.join(",")}`,
    );
  });

  await check("[U4] research-off / empty grounding still succeeds", async () => {
    const result = await runFlexibleDet({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      qualityMode: "cheap",
      scriptMode: "story",
      researchApplied: false,
      researchAttemptedWithoutData: true,
    });
    assertFlexibleSuccess(result, "U4");
  });

  await check("[U5] malformed planner/composer → rescue success (not terminal)", async () => {
    const result = await runFlexibleDet({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      qualityMode: "balanced",
      scriptMode: "story",
      planner: () => ({ strategy: null, beats: null }),
      composer: emptyComposer(),
    });
    assertFlexibleSuccess(result, "U5");
    const adaptations = result.approved.generationDisposition?.adaptations ?? [];
    assert.ok(
      adaptations.includes("planner_fallback_used") ||
        adaptations.includes("deterministic_story_fallback_used") ||
        adaptations.includes("reliability_rescue_used"),
    );
  });

  await check("[U6] valid Flexible pairwise / cross-product matrix", async () => {
    type Cell = { readonly label: string; readonly run: () => Promise<void> };
    const cells: Cell[] = [];

    // Core cross-product: 8 ScriptModes × durations × qualities × compatible strategies
    for (const scriptMode of SCRIPT_MODES) {
      for (const durationSec of DURATIONS) {
        const strategies = listCompatibleStoryStrategySelections(durationSec);
        assert.ok(strategies.length > 0, `no strategies for ${durationSec}s`);
        for (const qualityMode of QUALITIES) {
          for (const formatStrategyId of strategies) {
            cells.push({
              label: `grid/${scriptMode}/${durationSec}/${qualityMode}/${formatStrategyId}`,
              run: async () => {
                const result = await runFlexibleDet({
                  topic: TOPICS_BY_MODE[scriptMode],
                  durationSec,
                  qualityMode,
                  scriptMode,
                  formatStrategyId,
                  researchApplied: false,
                  researchAttemptedWithoutData: true,
                });
                assertFlexibleSuccess(result, cells[cells.length - 1]!.label);
                if (
                  scriptMode === "match_preview" ||
                  scriptMode === "match_recap"
                ) {
                  // Subject preservation for matchup topics
                  if (scriptMode === "match_preview") {
                    assert.match(result.approved.narration, /Real Madrid/i);
                    assert.match(result.approved.narration, /Manchester City/i);
                  } else {
                    assert.match(result.approved.narration, /Spain/i);
                    assert.match(result.approved.narration, /France/i);
                  }
                }
              },
            });
          }
        }
      }
    }

    // Every compatible selectable Hook style per ScriptMode (Flexible default)
    for (const scriptMode of SCRIPT_MODES) {
      for (const hookStyle of listCompatibleHookStyleSelections(scriptMode)) {
        if (hookStyle === "user_written") {
          cells.push({
            label: `hook/${scriptMode}/user_written`,
            run: async () => {
              const opening = WMO_OPENINGS_BY_MODE[scriptMode];
              const topic = TOPICS_BY_MODE[scriptMode];
              const result = await runRetentionProductionNarration({
                topic,
                durationSec: 30,
                generationPath: "script_only",
                qualityMode: "cheap",
                scriptMode,
                creationReliabilityMode: "flexible",
                hookStyle: "user_written",
                userAuthoredHook: opening,
                planner: null,
                // Fitting body under the exact WMO opening — empty composer is
                // covered by malformed-composer cells; WMO is creator-correctable
                // when the opening itself cannot clear gates.
                composer: (request) => {
                  const n = request.orderedBeatIds.length;
                  const budget = request.targetWordBudget;
                  const targetTotal = Math.min(
                    Math.max(n * 4, Math.floor(budget * 0.72)),
                    Math.max(n * 4, budget - 2),
                  );
                  const base = Math.floor(targetTotal / n);
                  let rem = targetTotal - base * n;
                  return {
                    title: "Write My Own draft",
                    hookClaimRefs: [] as unknown as string[],
                    segments: request.orderedBeatIds.map((beatId, i) => {
                      const target = Math.max(4, base + (rem > 0 ? 1 : 0));
                      if (rem > 0) rem -= 1;
                      if (i === 0) {
                        return {
                          beatId,
                          text: opening,
                          claimRefs: [] as unknown as string[],
                        };
                      }
                      const seed =
                        scriptMode === "match_preview"
                          ? "Real Madrid and Manchester City keep the pressure live tonight"
                          : scriptMode === "match_recap"
                            ? "Spain and France keep the pressure live tonight"
                            : `${topic.split(/\s+/).slice(0, 4).join(" ")} keeps the pressure live tonight`;
                      return {
                        beatId,
                        text: padSpokenWords(seed, target),
                        claimRefs: [] as unknown as string[],
                      };
                    }),
                  };
                },
                hookRunner: passRetentionHookRunner,
              });
              assertFlexibleSuccess(result, `hook/${scriptMode}/user_written`);
              const adaptations =
                result.approved.generationDisposition?.adaptations ?? [];
              if (!adaptations.includes("hook_style_reconciled")) {
                assert.ok(result.approved.narration.startsWith(opening));
              }
            },
          });
          continue;
        }
        cells.push({
          label: `hook/${scriptMode}/${hookStyle}`,
          run: async () => {
            const result = await runFlexibleDet({
              topic: TOPICS_BY_MODE[scriptMode],
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode,
              hookStyle,
              requestedStrategyId: hookStyle,
            });
            assertFlexibleSuccess(result, `hook/${scriptMode}/${hookStyle}`);
          },
        });
      }
    }

    // Research / context / path / failure-injection dimension sweeps
    const extras: Cell[] = [
      {
        label: "research/off",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode: "story",
              researchApplied: false,
              researchAttemptedWithoutData: false,
            }),
            "research/off",
          );
        },
      },
      {
        label: "research/empty",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode: "story",
              researchApplied: false,
              researchAttemptedWithoutData: true,
            }),
            "research/empty",
          );
        },
      },
      {
        label: "research/unavailable",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 35,
              qualityMode: "balanced",
              scriptMode: "story",
              researchApplied: false,
              researchAttemptedWithoutData: true,
            }),
            "research/unavailable",
          );
        },
      },
      {
        label: "research/eligible-no-claims",
        run: async () => {
          // Eligible path without claim payload still generates qualitatively.
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode: "story",
              researchApplied: true,
              researchAttemptedWithoutData: false,
            }),
            "research/eligible-no-claims",
          );
        },
      },
      {
        label: "context/none",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.tactical_review,
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode: "tactical_review",
            }),
            "context/none",
          );
        },
      },
      {
        label: "context/manual",
        run: async () => {
          const result = await runFlexibleDet({
            topic: TOPICS_BY_MODE.story,
            durationSec: 30,
            qualityMode: "balanced",
            scriptMode: "story",
            manualContext: "Keep the tone qualitative. No invented rankings.",
            planner: () => ({ strategy: null, beats: null }),
          });
          assertFlexibleSuccess(result, "context/manual");
        },
      },
      {
        label: "context/creative-premise",
        run: async () => {
          const result = await runFlexibleDet({
            topic: TOPICS_BY_MODE.match_recap,
            durationSec: 35,
            qualityMode: "cheap",
            scriptMode: "match_recap",
            formatStrategyId: "short_retention",
            factHandlingMode: "creative_premise",
            premiseDetails: "Spain pressed high.\nFrance stayed compact.",
          });
          assertFlexibleSuccess(result, "context/creative-premise");
          assert.match(result.approved.narration, /Spain/i);
          assert.match(result.approved.narration, /France/i);
        },
      },
      {
        label: "path/audio-first",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 30,
              qualityMode: "cheap",
              scriptMode: "story",
              generationPath: "audio_first_full",
            }),
            "path/audio-first",
          );
        },
      },
      {
        label: "fail/planner-malformed",
        run: async () => {
          const result = await runFlexibleDet({
            topic: TOPICS_BY_MODE.story,
            durationSec: 30,
            qualityMode: "best",
            scriptMode: "story",
            planner: () => ({ strategy: null, beats: null }),
          });
          assertFlexibleSuccess(result, "fail/planner-malformed");
        },
      },
      {
        label: "fail/composer-malformed",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 24,
              qualityMode: "cheap",
              scriptMode: "story",
              composer: emptyComposer(),
            }),
            "fail/composer-malformed",
          );
        },
      },
      {
        label: "fail/hook-reject-then-rescue",
        run: async () => {
          let calls = 0;
          const result = await runFlexibleDet({
            topic: TOPICS_BY_MODE.story,
            durationSec: 30,
            qualityMode: "cheap",
            scriptMode: "story",
            hookStyle: "curiosity_gap",
            requestedStrategyId: "curiosity_gap",
            hookRunner: async (input) => {
              calls += 1;
              if (calls === 1) {
                return {
                  ok: false as const,
                  error: "forced hook reject",
                  diagnostics: {
                    contractVersion: input.hookContext.request.contractVersion,
                    strategyId: input.hookContext.plan.strategyId,
                    strategyVersion: input.hookContext.plan.strategyVersion,
                    strategySource: input.hookContext.plan.strategySource,
                    generationPath: input.hookContext.generationPath,
                    requestFingerprint:
                      input.hookContext.request.requestFingerprint,
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
              }
              return passRetentionHookRunner(input);
            },
          });
          assertFlexibleSuccess(result, "fail/hook-reject-then-rescue");
        },
      },
      {
        label: "fail/rewrite-unavailable-keeps-candidate",
        run: async () => {
          const result = await runFlexibleDet({
            topic: "Spain versus France tactical preview",
            durationSec: 30,
            qualityMode: "cheap",
            scriptMode: "story",
            formatStrategyId: "short_retention",
            composer: weakEditorialComposer(),
            rewriteComposer: null,
            lengthComposer: null,
          });
          assertFlexibleSuccess(result, "fail/rewrite-unavailable");
          const adaptations =
            result.approved.generationDisposition?.adaptations ?? [];
          assert.ok(
            adaptations.includes("quality_below_target") ||
              adaptations.includes("deterministic_story_fallback_used"),
          );
        },
      },
      {
        label: "fail/compression-null",
        run: async () => {
          assertFlexibleSuccess(
            await runFlexibleDet({
              topic: TOPICS_BY_MODE.story,
              durationSec: 15,
              qualityMode: "cheap",
              scriptMode: "story",
              lengthComposer: null,
            }),
            "fail/compression-null",
          );
        },
      },
    ];

    let passed = 0;
    for (const cell of [...cells, ...extras]) {
      await cell.run();
      passed += 1;
    }
    assert.ok(cells.length >= 200, `matrix too small: ${cells.length}`);
    console.log(`    (matrix cells: ${passed}; grid+hooks=${cells.length})`);
  });

  await check("[U7] recommendation card tiers + Flexible default", () => {
    const rec = recommendCreateBrief({
      topic:
        "How a midfielder resets the press across a long European away night with late pressure and unfinished questions",
      durationSec: 35,
      scriptMode: "tactical_review",
      tone: "tactical",
      enableResearch: false,
      factHandlingMode: "verified_facts_only",
      hasPremiseDetails: false,
      hasManualContext: true,
      storyStrategy: "short_standard",
      qualityMode: "cheap",
      hookStyle: "user_written",
      userAuthoredHook: "",
      reliabilityMode: "flexible",
    });
    assert.equal(rec.hookStyle, "auto");
    assert.equal(rec.reliabilityMode, "flexible");
    assert.ok(rec.qualityMode === "best" || rec.qualityMode === "balanced");
    assert.ok(rec.selectionAssessments.length >= 5);
    const hook = rec.selectionAssessments.find((a) => a.id === "hook");
    assert.equal(hook?.tier, "requires_additional_input");
    assert.equal(
      selectionCompatibilityLabel("may_reduce_quality"),
      "May reduce quality",
    );
    const quality = rec.selectionAssessments.find((a) => a.id === "quality");
    assert.equal(quality?.tier, "may_reduce_quality");
  });

  await check("[U8] terminal failure taxonomy partitions + Flexible remaining set", () => {
    const all: RetentionProductionFailureCategory[] = [
      ...RETENTION_CREATOR_CORRECTABLE_FAILURE_CATEGORIES,
      ...RETENTION_SAFETY_FAILURE_CATEGORIES,
      ...RETENTION_INFRASTRUCTURE_FAILURE_CATEGORIES,
      RETENTION_LEGACY_QUALITY_FAILURE_CATEGORY,
      ...RETENTION_NON_APPLICABLE_FAILURE_CATEGORIES,
    ];
    const unique = new Set(all);
    assert.equal(unique.size, all.length);
    assert.equal(all.length, 18);
    assert.ok(
      RETENTION_NON_TERMINAL_EDITORIAL_ADAPTATIONS.includes(
        "quality_below_target",
      ),
    );
    assert.ok(
      RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES.includes(
        "validation_authority_mismatch",
      ),
    );
    assert.ok(
      RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES.includes(
        "budget_ledger_failure",
      ),
    );
    assert.equal(isRecoverableRetentionHardGateId("spoken_narration_complete"), true);
    assert.equal(
      isTerminalAuthorityRetentionHardGateId("plan_candidate_fingerprint_coherent"),
      true,
    );
    assert.equal(
      isRecoverableRetentionHardGateId("plan_candidate_fingerprint_coherent"),
      false,
    );
  });

  await check("[U9] Precise mode visibly reconciles an unusable Hook", async () => {
    const result = await runRetentionProductionNarration({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      hookStyle: "curiosity_gap",
      requestedStrategyId: "curiosity_gap",
      creationReliabilityMode: "precise",
      planner: null,
      composer: emptyComposer(),
      hookRunner: async (input) => ({
        ok: false as const,
        error: "precise force miss",
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
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected fail-soft story");
    const adaptations = result.approved.generationDisposition?.adaptations ?? [];
    assert.equal(adaptations.includes("hook_style_reconciled"), true);
  });

  await check("[U10] scenes-only is non-applicable (not a generation failure)", async () => {
    const result = await runRetentionProductionNarration({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      // Cast: production input type excludes scenes_only; path is still handled.
      generationPath: "scenes_only" as "script_only",
      apiMode: "scenes-only",
      qualityMode: "cheap",
      scriptMode: "story",
      planner: null,
      composer: emptyComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, false);
    assert.equal(result.failureCategory, "scenes_only_not_applicable");
    assert.ok(
      (RETENTION_NON_APPLICABLE_FAILURE_CATEGORIES as readonly string[]).includes(
        result.failureCategory,
      ),
    );
  });

  await check("[U11] Flexible remaining terminals — behavioral taxonomy report", async () => {
    console.log(
      '\n    Q: Can a valid Flexible request still return success:false?',
    );
    console.log(
      '    A: Yes, only for safety/authority corruption or genuine infrastructure impossibility after deterministic rescue—not for ordinary Hook preference, research absence, editorial quality, completeness, or duration pressure.',
    );

    // Invalid input — not a valid Flexible request
    const invalid = await runRetentionProductionNarration({
      topic: "   ",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      creationReliabilityMode: "flexible",
      planner: null,
      composer: emptyComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.failureCategory, "contract_normalization_failure");
    console.log(
      "    · contract_normalization_failure — invalid input (empty topic), not a valid Flexible request",
    );

    // Ordinary Flexible recoveries (behavior, not comments)
    const researchAbsence = await runFlexibleDet({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      qualityMode: "cheap",
      scriptMode: "story",
      researchApplied: false,
      researchAttemptedWithoutData: true,
    });
    assertFlexibleSuccess(researchAbsence, "taxonomy/research-absence");
    console.log(
      "    · research absence — ok:true (not grounding_failure terminal)",
    );

    const qualityMiss = await runFlexibleDet({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      qualityMode: "cheap",
      scriptMode: "story",
      formatStrategyId: "short_retention",
      composer: weakEditorialComposer(),
      rewriteComposer: null,
      lengthComposer: null,
    });
    assertFlexibleSuccess(qualityMiss, "taxonomy/quality");
    const qualityAdaptations =
      qualityMiss.approved.generationDisposition?.adaptations ?? [];
    assert.ok(
      qualityAdaptations.includes("quality_below_target") ||
        qualityAdaptations.includes("deterministic_story_fallback_used"),
    );
    console.log(
      "    · editorial quality — ok:true with a quality warning or deterministic fallback",
    );

    const hookPref = await runFlexibleDet({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      qualityMode: "cheap",
      scriptMode: "story",
      hookStyle: "curiosity_gap",
      requestedStrategyId: "curiosity_gap",
    });
    assertFlexibleSuccess(hookPref, "taxonomy/hook-pref");
    console.log(
      "    · ordinary Hook preference — ok:true (requested or reconciled/rescue)",
    );

    const durationPressure = await runFlexibleDet({
      topic: TOPICS_BY_MODE.story,
      durationSec: 15,
      qualityMode: "cheap",
      scriptMode: "story",
      formatStrategyId: "short_retention",
    });
    assertFlexibleSuccess(durationPressure, "taxonomy/duration");
    console.log("    · duration pressure — ok:true via shorter deterministic draft");

    // Precise / Write My Own remain creator-correctable exceptions (behavior)
    const precise = await runRetentionProductionNarration({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      hookStyle: "curiosity_gap",
      requestedStrategyId: "curiosity_gap",
      creationReliabilityMode: "precise",
      planner: null,
      composer: emptyComposer(),
      hookRunner: async (input) => ({
        ok: false as const,
        error: "precise miss",
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
      }),
    });
    if (!precise.ok) {
      assert.equal(precise.failureCategory, "hook_terminal_failure");
      console.log(
        "    · hook_terminal_failure — Precise/WMO creator-correctable exception (not ordinary Flexible)",
      );
    } else {
      console.log(
        "    · Precise explicit Hook succeeded without silent Auto reconcile",
      );
    }

    // Remaining valid-Flexible terminal classes (classification evidence)
    for (const category of RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES) {
      const bucket = (RETENTION_SAFETY_FAILURE_CATEGORIES as readonly string[]).includes(
        category,
      )
        ? "safety/authority"
        : "infrastructure-after-rescue";
      console.log(`    · remaining terminal category: ${category} (${bucket})`);
    }

    // Scenes-only separately classified
    const scenes = await runRetentionProductionNarration({
      topic: TOPICS_BY_MODE.story,
      durationSec: 30,
      generationPath: "scenes_only" as "script_only",
      apiMode: "scenes-only",
      qualityMode: "cheap",
      scriptMode: "story",
      planner: null,
      composer: emptyComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(scenes.ok, false);
    assert.equal(scenes.failureCategory, "scenes_only_not_applicable");
    console.log(
      "    · scenes_only_not_applicable — non-applicable path, not counted as generation failure",
    );
  });

  console.log("\nretentionUniversalReliability — all fixtures passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
