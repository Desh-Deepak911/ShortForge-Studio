/**
 * Map GraphContext / AssembledContext → neutral Hook research evidence (Sprint 7D.2).
 * Lives in Hook integration so research/PI cores stay Hook-free.
 * Does not parse rendered prompt strings for facts.
 */

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext, GraphContextFact } from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import { hookStableHash, hookStableStringify } from "../domain/hook-fingerprint";

import type {
  HookNeutralFactProvenance,
  HookNeutralResearchEvidence,
  HookNeutralResearchFact,
} from "./neutral-research-evidence.types";

const MAX_FACT_TEXT_CHARS = 400;

function normalizeFactText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_FACT_TEXT_CHARS);
}

/** Deterministic content-derived ID — no queryId, timestamps, or array positions. */
export function buildSemanticFactId(input: {
  readonly kind: string;
  readonly content: string;
  readonly provider?: string;
}): string {
  return `af:${input.kind}:${hookStableHash(
    hookStableStringify({
      kind: input.kind,
      content: normalizeFactText(input.content),
      provider: input.provider ?? "",
    }),
  )}`;
}

export function buildManualFactId(text: string): string {
  return `manual:${hookStableHash(normalizeFactText(text))}`;
}

function classifyProvenanceSource(
  source: string | undefined,
): "provider" | "user" | "inferred" {
  if (source === "user") return "user";
  if (source === "inferred") return "inferred";
  return "provider";
}

function upsertFact(
  byId: Map<string, HookNeutralResearchFact>,
  fact: HookNeutralResearchFact,
): void {
  if (byId.has(fact.factId)) return;
  byId.set(fact.factId, fact);
}

function toNeutralFromGraphFact(
  fact: GraphContextFact,
): HookNeutralResearchFact | null {
  const text = normalizeFactText(fact.text ?? "");
  if (!text) return null;

  if (fact.type === "manual_note") {
    return {
      factId: fact.id,
      text,
      provenance: "user_manual",
      sourceRef: fact.provenance?.source,
      verified: false,
      permittedForFactualHookUse: false,
    };
  }

  const eligibility = classifyProvenanceSource(fact.provenance?.source);
  if (eligibility === "user") {
    return {
      factId: fact.id,
      text,
      provenance: "user_manual",
      sourceRef: fact.provenance?.source,
      verified: false,
      permittedForFactualHookUse: false,
    };
  }
  if (eligibility === "inferred") {
    return {
      factId: fact.id,
      text,
      provenance: "qualitative",
      sourceRef: fact.provenance?.source ?? "inferred",
      verified: false,
      permittedForFactualHookUse: false,
    };
  }

  return {
    factId: fact.id,
    text,
    provenance: "provider_verified",
    sourceRef: fact.provenance?.source,
    verified: true,
    permittedForFactualHookUse: true,
  };
}

function collectGraphFacts(graph: GraphContext): HookNeutralResearchFact[] {
  const byId = new Map<string, HookNeutralResearchFact>();

  for (const collection of [
    graph.rankedFacts,
    graph.verifiedFacts,
    graph.fixtureFacts,
    graph.statisticFacts,
    graph.timelineFacts,
  ]) {
    for (const fact of collection) {
      const mapped = toNeutralFromGraphFact(fact);
      if (mapped) upsertFact(byId, mapped);
    }
  }

  return [...byId.values()].sort((a, b) => a.factId.localeCompare(b.factId));
}

function collectAssembledFacts(
  assembled: AssembledContext,
  manualContext?: string,
): HookNeutralResearchFact[] {
  const byId = new Map<string, HookNeutralResearchFact>();
  const bundleSource =
    assembled.provenance?.source === "user" || assembled.provenance?.source === "inferred"
      ? assembled.provenance.source
      : assembled.provenance?.source ?? "provider";

  for (const fact of assembled.verifiedFacts) {
    const text = normalizeFactText(fact.text ?? "");
    if (!text) continue;
    const factId = fact.id?.trim() || buildSemanticFactId({
      kind: "verified",
      content: text,
      provider: fact.provenance?.source,
    });
    const source = fact.provenance?.source;
    if (source === "user") {
      upsertFact(byId, {
        factId,
        text,
        provenance: "user_manual",
        sourceRef: source,
        verified: false,
        permittedForFactualHookUse: false,
      });
      continue;
    }
    if (source === "inferred") {
      upsertFact(byId, {
        factId,
        text,
        provenance: "qualitative",
        sourceRef: source,
        verified: false,
        permittedForFactualHookUse: false,
      });
      continue;
    }
    upsertFact(byId, {
      factId,
      text,
      provenance: "provider_verified",
      sourceRef: source,
      verified: true,
      permittedForFactualHookUse: true,
    });
  }

  for (const ranking of assembled.rankings) {
    for (const entry of ranking.entries) {
      const label = entry.label?.trim();
      if (!label) continue;
      const valuePart =
        entry.value == null || Number.isNaN(entry.value) ? "" : ` — ${entry.value}`;
      const text = normalizeFactText(
        `#${entry.rank} ${label}${valuePart} (${ranking.metric})`,
      );
      if (!text) continue;
      const contentKey = `${ranking.metric}|${entry.rank}|${label}|${entry.value ?? ""}|${entry.entityId ?? ""}`;
      const factId = buildSemanticFactId({
        kind: "ranking",
        content: contentKey,
        provider: bundleSource === "user" || bundleSource === "inferred" ? bundleSource : String(bundleSource),
      });
      if (bundleSource === "user") {
        upsertFact(byId, {
          factId,
          text,
          provenance: "user_manual",
          sourceRef: bundleSource,
          verified: false,
          permittedForFactualHookUse: false,
        });
      } else if (bundleSource === "inferred") {
        upsertFact(byId, {
          factId,
          text,
          provenance: "qualitative",
          sourceRef: "inferred",
          verified: false,
          permittedForFactualHookUse: false,
        });
      } else {
        upsertFact(byId, {
          factId,
          text,
          provenance: "provider_verified",
          sourceRef: String(bundleSource),
          verified: true,
          permittedForFactualHookUse: true,
        });
      }
    }
  }

  for (const fixture of assembled.fixtures) {
    const score =
      fixture.homeGoals == null || fixture.awayGoals == null
        ? "vs"
        : `${fixture.homeGoals}-${fixture.awayGoals}`;
    const text = normalizeFactText(
      `${fixture.homeTeam} ${score} ${fixture.awayTeam} (${fixture.league}${fixture.status ? `, ${fixture.status}` : ""})`,
    );
    if (!text) continue;
    const contentKey = `${fixture.id}|${fixture.homeTeam}|${fixture.awayTeam}|${fixture.homeGoals}|${fixture.awayGoals}|${fixture.league}|${fixture.date}`;
    const factId = buildSemanticFactId({
      kind: "fixture",
      content: contentKey,
      provider: String(bundleSource),
    });
    if (bundleSource === "user" || bundleSource === "inferred") {
      upsertFact(byId, {
        factId,
        text,
        provenance: bundleSource === "user" ? "user_manual" : "qualitative",
        sourceRef: bundleSource,
        verified: false,
        permittedForFactualHookUse: false,
      });
    } else {
      upsertFact(byId, {
        factId,
        text,
        provenance: "provider_verified",
        sourceRef: String(bundleSource),
        verified: true,
        permittedForFactualHookUse: true,
      });
    }
  }

  for (const stat of assembled.statistics) {
    const text = normalizeFactText(
      `${stat.team}: ${stat.type} = ${stat.value ?? "n/a"}`,
    );
    if (!text) continue;
    const contentKey = `${stat.team}|${stat.type}|${stat.value ?? ""}`;
    const factId = buildSemanticFactId({
      kind: "statistic",
      content: contentKey,
      provider: String(bundleSource),
    });
    if (bundleSource === "user" || bundleSource === "inferred") {
      upsertFact(byId, {
        factId,
        text,
        provenance: bundleSource === "user" ? "user_manual" : "qualitative",
        sourceRef: bundleSource,
        verified: false,
        permittedForFactualHookUse: false,
      });
    } else {
      upsertFact(byId, {
        factId,
        text,
        provenance: "provider_verified",
        sourceRef: String(bundleSource),
        verified: true,
        permittedForFactualHookUse: true,
      });
    }
  }

  for (const event of assembled.events) {
    const minute =
      event.minute == null
        ? ""
        : event.extraMinute != null
          ? `${event.minute}+${event.extraMinute}'`
          : `${event.minute}'`;
    const text = normalizeFactText(
      [minute, event.team, event.player, event.type, event.detail]
        .filter(Boolean)
        .join(" — "),
    );
    if (!text) continue;
    const contentKey = `${event.minute ?? ""}|${event.extraMinute ?? ""}|${event.team}|${event.player ?? ""}|${event.type ?? ""}|${event.detail ?? ""}|${event.assist ?? ""}`;
    const factId = buildSemanticFactId({
      kind: "event",
      content: contentKey,
      provider: String(bundleSource),
    });
    if (bundleSource === "user" || bundleSource === "inferred") {
      upsertFact(byId, {
        factId,
        text,
        provenance: bundleSource === "user" ? "user_manual" : "qualitative",
        sourceRef: bundleSource,
        verified: false,
        permittedForFactualHookUse: false,
      });
    } else {
      upsertFact(byId, {
        factId,
        text,
        provenance: "provider_verified",
        sourceRef: String(bundleSource),
        verified: true,
        permittedForFactualHookUse: true,
      });
    }
  }

  for (const lineup of assembled.lineups) {
    const xi = [...(lineup.startingXi ?? [])].map((n) => n.trim()).filter(Boolean).sort().join(",");
    const subs = [...(lineup.substitutes ?? [])].map((n) => n.trim()).filter(Boolean).sort().join(",");
    const text = normalizeFactText(
      `${lineup.team} formation ${lineup.formation ?? "unknown"}; XI: ${xi || "n/a"}`,
    );
    if (!text) continue;
    const contentKey = `${lineup.team}|${lineup.formation ?? ""}|${xi}|${subs}`;
    const factId = buildSemanticFactId({
      kind: "lineup",
      content: contentKey,
      provider: String(bundleSource),
    });
    if (bundleSource === "user" || bundleSource === "inferred") {
      upsertFact(byId, {
        factId,
        text,
        provenance: bundleSource === "user" ? "user_manual" : "qualitative",
        sourceRef: bundleSource,
        verified: false,
        permittedForFactualHookUse: false,
      });
    } else {
      upsertFact(byId, {
        factId,
        text,
        provenance: "provider_verified",
        sourceRef: String(bundleSource),
        verified: true,
        permittedForFactualHookUse: true,
      });
    }
  }

  const manual = (assembled.manualNotes ?? manualContext)?.trim();
  if (manual) {
    const text = normalizeFactText(manual);
    const factId = buildManualFactId(text);
    upsertFact(byId, {
      factId,
      text,
      provenance: "user_manual",
      verified: false,
      permittedForFactualHookUse: false,
    });
  }

  return [...byId.values()].sort((a, b) => a.factId.localeCompare(b.factId));
}

function addForbiddenFacts(
  facts: HookNeutralResearchFact[],
  forbiddenClaimTexts: readonly string[],
): HookNeutralResearchFact[] {
  const byId = new Map(facts.map((f) => [f.factId, f]));
  for (const raw of forbiddenClaimTexts) {
    const text = normalizeFactText(raw);
    if (!text) continue;
    const factId = `forbidden:${hookStableHash(text)}`;
    if (byId.has(factId)) continue;
    byId.set(factId, {
      factId,
      text,
      provenance: "forbidden" as HookNeutralFactProvenance,
      verified: false,
      permittedForFactualHookUse: false,
    });
  }
  return [...byId.values()].sort((a, b) => a.factId.localeCompare(b.factId));
}

/**
 * Semantic research identity — no queryId or timestamps.
 * Ordering of input facts must not change the fingerprint.
 */
export function buildSemanticResearchFingerprint(input: {
  readonly facts: readonly HookNeutralResearchFact[];
  readonly unavailableResearch: boolean;
  readonly forbiddenClaimTexts?: readonly string[];
  readonly openingBeat?: {
    readonly factIds: readonly string[];
    readonly evidenceLedSurprise?: boolean;
  };
}): string {
  const semanticFacts = [...input.facts]
    .map((f) => ({
      factId: f.factId,
      text: f.text,
      provenance: f.provenance,
      verified: f.verified,
      permittedForFactualHookUse: f.permittedForFactualHookUse,
      ...(f.sourceRef ? { sourceRef: f.sourceRef } : {}),
    }))
    .sort((a, b) => a.factId.localeCompare(b.factId));

  const payload = {
    unavailable: input.unavailableResearch === true,
    facts: semanticFacts,
    forbidden: [...(input.forbiddenClaimTexts ?? [])].map(normalizeFactText).filter(Boolean).sort(),
    opening: input.openingBeat
      ? {
          factIds: [...input.openingBeat.factIds].sort(),
          evidenceLedSurprise: input.openingBeat.evidenceLedSurprise === true,
        }
      : null,
  };

  return `re:${hookStableHash(hookStableStringify(payload))}`;
}

/**
 * Build neutral evidence from GraphContext (preferred) or AssembledContext fallback,
 * plus optional NarrativePlan opening/forbidden semantics.
 */
export function buildNeutralResearchEvidence(input: {
  readonly graphContext?: GraphContext | null;
  readonly assembled?: AssembledContext | null;
  readonly narrativePlan?: NarrativePlan | null;
  readonly researchAttempted?: boolean;
  readonly researchApplied?: boolean;
  readonly manualContext?: string;
  /**
   * Explicit override for tests / callers.
   * Production should prefer narrativePlan.openingIntent.
   */
  readonly evidenceLedSurpriseIntent?: boolean;
}): HookNeutralResearchEvidence {
  let facts: HookNeutralResearchFact[] = [];

  if (input.graphContext) {
    facts = collectGraphFacts(input.graphContext);
  } else if (input.assembled) {
    facts = collectAssembledFacts(input.assembled, input.manualContext);
  } else {
    const manual = input.manualContext?.trim();
    if (manual) {
      const text = normalizeFactText(manual);
      const provenance: HookNeutralFactProvenance = "user_manual";
      facts = [
        {
          factId: buildManualFactId(text),
          text,
          provenance,
          verified: false,
          permittedForFactualHookUse: false,
        },
      ];
    }
  }

  if (input.graphContext && input.manualContext?.trim()) {
    const text = normalizeFactText(input.manualContext);
    const manualId = buildManualFactId(text);
    if (!facts.some((f) => f.factId === manualId)) {
      const provenance: HookNeutralFactProvenance = "user_manual";
      facts = [
        ...facts,
        {
          factId: manualId,
          text,
          provenance,
          verified: false,
          permittedForFactualHookUse: false,
        },
      ].sort((a, b) => a.factId.localeCompare(b.factId));
    }
  }

  const forbiddenClaimTexts = input.narrativePlan?.forbiddenClaims
    ?.map((t) => normalizeFactText(t))
    .filter(Boolean);

  if (forbiddenClaimTexts?.length) {
    facts = addForbiddenFacts(facts, forbiddenClaimTexts);
  }

  const planOpening = input.narrativePlan?.openingIntent;
  const evidenceLedFromPlan =
    planOpening?.kind === "evidence_led_surprise" &&
    Array.isArray(planOpening.factIds) &&
    planOpening.factIds.length > 0;

  /** Explicit test/caller override — production prefers narrativePlan.openingIntent. */
  const evidenceLedOverride = input.evidenceLedSurpriseIntent === true;

  const openingBeatFactIds = evidenceLedFromPlan
    ? [...planOpening!.factIds]
    : evidenceLedOverride
      ? input.narrativePlan?.beats
          ?.filter((b) => b.openingHook === true)
          .flatMap((b) => b.requiredFactIds ?? []) ?? []
      : input.narrativePlan?.beats
          ?.filter(
            (b) => b.openingHook === true && b.evidenceLedSurprise === true,
          )
          .flatMap((b) => b.requiredFactIds ?? []) ?? [];

  const evidenceLedSurprise =
    evidenceLedFromPlan ||
    (evidenceLedOverride && openingBeatFactIds.length > 0) ||
    (openingBeatFactIds.length > 0 &&
      input.narrativePlan?.beats?.some(
        (b) => b.openingHook === true && b.evidenceLedSurprise === true,
      ) === true);

  const unavailableResearch =
    input.researchAttempted === true && input.researchApplied !== true;

  const openingBeat =
    evidenceLedSurprise && openingBeatFactIds.length > 0
      ? Object.freeze({
          factIds: Object.freeze([...new Set(openingBeatFactIds)].sort()),
          evidenceLedSurprise: true as const,
        })
      : undefined;

  const sanitizedOpening = openingBeat;

  return Object.freeze({
    facts: Object.freeze(facts.map((f) => Object.freeze({ ...f }))),
    unavailableResearch,
    researchFingerprint: buildSemanticResearchFingerprint({
      facts,
      unavailableResearch,
      ...(forbiddenClaimTexts?.length ? { forbiddenClaimTexts } : {}),
      ...(sanitizedOpening ? { openingBeat: sanitizedOpening } : {}),
    }),
    ...(forbiddenClaimTexts?.length
      ? { forbiddenClaimTexts: Object.freeze([...forbiddenClaimTexts]) }
      : {}),
    ...(sanitizedOpening ? { openingBeat: sanitizedOpening } : {}),
    ...(input.manualContext?.trim()
      ? { manualNotes: input.manualContext.trim() }
      : {}),
  });
}
