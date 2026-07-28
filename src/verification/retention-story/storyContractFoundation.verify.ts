/**
 * Sprint 10B / 10B.1 / 10B.1A / 10B.1B — Story Contract + Format Strategy + Grounding Authority verification.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type {
  GraphContext,
  GraphContextFact,
} from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import {
  RETENTION_MAX_CLAIM_SOURCE_REF_CHARS,
  RETENTION_MAX_GROUNDING_CLAIMS,
  RETENTION_MAX_PI_BEAT_ID_CHARS,
  RETENTION_MAX_PI_FACT_ROLE_CHARS,
  RETENTION_RESEARCH_FINGERPRINT_PREFIX,
  RETENTION_RESEARCH_IDENTITY_PATTERN,
  RETENTION_STORY_CONTRACT_VERSION,
  RETENTION_TRUSTED_PROVIDER_SOURCES,
  RetentionStoryError,
  assertRetentionFormatStrategyProductionCapable,
  buildRetentionContentDerivedClaimId,
  buildRetentionGroundingContext,
  buildRetentionSemanticIdentity,
  finalizeRetentionGroundingClaims,
  listRetentionFormatStrategyProfiles,
  mapRetentionSourceToAuthority,
  normalizeRetentionGroundingContext,
  normalizeStoryContract,
  resolveRetentionGenerationPath,
  resolveStoryDurationClass,
  type RetentionGroundingClaimDraft,
  type StoryContractInput,
} from "@/features/retention-story";
import { SCRIPT_MODES, type QualityMode, type Tone } from "@/types/footiebitz";

/** Production-built opaque research identity for zero-claim fixtures. */
function productionOpaqueResearchIdentity(seed: string): string {
  const identity = buildRetentionSemanticIdentity(
    { kind: "opaque_research_fixture", seed },
    RETENTION_RESEARCH_FINGERPRINT_PREFIX,
  );
  assert.match(identity, RETENTION_RESEARCH_IDENTITY_PATTERN);
  return identity;
}

const ROOT = path.resolve(__dirname, "../..");
const MODULE_ROOT = path.join(ROOT, "features/retention-story");

let passed = 0;

function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function baseInput(
  overrides: Partial<StoryContractInput> = {},
): StoryContractInput {
  return {
    topic: "Messi World Cup legacy",
    durationSec: 30,
    generationPath: "script_only",
    ...overrides,
  };
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function minimalGraph(): GraphContext {
  return {
    queryId: "q-ignored-1",
    topic: "test",
    selectedMode: "story",
    primaryEntities: [],
    verifiedFacts: [
      {
        id: "gf-1",
        text: "Player scored 7 goals in the tournament.",
        type: "statistic",
        confidence: { tier: "high", percent: 90 },
        provenance: { source: "api-football", fetchedAt: "2026-01-01T00:00:00.000Z" },
      },
    ],
    rankedFacts: [],
    timelineFacts: [],
    statisticFacts: [
      {
        id: "gf-stat-1",
        text: "Shot accuracy was 62%.",
        type: "statistic",
        confidence: { tier: "high", percent: 80 },
        provenance: { source: "api-football" },
      },
    ],
    fixtureFacts: [],
    entitySummaries: [],
    relationshipSummaries: [],
    groundingRules: [],
    warnings: [],
    confidence: { tier: "high", percent: 80 },
    provenance: { source: "api-football", fetchedAt: "2099-01-01T00:00:00.000Z" },
    diagnostics: {
      nodeCount: 0,
      edgeCount: 0,
      factCount: 2,
      verifiedFactCount: 1,
      rankedFactCount: 0,
      timelineFactCount: 0,
      statisticFactCount: 1,
      fixtureFactCount: 0,
      entitySummaryCount: 0,
      relationshipSummaryCount: 0,
      providerDiagnostics: [],
    },
  };
}

function minimalAssembled(): AssembledContext {
  return {
    queryId: "q-assembled-ignored",
    topic: "test",
    selectedMode: "top_5",
    intent: {
      intent: "ranking",
      subIntent: "top_scorers",
      confidence: "high",
      confidencePercent: 90,
      confidenceScore: 0.9,
      matchedPatterns: [],
      reasoning: "test",
      topic: { raw: "test", normalized: "test", tokens: ["test"] },
    } as unknown as AssembledContext["intent"],
    entities: [],
    verifiedFacts: [
      {
        id: "af-1",
        text: "Ranked player A leads the table.",
        provenance: { source: "api-football", fetchedAt: "2020-01-01T00:00:00.000Z" },
      },
      {
        id: "af-user",
        text: "I think this is underrated.",
        provenance: { source: "user" },
      },
      {
        id: "af-inferred",
        text: "Likely to transfer next summer.",
        provenance: { source: "inferred" },
      },
    ],
    rankings: [
      {
        metric: "goals",
        limit: 2,
        entries: [
          { rank: 1, label: "Player A", value: 20, entityId: "a" },
          { rank: 2, label: "Player B", value: 18, entityId: "b" },
        ],
      },
    ],
    fixtures: [
      {
        id: 99,
        date: "2026-06-01",
        league: "Test League",
        homeTeam: "Home FC",
        awayTeam: "Away United",
        homeGoals: 2,
        awayGoals: 1,
      },
    ],
    statistics: [{ team: "Home FC", type: "possession", value: "58%" }],
    events: [
      {
        minute: 12,
        team: "Home FC",
        player: "Striker",
        type: "Goal",
        detail: "Normal Goal",
      },
    ],
    lineups: [
      {
        team: "Home FC",
        formation: "4-3-3",
        startingXi: ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "ST", "LW"],
        substitutes: ["Sub1"],
      },
    ],
    manualNotes: "Creator note: emphasize rivalry.",
    warnings: [],
    confidence: { tier: "medium", percent: 70 },
    provenance: { source: "api-football", fetchedAt: "2099-06-01T00:00:00.000Z" },
    promptSections: [],
    diagnostics: [],
  };
}

function minimalPlan(): NarrativePlan {
  return {
    structure: "countdown_ranked_reveal",
    structureLabel: "Ranked reveal",
    beats: [
      {
        id: "beat-open",
        label: "Open",
        purpose: "hook",
        targetWordCount: 12,
        requiredFactIds: ["af-1"],
        tone: "dramatic",
        openingHook: true,
      },
    ],
    requiredFacts: ["af-1"],
    optionalFacts: ["gf-stat-1"],
    forbiddenClaims: ["best player of all time"],
    modeSpecificRules: [],
    openingIntent: { kind: "evidence_led_surprise", factIds: ["af-1"] },
  };
}

console.log("\nstory-contract-foundation (Sprint 10B)\n");

// --- Contract normalization ---
console.log("contract-normalization");
check("raw minimum input", () => {
  const n = normalizeStoryContract(baseInput());
  assert.equal(n.version, RETENTION_STORY_CONTRACT_VERSION);
  assert.equal(n.durationSec, 30);
  assert.equal(n.formatStrategyId, "short_retention");
  assert.equal(n.qualityMode, "balanced");
  assert.equal(n.tone, "dramatic");
  assert.equal(n.audienceIntent, "general_audience");
  assert.equal(n.desiredReaction, "curiosity");
  assert.equal(n.generationPath, "script_only");
  assert.equal(n.constraints.forbidGenericIntro, true);
  assert.equal(n.constraints.requirePayoff, true);
});

check("all ScriptModes", () => {
  for (const mode of SCRIPT_MODES) {
    const n = normalizeStoryContract(baseInput({ scriptMode: mode }));
    assert.equal(n.scriptMode, mode);
  }
});

check("all Tones", () => {
  const tones: Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];
  for (const tone of tones) {
    assert.equal(normalizeStoryContract(baseInput({ tone })).tone, tone);
  }
});

check("all QualityModes + absence → balanced", () => {
  const modes: QualityMode[] = ["cheap", "balanced", "best"];
  for (const qualityMode of modes) {
    assert.equal(
      normalizeStoryContract(baseInput({ qualityMode })).qualityMode,
      qualityMode,
    );
  }
  assert.equal(
    normalizeStoryContract(baseInput({ qualityMode: undefined })).qualityMode,
    "balanced",
  );
});

check("invalid quality rejected; invalid scriptMode falls back", () => {
  assert.throws(
    () => normalizeStoryContract(baseInput({ qualityMode: "ultra" })),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "invalid_quality_mode",
  );
  assert.equal(
    normalizeStoryContract(baseInput({ scriptMode: "nope" })).scriptMode,
    "story",
  );
});

check("unsupported version rejected", () => {
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ version: "retention-story-contract/0" as never }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "unsupported_contract_version",
  );
});

check("input immutability + deeply frozen result", () => {
  const input = baseInput({ manualContext: "  note  " });
  const snapshot = JSON.stringify(input);
  const n = normalizeStoryContract(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.ok(Object.isFrozen(n));
  assert.ok(Object.isFrozen(n.constraints));
  assert.ok(Object.isFrozen(n.identities));
  assert.ok(Object.isFrozen(n.groundingSummary));
});

check("whitespace / Unicode normalization + bounds", () => {
  const n = normalizeStoryContract(
    baseInput({
      topic: "  Messi\u00A0\u00A0legacy  ",
      manualContext: "a".repeat(10_000),
    }),
  );
  assert.equal(n.topic, "Messi legacy");
  assert.ok((n.identities.manualContextIdentity ?? "").length > 0);
  assert.ok(!n.contractFingerprint.includes("a".repeat(50)));
});

// --- Duration / format ---
console.log("duration-format-strategy");
check("every whole second 15–60 Auto mapping", () => {
  for (let d = 15; d <= 60; d++) {
    const n = normalizeStoryContract(baseInput({ durationSec: d }));
    if (d <= 35) assert.equal(n.formatStrategyId, "short_retention", String(d));
    else assert.equal(n.formatStrategyId, "extended_short", String(d));
  }
});

check("duration classes at boundaries", () => {
  assert.equal(resolveStoryDurationClass(15), "ultra_short");
  assert.equal(resolveStoryDurationClass(24), "ultra_short");
  assert.equal(resolveStoryDurationClass(25), "short");
  assert.equal(resolveStoryDurationClass(35), "short");
  assert.equal(resolveStoryDurationClass(36), "extended");
  assert.equal(resolveStoryDurationClass(60), "extended");
});

check("explicit valid strategies", () => {
  assert.equal(
    normalizeStoryContract(
      baseInput({ durationSec: 30, formatStrategyId: "short_retention" }),
    ).formatStrategyId,
    "short_retention",
  );
  assert.equal(
    normalizeStoryContract(
      baseInput({ durationSec: 30, formatStrategyId: "short_standard" }),
    ).formatStrategyId,
    "short_standard",
  );
  assert.equal(
    normalizeStoryContract(
      baseInput({ durationSec: 45, formatStrategyId: "extended_short" }),
    ).formatStrategyId,
    "extended_short",
  );
});

check("explicit incompatible + unknown + long-form rejected", () => {
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ durationSec: 45, formatStrategyId: "short_retention" }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "incompatible_format_strategy",
  );
  assert.throws(
    () =>
      normalizeStoryContract(baseInput({ formatStrategyId: "mystery" as never })),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "unknown_format_strategy",
  );
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ formatStrategyId: "long_form_explainer" }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "long_form_not_supported",
  );
  const cap = assertRetentionFormatStrategyProductionCapable("long_form_documentary");
  assert.equal(cap.ok, false);
});

check("immutable profile registry present", () => {
  const profiles = listRetentionFormatStrategyProfiles();
  assert.ok(profiles.length >= 5);
  assert.ok(Object.isFrozen(profiles));
});

// --- Generation paths ---
console.log("generation-paths");
check("path mappings + missing api → full", () => {
  assert.equal(resolveRetentionGenerationPath({}), "audio_first_full");
  assert.equal(
    resolveRetentionGenerationPath({ apiMode: "script-only" }),
    "script_only",
  );
  assert.equal(
    resolveRetentionGenerationPath({ apiMode: "scenes-only" }),
    "scenes_only",
  );
  assert.equal(
    normalizeStoryContract(baseInput({ apiMode: "full", generationPath: undefined }))
      .generationPath,
    "audio_first_full",
  );
});

check("matching dual ok; mismatch rejected; scenes-only normalizes", () => {
  const n = normalizeStoryContract(
    baseInput({ generationPath: "scenes_only", apiMode: "scenes-only" }),
  );
  assert.equal(n.generationPath, "scenes_only");
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ generationPath: "script_only", apiMode: "full" }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "generation_path_mismatch",
  );
});

// --- Hook identity ---
console.log("hook-identity");
check("auto / selectable / user_written", () => {
  assert.equal(
    normalizeStoryContract(baseInput({ hookStyle: "auto" })).identities
      .hookStyleIdentity,
    "auto",
  );
  assert.equal(
    normalizeStoryContract(baseInput({ hookStyle: "cold_open" })).identities
      .hookStyleIdentity,
    "cold_open",
  );
  const uw = normalizeStoryContract(
    baseInput({ hookStyle: "user_written", userAuthoredHook: "Wait for it." }),
  );
  assert.ok(uw.identities.userAuthoredHookIdentity);
});

check("missing user_written / internal / unknown rejected", () => {
  assert.throws(
    () => normalizeStoryContract(baseInput({ hookStyle: "user_written" })),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "missing_user_authored_hook",
  );
  assert.throws(
    () => normalizeStoryContract(baseInput({ hookStyle: "evidence_surprise" })),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "invalid_hook_style",
  );
  assert.throws(
    () => normalizeStoryContract(baseInput({ hookStyle: "not_a_style" })),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "invalid_hook_style",
  );
});

check("hook style / user text change invalidates fingerprint", () => {
  const a = normalizeStoryContract(baseInput({ hookStyle: "auto" }));
  const b = normalizeStoryContract(baseInput({ hookStyle: "cold_open" }));
  assert.notEqual(a.contractFingerprint, b.contractFingerprint);
  const c = normalizeStoryContract(
    baseInput({ hookStyle: "user_written", userAuthoredHook: "One" }),
  );
  const d = normalizeStoryContract(
    baseInput({ hookStyle: "user_written", userAuthoredHook: "Two" }),
  );
  assert.notEqual(c.contractFingerprint, d.contractFingerprint);
});

check("userAuthoredHook ignored unless user_written", () => {
  const n = normalizeStoryContract(
    baseInput({ hookStyle: "auto", userAuthoredHook: "Should not count" }),
  );
  assert.equal(n.identities.userAuthoredHookIdentity, null);
});

// --- Grounding ---
console.log("grounding");
check("GraphContext provider facts", () => {
  const g = buildRetentionGroundingContext({ graphContext: minimalGraph() });
  assert.ok(g.claims.some((c) => c.claimId === "gf-1" && c.permittedFactualUse));
  assert.ok(
    g.claims
      .filter((c) => c.claimId === "gf-1" || c.claimId === "gf-stat-1")
      .every((c) => c.provenance === "research_graph" && c.permittedFactualUse),
  );
  assert.ok(g.researchIdentity);
});

check("AssembledContext fallback collections + manual/inferred", () => {
  const g = buildRetentionGroundingContext({
    assembledContext: minimalAssembled(),
    narrativePlan: minimalPlan(),
  });
  const byId = new Map(g.claims.map((c) => [c.claimId, c]));
  assert.equal(byId.get("af-1")?.permittedFactualUse, true);
  assert.equal(byId.get("af-user")?.permittedFactualUse, false);
  assert.equal(byId.get("af-user")?.verification, "unverified");
  assert.equal(byId.get("af-inferred")?.provenance, "inferred");
  assert.ok(g.claims.some((c) => c.text.includes("Player A")));
  assert.ok(g.claims.some((c) => c.text.includes("Home FC")));
  assert.ok(g.claims.some((c) => c.forbidden && c.text.includes("best player")));
  assert.ok(byId.get("af-1")?.piFactRole?.includes("required"));
});

check("manual never verified; forbidden never permitted", () => {
  const g = buildRetentionGroundingContext({
    manualContext: "My opinion only",
    narrativePlan: minimalPlan(),
  });
  for (const claim of g.claims) {
    if (claim.provenance === "manual_user") {
      assert.equal(claim.permittedFactualUse, false);
      assert.notEqual(claim.verification, "verified");
    }
    if (claim.forbidden) assert.equal(claim.permittedFactualUse, false);
  }
});

check("duplicate collapse + claim-order independence", () => {
  const a = finalizeRetentionGroundingClaims([
    {
      claimId: "x1",
      text: "Same fact",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
    {
      claimId: "x1",
      text: "Same fact",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
  ]);
  assert.equal(a.claims.length, 1);
  const b = finalizeRetentionGroundingClaims([
    {
      claimId: "b",
      text: "B",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
    {
      claimId: "a",
      text: "A",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
  ]);
  const c = finalizeRetentionGroundingClaims([
    {
      claimId: "a",
      text: "A",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
    {
      claimId: "b",
      text: "B",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
  ]);
  assert.equal(b.researchIdentity, c.researchIdentity);
  assert.deepEqual(
    b.claims.map((x) => x.claimId),
    c.claims.map((x) => x.claimId),
  );
});

check("conflicting same ID fail-closed (restrictive wins)", () => {
  const g = finalizeRetentionGroundingClaims([
    {
      claimId: "dup",
      text: "Shared text",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
    },
    {
      claimId: "dup",
      text: "Shared text",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: false,
      forbidden: false,
    },
  ]);
  assert.equal(g.claims[0]?.permittedFactualUse, false);
  assert.throws(
    () =>
      finalizeRetentionGroundingClaims([
        {
          claimId: "dup2",
          text: "One",
          provenance: "research_provider",
          verification: "verified",
          permittedFactualUse: true,
          forbidden: false,
        },
        {
          claimId: "dup2",
          text: "Two",
          provenance: "research_provider",
          verification: "verified",
          permittedFactualUse: true,
          forbidden: false,
        },
      ]),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "grounding_claim_conflict",
  );
});

check("grounding input not mutated; contract omits claim text", () => {
  const assembled = minimalAssembled();
  const before = JSON.stringify(assembled);
  const grounding = buildRetentionGroundingContext({ assembledContext: assembled });
  assert.equal(JSON.stringify(assembled), before);
  const n = normalizeStoryContract(baseInput({ grounding }));
  assert.equal(n.groundingSummary.claimCount, grounding.claims.length);
  assert.ok(n.groundingSummary.researchIdentity);
  assert.ok(!JSON.stringify(n).includes("Creator note: emphasize rivalry"));
});

check("queryId/fetchedAt do not change research identity", () => {
  const g1 = minimalGraph();
  const g2 = minimalGraph();
  g2.queryId = "different-query";
  g2.provenance = { source: "api-football", fetchedAt: "1999-01-01T00:00:00.000Z" };
  g2.verifiedFacts[0] = {
    ...g2.verifiedFacts[0]!,
    provenance: { source: "api-football", fetchedAt: "1999-01-01T00:00:00.000Z" },
  };
  const a = buildRetentionGroundingContext({ graphContext: g1 });
  const b = buildRetentionGroundingContext({ graphContext: g2 });
  assert.equal(a.researchIdentity, b.researchIdentity);
});

check("semantic claim change changes research identity", () => {
  const g1 = minimalGraph();
  const g2 = minimalGraph();
  g2.verifiedFacts[0] = {
    ...g2.verifiedFacts[0]!,
    text: "Player scored 8 goals in the tournament.",
  };
  const a = buildRetentionGroundingContext({ graphContext: g1 });
  const b = buildRetentionGroundingContext({ graphContext: g2 });
  assert.notEqual(a.researchIdentity, b.researchIdentity);
});

// --- Fingerprints ---
console.log("fingerprints");
check("equivalent semantic input → same fingerprint", () => {
  const a = normalizeStoryContract(
    baseInput({ topic: "  Hello   world ", durationSec: 30.4 }),
  );
  const b = normalizeStoryContract(
    baseInput({ topic: "Hello world", durationSec: 30 }),
  );
  assert.equal(a.contractFingerprint, b.contractFingerprint);
});

check("upstream field changes invalidate contract fingerprint", () => {
  const base = normalizeStoryContract(baseInput());
  const cases: Partial<StoryContractInput>[] = [
    { topic: "Different topic" },
    { durationSec: 45 },
    { scriptMode: "top_5" },
    { tone: "funny" },
    { qualityMode: "best" },
    { templateId: "documentary" },
    { hookStyle: "curiosity_gap" },
    { manualContext: "extra" },
    { userInstructions: "keep short" },
    { formatStrategyId: "short_standard" },
    { generationPath: "audio_first_full" },
    { constraints: { forbidGenericIntro: false, requirePayoff: true } },
  ];
  for (const overrides of cases) {
    const n = normalizeStoryContract(baseInput(overrides));
    assert.notEqual(
      n.contractFingerprint,
      base.contractFingerprint,
      JSON.stringify(overrides),
    );
  }
});

check("fingerprint has no timestamp/raw dump", () => {
  const grounding = buildRetentionGroundingContext({
    assembledContext: minimalAssembled(),
  });
  const n = normalizeStoryContract(
    baseInput({
      grounding,
      manualContext: "SECRET_RAW_CONTEXT_VALUE",
      userInstructions: "SECRET_INSTRUCTIONS",
    }),
  );
  assert.ok(n.contractFingerprint.startsWith("rsc:"));
  assert.ok(!n.contractFingerprint.includes("SECRET_"));
  assert.ok(!n.contractFingerprint.includes("2026"));
  assert.ok(!n.contractFingerprint.includes("q-assembled"));
});

// --- 10B.1 Graph / Assembled provenance ---
console.log("10b1-provenance");

function graphFact(
  overrides: Partial<GraphContextFact> & Pick<GraphContextFact, "id" | "text">,
): GraphContextFact {
  return {
    type: "statistic",
    confidence: { tier: "high", percent: 80 },
    provenance: { source: "api-football" },
    ...overrides,
  };
}

check("Graph fact provenance follows fact.provenance.source", () => {
  const graph = minimalGraph();
  graph.verifiedFacts = [
    graphFact({
      id: "g-provider",
      text: "Provider graph fact",
      provenance: { source: "api-football" },
    }),
    graphFact({
      id: "g-user",
      text: "User graph fact",
      provenance: { source: "user" },
    }),
    graphFact({
      id: "g-inferred",
      text: "Inferred graph fact",
      provenance: { source: "inferred" },
    }),
    graphFact({
      id: "g-assembly",
      text: "Assembly graph fact",
      provenance: { source: "assembly" },
    }),
  ];
  graph.statisticFacts = [
    graphFact({
      id: "g-stat-user",
      text: "User in statisticFacts collection",
      provenance: { source: "user" },
    }),
  ];
  const g = buildRetentionGroundingContext({ graphContext: graph });
  const byId = new Map(g.claims.map((c) => [c.claimId, c]));
  assert.equal(byId.get("g-provider")?.provenance, "research_graph");
  assert.equal(byId.get("g-provider")?.permittedFactualUse, true);
  assert.equal(byId.get("g-user")?.provenance, "manual_user");
  assert.equal(byId.get("g-user")?.permittedFactualUse, false);
  assert.equal(byId.get("g-inferred")?.provenance, "inferred");
  assert.equal(byId.get("g-inferred")?.permittedFactualUse, false);
  assert.equal(byId.get("g-assembly")?.provenance, "inferred");
  assert.equal(byId.get("g-assembly")?.permittedFactualUse, false);
  assert.equal(byId.get("g-stat-user")?.permittedFactualUse, false);
});

check("Assembled bundle provenance controls structured collections", () => {
  const assembled = minimalAssembled();
  assembled.provenance = { source: "user", fetchedAt: "2099-01-01T00:00:00.000Z" };
  assembled.verifiedFacts = [
    {
      id: "af-provider",
      text: "Per-fact provider still verified",
      provenance: { source: "api-football" },
    },
  ];
  const g = buildRetentionGroundingContext({ assembledContext: assembled });
  assert.ok(
    g.claims.some(
      (c) => c.claimId === "af-provider" && c.permittedFactualUse === true,
    ),
  );
  assert.ok(
    g.claims
      .filter((c) => c.sourceRef === "ranking" || c.sourceRef === "fixture")
      .every(
        (c) => c.provenance === "manual_user" && c.permittedFactualUse === false,
      ),
  );
});

check("Empty / unusable Graph falls back to Assembled", () => {
  const emptyGraph = minimalGraph();
  emptyGraph.verifiedFacts = [];
  emptyGraph.statisticFacts = [];
  emptyGraph.rankedFacts = [];
  emptyGraph.fixtureFacts = [];
  emptyGraph.timelineFacts = [];
  const g = buildRetentionGroundingContext({
    graphContext: emptyGraph,
    assembledContext: minimalAssembled(),
  });
  assert.ok(g.claims.some((c) => c.claimId === "af-1"));

  const blankGraph = minimalGraph();
  blankGraph.verifiedFacts = [graphFact({ id: "blank", text: "   " })];
  blankGraph.statisticFacts = [];
  const g2 = buildRetentionGroundingContext({
    graphContext: blankGraph,
    assembledContext: minimalAssembled(),
  });
  assert.ok(g2.claims.some((c) => c.claimId === "af-1"));
});

check("Usable Graph suppresses Assembled provider collections but keeps manual notes", () => {
  const assembled = minimalAssembled();
  assembled.manualNotes = "Keep this creator note";
  const g = buildRetentionGroundingContext({
    graphContext: minimalGraph(),
    assembledContext: assembled,
  });
  assert.ok(g.claims.some((c) => c.claimId === "gf-1"));
  assert.ok(!g.claims.some((c) => c.claimId === "af-1"));
  assert.ok(g.claims.some((c) => c.text.includes("Keep this creator note")));
});

// --- 10B.1 Canonical grounding in normalizeStoryContract ---
console.log("10b1-canonical-grounding");
check("forged eligibility downgraded; tampered identity rejected", () => {
  const forged = normalizeRetentionGroundingContext({
    version: 1,
    researchIdentity: null,
    claims: [
      {
        claimId: "m1",
        text: "Manual forged as verified",
        provenance: "manual_user",
        verification: "verified",
        permittedFactualUse: true,
        forbidden: false,
      },
      {
        claimId: "i1",
        text: "Inferred forged as verified",
        provenance: "inferred",
        verification: "verified",
        permittedFactualUse: true,
        forbidden: false,
      },
      {
        claimId: "f1",
        text: "Forbidden forged permitted",
        provenance: "research_provider",
        verification: "forbidden",
        permittedFactualUse: true,
        forbidden: true,
      },
    ],
  });
  assert.equal(
    forged.claims.find((c) => c.claimId === "m1")?.permittedFactualUse,
    false,
  );
  assert.equal(
    forged.claims.find((c) => c.claimId === "i1")?.permittedFactualUse,
    false,
  );
  assert.equal(
    forged.claims.find((c) => c.claimId === "f1")?.permittedFactualUse,
    false,
  );

  const tampered = productionOpaqueResearchIdentity("tampered-identity");
  assert.notEqual(tampered, forged.researchIdentity);
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({
          grounding: {
            version: 1,
            researchIdentity: tampered,
            claims: forged.claims,
          },
        }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "grounding_identity_mismatch",
  );

  const ok = normalizeStoryContract(
    baseInput({
      grounding: {
        version: 1,
        researchIdentity: forged.researchIdentity,
        claims: forged.claims,
      },
    }),
  );
  assert.equal(ok.groundingSummary.eligibleClaimCount, 0);
  assert.ok(!JSON.stringify(ok).includes("Manual forged as verified"));
});

check("opaque researchIdentity only without claims", () => {
  const opaque = productionOpaqueResearchIdentity("opaque-only");
  const n = normalizeStoryContract(baseInput({ researchIdentity: opaque }));
  assert.equal(n.groundingSummary.claimCount, 0);
  assert.equal(n.groundingSummary.eligibleClaimCount, 0);
  assert.equal(n.identities.researchContextIdentity, opaque);
});

// --- 10B.1 Merge order independence ---
console.log("10b1-merge");
check("same-ID merge order-independent including refs/roles", () => {
  const a: RetentionGroundingClaimDraft = {
    claimId: "same",
    text: "Shared text",
    provenance: "research_provider",
    verification: "verified",
    permittedFactualUse: true,
    forbidden: false,
    sourceRef: "beta",
    piBeatId: "beat-b",
    piFactRole: "optional",
  };
  const b: RetentionGroundingClaimDraft = {
    claimId: "same",
    text: "Shared text",
    provenance: "manual_user",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
    sourceRef: "alpha",
    piBeatId: "beat-a",
    piFactRole: "required",
  };
  const forward = finalizeRetentionGroundingClaims([a, b]);
  const reverse = finalizeRetentionGroundingClaims([b, a]);
  assert.deepEqual(forward.claims[0], reverse.claims[0]);
  assert.equal(forward.researchIdentity, reverse.researchIdentity);
  assert.equal(forward.claims[0]?.provenance, "manual_user");
  assert.equal(forward.claims[0]?.permittedFactualUse, false);
  assert.equal(forward.claims[0]?.sourceRef, "alpha|beta");
  assert.equal(forward.claims[0]?.piBeatId, "beat-a");
  assert.ok(forward.claims[0]?.piFactRole?.includes("optional"));
  assert.ok(forward.claims[0]?.piFactRole?.includes("required"));
});

check("content-derived IDs use structured serialization (delimiter-safe)", () => {
  const id1 = buildRetentionContentDerivedClaimId({
    kind: "content_identity",
    contentIdentity: { kind: "manual_creator", text: "a|b" },
    text: "a|b",
    provenance: "manual_user",
  });
  const id2 = buildRetentionContentDerivedClaimId({
    kind: "content_identity",
    contentIdentity: { kind: "manual_creator", text: "a" },
    text: "a",
    provenance: "manual_user",
  });
  // Delimiter-like content must not collide with structured siblings.
  assert.notEqual(id1, id2);
});

// --- Forbidden-text dominance ---
console.log("10b1-forbidden-dominance");
check("forbidden text dominates provider fact with same semantic text", () => {
  const plan = minimalPlan();
  plan.forbiddenClaims = ["Player scored 7 goals in the tournament."];
  const forward = buildRetentionGroundingContext({
    graphContext: minimalGraph(),
    narrativePlan: plan,
  });
  const reversePlan = { ...plan, forbiddenClaims: [...plan.forbiddenClaims] };
  const draftsForward = finalizeRetentionGroundingClaims([
    {
      claimId: "prov",
      text: "Same semantic claim",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      text: "Same semantic claim",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
      contentIdentity: { kind: "forbidden", text: "Same semantic claim" },
    },
  ]);
  const draftsReverse = finalizeRetentionGroundingClaims([
    {
      text: "Same semantic claim",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
      contentIdentity: { kind: "forbidden", text: "Same semantic claim" },
    },
    {
      claimId: "prov",
      text: "Same semantic claim",
      provenance: "research_graph",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    },
  ]);
  assert.equal(draftsForward.researchIdentity, draftsReverse.researchIdentity);
  assert.ok(
    draftsForward.claims.every((c) => c.forbidden && !c.permittedFactualUse),
  );
  // Whitespace/Unicode equivalent forbidden text
  const unicode = finalizeRetentionGroundingClaims([
    {
      claimId: "p1",
      text: "Best player ever",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      text: "  Best\u00A0player   ever  ",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
    },
  ]);
  assert.ok(unicode.claims.every((c) => c.forbidden));
  // Similar but non-identical remains separate / eligible
  const similar = finalizeRetentionGroundingClaims([
    {
      claimId: "p2",
      text: "Best player ever",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      text: "Best player ever!",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
    },
  ]);
  assert.equal(
    similar.claims.find((c) => c.claimId === "p2")?.permittedFactualUse,
    true,
  );
  void forward;
  void reversePlan;
});

check("identical manual notes + manualContext collapse", () => {
  const assembled = minimalAssembled();
  assembled.manualNotes = "Same creator note";
  const g = buildRetentionGroundingContext({
    assembledContext: assembled,
    manualContext: "Same creator note",
  });
  const manuals = g.claims.filter((c) => c.text === "Same creator note");
  assert.equal(manuals.length, 1);
});

check("claim-cap preserves forbidden and PI-required", () => {
  const drafts: RetentionGroundingClaimDraft[] = [];
  drafts.push({
    claimId: "need-keep-forbidden",
    text: "Avoid this claim",
    provenance: "unknown",
    verification: "forbidden",
    permittedFactualUse: false,
    forbidden: true,
    hasAuthoritativeId: true,
    piFactRole: "forbidden",
  });
  drafts.push({
    claimId: "need-keep-required",
    text: "Required opening fact",
    provenance: "research_provider",
    verification: "verified",
    permittedFactualUse: true,
    forbidden: false,
    hasAuthoritativeId: true,
    piFactRole: "required+opening_intent",
  });
  for (let i = 0; i < RETENTION_MAX_GROUNDING_CLAIMS + 10; i++) {
    drafts.push({
      claimId: `filler-${String(i).padStart(3, "0")}`,
      text: `Filler fact ${i}`,
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    });
  }
  const g = finalizeRetentionGroundingClaims(drafts);
  assert.equal(g.claims.length, RETENTION_MAX_GROUNDING_CLAIMS);
  assert.ok(g.claims.some((c) => c.claimId === "need-keep-forbidden"));
  assert.ok(g.claims.some((c) => c.claimId === "need-keep-required"));
});

// --- Hook Style compatibility ---
console.log("10b1-hook-compat");
check("Hook Style / ScriptMode compatibility", () => {
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ hookStyle: "countdown_tease", scriptMode: "match_recap" }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "incompatible_hook_style",
  );
  assert.equal(
    normalizeStoryContract(
      baseInput({ hookStyle: "countdown_tease", scriptMode: "top_5" }),
    ).identities.hookStyleIdentity,
    "countdown_tease",
  );
  assert.equal(
    normalizeStoryContract(
      baseInput({ hookStyle: "headline_first", scriptMode: "match_recap" }),
    ).identities.hookStyleIdentity,
    "headline_first",
  );
  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({ hookStyle: "cold_open", scriptMode: "tactical_review" }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError && err.reason === "incompatible_hook_style",
  );
  assert.equal(
    normalizeStoryContract(baseInput({ hookStyle: "auto", scriptMode: "match_recap" }))
      .identities.hookStyleIdentity,
    "auto",
  );
});

// --- 10B.1A Research source trust + bounds ---
console.log("10b1a-source-trust");

const SOURCE_TRUST_CASES: Array<{
  source: string | null;
  graphProvenance: string;
  assembledProvenance: string;
  permitted: boolean;
}> = [
  {
    source: "api-football",
    graphProvenance: "research_graph",
    assembledProvenance: "research_provider",
    permitted: true,
  },
  {
    source: "statsbomb",
    graphProvenance: "research_graph",
    assembledProvenance: "research_provider",
    permitted: true,
  },
  {
    source: "static-fallback",
    graphProvenance: "research_graph",
    assembledProvenance: "research_provider",
    permitted: true,
  },
  {
    source: "user",
    graphProvenance: "manual_user",
    assembledProvenance: "manual_user",
    permitted: false,
  },
  {
    source: "manual",
    graphProvenance: "manual_user",
    assembledProvenance: "manual_user",
    permitted: false,
  },
  {
    source: "inferred",
    graphProvenance: "inferred",
    assembledProvenance: "inferred",
    permitted: false,
  },
  {
    source: "assembly",
    graphProvenance: "inferred",
    assembledProvenance: "inferred",
    permitted: false,
  },
  {
    source: "fallback",
    graphProvenance: "unknown",
    assembledProvenance: "unknown",
    permitted: false,
  },
  {
    source: null,
    graphProvenance: "unknown",
    assembledProvenance: "unknown",
    permitted: false,
  },
  {
    source: "future-provider-xyz",
    graphProvenance: "unknown",
    assembledProvenance: "unknown",
    permitted: false,
  },
];

check("trusted provider allowlist is explicit and closed", () => {
  assert.deepEqual([...RETENTION_TRUSTED_PROVIDER_SOURCES].sort(), [
    "api-football",
    "static-fallback",
    "statsbomb",
  ]);
  for (const trusted of RETENTION_TRUSTED_PROVIDER_SOURCES) {
    const g = mapRetentionSourceToAuthority(trusted, "graph");
    const a = mapRetentionSourceToAuthority(trusted, "assembled");
    assert.equal(g.provenance, "research_graph");
    assert.equal(a.provenance, "research_provider");
    assert.equal(g.permittedFactualUse, true);
    assert.equal(a.permittedFactualUse, true);
  }
  const unknownProvider = mapRetentionSourceToAuthority(
    "brand-new-provider",
    "assembled",
  );
  assert.equal(unknownProvider.permittedFactualUse, false);
  assert.equal(unknownProvider.provenance, "unknown");
});

check("Graph facts map every listed source through trust policy", () => {
  for (const row of SOURCE_TRUST_CASES) {
    const graph = minimalGraph();
    graph.verifiedFacts = [
      graphFact({
        id: `g-${row.source ?? "missing"}`,
        text: `Graph fact for ${row.source ?? "missing"}`,
        provenance: row.source
          ? { source: row.source as GraphContextFact["provenance"]["source"] }
          : ({ source: undefined } as unknown as GraphContextFact["provenance"]),
      }),
    ];
    graph.statisticFacts = [];
    const g = buildRetentionGroundingContext({ graphContext: graph });
    const claim = g.claims.find((c) =>
      c.text.includes(`Graph fact for ${row.source ?? "missing"}`),
    );
    assert.ok(claim, `missing claim for graph source ${row.source}`);
    assert.equal(claim!.provenance, row.graphProvenance);
    assert.equal(claim!.permittedFactualUse, row.permitted);
    assert.equal(claim!.verification === "verified", row.permitted);
  }
});

check("Assembled verifiedFacts map every listed source through trust policy", () => {
  for (const row of SOURCE_TRUST_CASES) {
    const assembled = minimalAssembled();
    assembled.rankings = [];
    assembled.fixtures = [];
    assembled.statistics = [];
    assembled.events = [];
    assembled.lineups = [];
    assembled.manualNotes = "";
    assembled.verifiedFacts = [
      {
        id: `af-${row.source ?? "missing"}`,
        text: `Assembled fact for ${row.source ?? "missing"}`,
        provenance: row.source
          ? { source: row.source as "api-football" }
          : ({} as { source: "api-football" }),
      },
    ];
    const g = buildRetentionGroundingContext({ assembledContext: assembled });
    const claim = g.claims.find((c) =>
      c.text.includes(`Assembled fact for ${row.source ?? "missing"}`),
    );
    assert.ok(claim, `missing claim for assembled source ${row.source}`);
    assert.equal(claim!.provenance, row.assembledProvenance);
    assert.equal(claim!.permittedFactualUse, row.permitted);
  }
});

check("Assembled rankings/fixtures/statistics/events/lineups follow bundle trust", () => {
  const untrustedBundles = ["manual", "fallback", "future-provider-xyz", "user"] as const;
  for (const source of untrustedBundles) {
    const assembled = minimalAssembled();
    assembled.provenance = {
      source: source as AssembledContext["provenance"]["source"],
      fetchedAt: "2099-01-01T00:00:00.000Z",
    };
    assembled.verifiedFacts = [];
    assembled.manualNotes = "";
    const g = buildRetentionGroundingContext({ assembledContext: assembled });
    const structured = g.claims.filter((c) =>
      ["ranking", "fixture", "statistic", "timeline", "lineup"].includes(
        c.sourceRef ?? "",
      ),
    );
    assert.ok(structured.length > 0, `expected structured claims for ${source}`);
    assert.ok(
      structured.every((c) => c.permittedFactualUse === false),
      `bundle ${source} must not grant eligible facts`,
    );
  }

  for (const source of ["api-football", "statsbomb", "static-fallback"] as const) {
    const assembled = minimalAssembled();
    assembled.provenance = {
      source,
      fetchedAt: "2099-01-01T00:00:00.000Z",
    };
    assembled.verifiedFacts = [];
    assembled.manualNotes = "";
    const g = buildRetentionGroundingContext({ assembledContext: assembled });
    const structured = g.claims.filter((c) =>
      ["ranking", "fixture", "statistic", "timeline", "lineup"].includes(
        c.sourceRef ?? "",
      ),
    );
    assert.ok(structured.every((c) => c.provenance === "research_provider"));
    assert.ok(structured.every((c) => c.permittedFactualUse === true));
  }
});

check("manual / fallback / unknown never produce eligible factual claims", () => {
  for (const source of ["manual", "fallback", "totally-unknown-runtime"] as const) {
    const graph = minimalGraph();
    graph.verifiedFacts = [
      graphFact({
        id: `deny-${source}`,
        text: `Deny ${source}`,
        provenance: { source: source as "api-football" },
      }),
    ];
    graph.statisticFacts = [];
    const g = buildRetentionGroundingContext({ graphContext: graph });
    assert.equal(
      g.claims.find((c) => c.claimId === `deny-${source}`)?.permittedFactualUse,
      false,
    );
  }
});

console.log("10b1a-grounding-structure");
check("normalizeRetentionGroundingContext rejects malformed structure", () => {
  const cases: unknown[] = [
    { version: 2, claims: [] },
    { version: 1, claims: "not-an-array" },
    { version: 1 },
    { claims: [] },
    {
      version: 1,
      claims: [{ text: "x", provenance: "nope", verification: "verified", permittedFactualUse: true, forbidden: false }],
    },
  ];
  for (const bad of cases) {
    assert.throws(
      () =>
        normalizeRetentionGroundingContext(
          bad as Parameters<typeof normalizeRetentionGroundingContext>[0],
        ),
      (err: unknown) => {
        if (!(err instanceof RetentionStoryError)) return false;
        if (err.reason !== "invalid_grounding_context") return false;
        const blob = `${err.message}${err.stack ?? ""}`;
        assert.ok(!blob.includes("SECRET"));
        assert.ok(!blob.includes("not-an-array"));
        return true;
      },
    );
  }
});

console.log("10b1a-opaque-identity");
check("opaque research identity format + coherence", () => {
  const valid = productionOpaqueResearchIdentity("coherence-a");
  const other = productionOpaqueResearchIdentity("coherence-b");
  assert.notEqual(valid, other);

  assert.equal(
    normalizeStoryContract(baseInput({ researchIdentity: valid })).identities
      .researchContextIdentity,
    valid,
  );
  assert.equal(
    normalizeRetentionGroundingContext({
      version: 1,
      claims: [],
      researchIdentity: valid,
    }).researchIdentity,
    valid,
  );
  assert.equal(
    normalizeStoryContract(
      baseInput({
        researchIdentity: valid,
        grounding: { version: 1, claims: [], researchIdentity: valid },
      }),
    ).identities.researchContextIdentity,
    valid,
  );

  assert.throws(
    () =>
      normalizeStoryContract(
        baseInput({
          researchIdentity: valid,
          grounding: {
            version: 1,
            claims: [],
            researchIdentity: other,
          },
        }),
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "grounding_identity_mismatch",
  );

  const invalids = [
    "This is a raw sentence about research",
    "rsr: has space",
    "https://evil.example/token",
    "sk-secret-token-value",
    "rsi:abc123",
    "rsr:",
    `rsr:${"a".repeat(200)}`,
    "rsr:ABC",
    "rsr:abcdefgh", // longer than 32-bit FNV-1a base36 (max 7)
    "rsr:opaqueonly",
  ];
  for (const bad of invalids) {
    assert.throws(
      () => normalizeStoryContract(baseInput({ researchIdentity: bad })),
      (err: unknown) => {
        if (!(err instanceof RetentionStoryError)) return false;
        if (err.reason !== "invalid_research_identity") return false;
        assert.ok(!err.message.includes(bad.slice(0, 12)));
        return true;
      },
    );
  }
});

console.log("10b1b-immutable-trust");
check("authority mappings are frozen; mutation cannot escalate trust", () => {
  const sources: Array<string | null | undefined> = [
    null,
    "",
    "api-football",
    "statsbomb",
    "static-fallback",
    "user",
    "manual",
    "inferred",
    "assembly",
    "fallback",
    "future-provider-xyz",
  ];
  for (const source of sources) {
    for (const channel of ["graph", "assembled"] as const) {
      const result = mapRetentionSourceToAuthority(source, channel);
      assert.equal(
        Object.isFrozen(result),
        true,
        `expected frozen authority for ${String(source)}/${channel}`,
      );
    }
  }

  const manual = mapRetentionSourceToAuthority("manual", "assembled");
  assert.equal(manual.permittedFactualUse, false);
  assert.equal(manual.verification, "unverified");
  try {
    (manual as { permittedFactualUse: boolean }).permittedFactualUse = true;
    (manual as { verification: string }).verification = "verified";
    (manual as { provenance: string }).provenance = "research_provider";
    (manual as { forbidden: boolean }).forbidden = false;
  } catch {
    // Strict runtimes throw on frozen writes; non-strict ignore — both must leave trust intact.
  }
  assert.equal(manual.permittedFactualUse, false);
  assert.equal(manual.verification, "unverified");
  assert.equal(manual.provenance, "manual_user");
  assert.equal(Object.isFrozen(manual), true);

  const manualAgain = mapRetentionSourceToAuthority("manual", "graph");
  assert.equal(manualAgain.permittedFactualUse, false);
  assert.equal(manualAgain.verification, "unverified");
  assert.equal(manualAgain.provenance, "manual_user");
  assert.equal(Object.isFrozen(manualAgain), true);

  const graph = minimalGraph();
  graph.verifiedFacts = [
    graphFact({
      id: "mut-manual",
      text: "Manual after mutation attempt",
      provenance: { source: "manual" as "api-football" },
    }),
  ];
  graph.statisticFacts = [];
  const g = buildRetentionGroundingContext({ graphContext: graph });
  assert.equal(
    g.claims.find((c) => c.claimId === "mut-manual")?.permittedFactualUse,
    false,
  );

  const assembled = minimalAssembled();
  assembled.provenance = {
    source: "manual" as AssembledContext["provenance"]["source"],
    fetchedAt: "2099-01-01T00:00:00.000Z",
  };
  assembled.verifiedFacts = [];
  assembled.manualNotes = "";
  const a = buildRetentionGroundingContext({ assembledContext: assembled });
  assert.ok(
    a.claims
      .filter((c) =>
        ["ranking", "fixture", "statistic", "timeline", "lineup"].includes(
          c.sourceRef ?? "",
        ),
      )
      .every((c) => c.permittedFactualUse === false),
  );
});

console.log("10b1a-post-merge-bounds");
check("post-merge metadata re-bounds are order-independent", () => {
  const longA = `a${"x".repeat(RETENTION_MAX_CLAIM_SOURCE_REF_CHARS)}`;
  const longB = `b${"y".repeat(RETENTION_MAX_CLAIM_SOURCE_REF_CHARS)}`;
  const roleA = `required${"r".repeat(RETENTION_MAX_PI_FACT_ROLE_CHARS)}`;
  const roleB = `optional${"o".repeat(RETENTION_MAX_PI_FACT_ROLE_CHARS)}`;
  const beatA = `beat-a${"z".repeat(RETENTION_MAX_PI_BEAT_ID_CHARS)}`;
  const beatB = `beat-b${"w".repeat(RETENTION_MAX_PI_BEAT_ID_CHARS)}`;

  const left: RetentionGroundingClaimDraft = {
    claimId: "bound-merge",
    text: "Bounded merge claim",
    provenance: "research_provider",
    verification: "verified",
    permittedFactualUse: true,
    forbidden: false,
    sourceRef: longA,
    piFactRole: roleA,
    piBeatId: beatA,
    hasAuthoritativeId: true,
  };
  const right: RetentionGroundingClaimDraft = {
    claimId: "bound-merge",
    text: "Bounded merge claim",
    provenance: "research_provider",
    verification: "verified",
    permittedFactualUse: true,
    forbidden: false,
    sourceRef: longB,
    piFactRole: roleB,
    piBeatId: beatB,
    hasAuthoritativeId: true,
  };

  const forward = finalizeRetentionGroundingClaims([left, right]);
  const reverse = finalizeRetentionGroundingClaims([right, left]);
  assert.deepEqual(forward.claims[0], reverse.claims[0]);
  assert.equal(forward.researchIdentity, reverse.researchIdentity);
  assert.ok(
    (forward.claims[0]?.sourceRef?.length ?? 0) <=
      RETENTION_MAX_CLAIM_SOURCE_REF_CHARS,
  );
  assert.ok(
    (forward.claims[0]?.piFactRole?.length ?? 0) <=
      RETENTION_MAX_PI_FACT_ROLE_CHARS,
  );
  assert.ok(
    (forward.claims[0]?.piBeatId?.length ?? 0) <= RETENTION_MAX_PI_BEAT_ID_CHARS,
  );
});

// --- Boundaries ---
console.log("boundaries");
check("no Hook/Export fingerprint or generation imports; no env/model", () => {
  const files = collectTsFiles(MODULE_ROOT);
  // Core Retention layers stay Hook-free. Sprint 10E `integration/` and Sprint
  // 10F.3 `production/` may call frozen Hook / OpenAI script infrastructure.
  const forbiddenEverywhere = [
    /hook-fingerprint/,
    /export-manifest-fingerprint/,
    /assembledContextToPrompt|promptSections/,
  ];
  const forbiddenOutsideIntegrationAndProduction = [
    /from ["']@\/features\/hook-engine["']/,
    /from ["']@\/features\/hook-engine\/domain/,
    /from ["']@\/features\/hook-engine\/integration/,
    /from ["']@\/features\/hook-engine\/repair/,
    /from ["']@\/features\/hook-engine\/strategies/,
    /from ["']@\/features\/hook-engine\/validation/,
    /openai|generateRawStoryScript|generateHookedNarration/i,
    /process\.env/,
    /buildNeutralResearchEvidence/,
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const inIntegration = file.includes(`${path.sep}integration${path.sep}`);
    const inProduction = file.includes(`${path.sep}production${path.sep}`);
    const isReconcile =
      file.endsWith(`${path.sep}reconcile-retention-candidate-after-hook.ts`);
    const isTerminalHookAuthority =
      file.endsWith(
        `${path.sep}assert-retention-terminal-hook-authority-coherence.ts`,
      ) ||
      file.endsWith(
        `${path.sep}assert-retention-hook-bridge-post-rewrite-coherence.ts`,
      ) ||
      file.endsWith(`${path.sep}revalidate-retention-hook-after-rewrite.ts`) ||
      file.endsWith(`${path.sep}retention-terminal-hook-authority.types.ts`);
    for (const pattern of forbiddenEverywhere) {
      assert.equal(pattern.test(src), false, `${file} matched ${pattern}`);
    }
    if (inIntegration || inProduction) continue;
    if (isReconcile) {
      // 10E.1: reconciliation may import only the frozen Hook opening-span extractor.
      assert.match(
        src,
        /from ["']@\/features\/hook-engine\/validation\/extract-opening-span["']/,
      );
      assert.equal(
        /from ["']@\/features\/hook-engine\/(?!validation\/extract-opening-span)/.test(
          src,
        ),
        false,
        `${file} imported unexpected hook-engine modules`,
      );
      assert.equal(/openai|generateHookedNarration/i.test(src), false);
      continue;
    }
    if (isTerminalHookAuthority) {
      // 10F.2A: terminal Hook authority / post-rewrite revalidation may import
      // frozen Hook domain + validation helpers (no generateHookedNarration).
      assert.equal(/openai|generateHookedNarration/i.test(src), false);
      assert.equal(
        /from ["']@\/features\/hook-engine\/integration/.test(src),
        false,
        `${file} must not import Hook integration runners`,
      );
      continue;
    }
    for (const pattern of forbiddenOutsideIntegrationAndProduction) {
      assert.equal(pattern.test(src), false, `${file} matched ${pattern}`);
    }
  }
  // Presentation import allowed
  const normalizeSrc = readFileSync(
    path.join(MODULE_ROOT, "domain/normalize-story-contract.ts"),
    "utf8",
  );
  assert.match(
    normalizeSrc,
    /hook-engine\/presentation\/hook-style-selection/,
  );
});

console.log(`\nAll story contract foundation checks passed (${passed}).\n`);
