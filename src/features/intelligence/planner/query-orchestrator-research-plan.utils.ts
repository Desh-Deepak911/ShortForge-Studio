import { SEASON_REQUIRED_WARNING } from "../competitions";
import type { CompetitionResolution, CompetitionScope } from "../competitions/types";
import { isSeasonScopedCompetition } from "../competitions/competition-catalog";
import type { EntityResolution } from "../entities/entity-types";
import { hasFutureMatchSignals } from "../intent/intent-utils";
import type { IntentAnalysis } from "../intent/intent-types";
import type { IntelligenceCompetition } from "../shared/competition.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceProviderId } from "../shared/provider.types";
import type {
  IntelligenceQueryInput,
  ResearchCall,
  ResearchFallbackStrategy,
  ResearchPlan,
} from "./query-orchestrator.types";

type ResearchPlanKind =
  | "ranked_list"
  | "player_profile"
  | "match_preview"
  | "match_recap"
  | "tactical_breakdown"
  | "optional_research";

interface BuildResearchPlanInput {
  queryInput: IntelligenceQueryInput;
  intent: IntentAnalysis;
  extraction: EntityResolution;
  competitionResolution: CompetitionResolution;
  entities: IntelligenceEntity[];
  competition?: IntelligenceCompetition;
  season?: number;
}

function dedupeStrings(values: string[]): string[] {
  return values.filter((entry, index, list) => list.indexOf(entry) === index);
}

function dedupeProviders(values: IntelligenceProviderId[]): IntelligenceProviderId[] {
  return values.filter((entry, index, list) => list.indexOf(entry) === index);
}

function pushCall(calls: ResearchCall[], call: ResearchCall): void {
  const exists = calls.some(
    (entry) => entry.provider === call.provider && entry.operation === call.operation,
  );
  if (!exists) {
    calls.push(call);
  }
}

function getTeams(entities: IntelligenceEntity[]): IntelligenceEntity[] {
  return entities.filter((entity) => entity.kind === "club" || entity.kind === "national_team");
}

function getFixtureEntity(entities: IntelligenceEntity[]): IntelligenceEntity | undefined {
  return entities.find((entity) => entity.kind === "match");
}

function getPlayerEntity(entities: IntelligenceEntity[]): IntelligenceEntity | undefined {
  return entities.find((entity) => entity.kind === "player");
}

function hasDateContext(input: BuildResearchPlanInput): boolean {
  if (input.season != null) {
    return true;
  }

  if (input.intent.topic.seasonYear != null) {
    return true;
  }

  return input.entities.some((entity) => entity.kind === "season");
}

function isAllTimeScope(competition?: IntelligenceCompetition): boolean {
  return competition?.timeScope === "all_time";
}

function isFutureCompetitionContext(input: BuildResearchPlanInput): boolean {
  const mergedText = `${input.queryInput.topic} ${input.queryInput.manualNotes ?? ""}`;
  if (hasFutureMatchSignals(mergedText)) {
    return true;
  }

  if (input.intent.subIntent === "predictions") {
    return true;
  }

  if (input.intent.topic.predictionKeywords.length > 0) {
    return true;
  }

  const currentYear = new Date().getFullYear();
  const targetSeason = input.season ?? input.intent.topic.seasonYear;
  if (targetSeason != null && targetSeason > currentYear) {
    return true;
  }

  return (
    input.competition?.scope === "fifa_world_cup" &&
    targetSeason != null &&
    targetSeason >= currentYear
  );
}

function resolveResearchPlanKind(input: BuildResearchPlanInput): ResearchPlanKind {
  const mode = input.queryInput.selectedMode;
  const intent = input.intent.intent;

  if (mode === "top_5" || intent === "ranked_list" || input.intent.subIntent === "top_scorers") {
    return "ranked_list";
  }

  if (mode === "player_analysis" || intent === "player_profile") {
    return "player_profile";
  }

  if (mode === "match_preview" || intent === "match_preview") {
    return "match_preview";
  }

  if (mode === "match_recap" || intent === "match_recap") {
    return "match_recap";
  }

  if (mode === "tactical_review" || intent === "tactical_breakdown") {
    return "tactical_breakdown";
  }

  if (
    mode === "story" ||
    mode === "historical_explainer" ||
    mode === "opinion_debate" ||
    intent === "story" ||
    intent === "historical_explainer" ||
    intent === "opinion" ||
    intent === "news"
  ) {
    return "optional_research";
  }

  return "optional_research";
}

function resolveFallbackStrategy(input: {
  queryInput: IntelligenceQueryInput;
  missingInputs: string[];
  requiredCalls: ResearchCall[];
  requiredProviders: IntelligenceProviderId[];
  preferStaticFallback?: boolean;
  researchOptional?: boolean;
}): ResearchFallbackStrategy {
  if (!input.queryInput.enableResearch || input.researchOptional) {
    return input.queryInput.manualNotes?.trim() ? "manual_only" : "heuristic_entities";
  }

  if (input.preferStaticFallback) {
    return "static_fallback";
  }

  if (input.missingInputs.length === 0 && input.requiredCalls.length > 0) {
    return "full_provider";
  }

  if (input.queryInput.manualNotes?.trim()) {
    return "manual_only";
  }

  if (input.requiredCalls.some((call) => call.provider === "static-fallback")) {
    return "static_fallback";
  }

  if (input.requiredCalls.length === 0) {
    return "heuristic_entities";
  }

  return "legacy_parser";
}

function resolveCanProceed(input: {
  queryInput: IntelligenceQueryInput;
  missingInputs: string[];
  researchOptional?: boolean;
  strictRequirements?: boolean;
}): boolean {
  if (!input.queryInput.topic.trim()) {
    return false;
  }

  if (input.researchOptional) {
    return true;
  }

  if (!input.queryInput.enableResearch) {
    return true;
  }

  if (input.missingInputs.length === 0) {
    return true;
  }

  if (input.queryInput.manualNotes?.trim()) {
    return true;
  }

  return !input.strictRequirements;
}

function planRankedList(input: BuildResearchPlanInput): ResearchPlan {
  const missingInputs: string[] = [];
  const requiredCalls: ResearchCall[] = [];

  if (!input.competition || input.competition.scope === "unknown") {
    missingInputs.push("competition");
  }

  const allTime = isAllTimeScope(input.competition);
  const isAllTimeWorldCup =
    input.competition?.scope === "fifa_world_cup" && allTime;
  const requiredProviders: IntelligenceProviderId[] = isAllTimeWorldCup
    ? ["static-fallback"]
    : ["api-football"];
  const needsSeason =
    !allTime &&
    input.competition != null &&
    (input.competition.timeScope === "season" ||
      isSeasonScopedCompetition(input.competition.scope as CompetitionScope));

  if (needsSeason && input.season == null) {
    missingInputs.push("season");
  }

  if (input.extraction.ambiguities.includes(SEASON_REQUIRED_WARNING) && !allTime) {
    if (!missingInputs.includes("season")) {
      missingInputs.push("season");
    }
  }

  if (isAllTimeWorldCup) {
    pushCall(requiredCalls, {
      provider: "static-fallback",
      operation: "getAllTimeWorldCupTopScorers",
      params: { limit: 5 },
      reason: "All-time World Cup top scorers use curated static records.",
      priority: 1,
    });
  } else if (
    input.competition?.leagueId != null &&
    input.season != null &&
    !missingInputs.includes("season")
  ) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "topScorers",
      params: {
        leagueId: input.competition.leagueId,
        season: input.season,
      },
      reason: "Season-scoped ranked list requires league top-scorer rankings.",
      priority: 1,
    });
  }

  const normalizedMissing = dedupeStrings(missingInputs);

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: requiredCalls.sort((left, right) => left.priority - right.priority),
    reason:
      normalizedMissing.length > 0
        ? "Ranked list plan — competition and season required unless scope is all-time."
        : isAllTimeWorldCup
          ? "Ranked list plan — all-time World Cup static fallback."
          : "Ranked list plan — topScorers provider call scheduled.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      strictRequirements: true,
    }),
    missingInputs: normalizedMissing,
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      requiredCalls,
      requiredProviders,
      preferStaticFallback: isAllTimeWorldCup,
    }),
  };
}

function planPlayerProfile(input: BuildResearchPlanInput): ResearchPlan {
  const missingInputs: string[] = [];
  const requiredCalls: ResearchCall[] = [];
  const requiredProviders: IntelligenceProviderId[] = ["api-football"];
  const player = getPlayerEntity(input.entities);
  const futureCompetition = isFutureCompetitionContext(input);

  if (!player) {
    missingInputs.push("player");
  }

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "playerSearch",
    params: { query: player?.label ?? input.queryInput.topic },
    reason: "Player profile requires resolving the named player.",
    priority: 1,
  });

  if (input.competition && input.competition.scope !== "unknown") {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "competitionContext",
      params: {
        leagueId: input.competition.leagueId ?? null,
        label: input.competition.label,
        scope: input.competition.scope,
      },
      reason: "Competition detected — attach league/tournament context to player research.",
      priority: 2,
    });
  }

  if (input.season != null) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "playerStats",
      params: {
        query: player?.label ?? input.queryInput.topic,
        season: input.season,
        ...(player?.externalId != null ? { playerId: player.externalId } : {}),
      },
      reason: "Explicit season detected — fetch season-scoped player statistics.",
      priority: 3,
    });
  }

  const normalizedMissing = dedupeStrings(missingInputs);

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: requiredCalls.sort((left, right) => left.priority - right.priority),
    reason: futureCompetition
      ? "Player profile plan — future competition detected; use cautious static/manual fallback for unverified tournament data."
      : "Player profile plan — player search with optional competition and season stats.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      strictRequirements: true,
    }),
    missingInputs: normalizedMissing,
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      requiredCalls,
      requiredProviders,
      preferStaticFallback: futureCompetition,
    }),
  };
}

function planMatchPreview(input: BuildResearchPlanInput): ResearchPlan {
  const missingInputs: string[] = [];
  const requiredCalls: ResearchCall[] = [];
  const requiredProviders: IntelligenceProviderId[] = ["api-football"];
  const teams = getTeams(input.entities);
  const fixture = getFixtureEntity(input.entities);

  if (teams.length < 2 && !fixture) {
    missingInputs.push("match_teams_or_fixture");
  }

  for (const [index, team] of teams.slice(0, 2).entries()) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "searchTeams",
      params: { query: team.label },
      reason: `Resolve ${team.kind} before fixture lookup.`,
      priority: index + 1,
    });
  }

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "fixtureSearch",
    params: {
      direction: "next",
      ...(fixture?.label ? { label: fixture.label } : {}),
    },
    reason: "Match preview requires upcoming fixture search.",
    priority: 3,
  });

  if (input.competition?.leagueId != null) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "getStandings",
      params: {
        leagueId: input.competition.leagueId,
        season: input.season ?? input.competition.season ?? null,
      },
      reason: "Standings available for detected competition — attach table context.",
      priority: 4,
    });

    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "teamForm",
      params: {
        leagueId: input.competition.leagueId,
        season: input.season ?? input.competition.season ?? null,
      },
      reason: "Recent form context for preview when standings/league scope is known.",
      priority: 5,
    });
  }

  const normalizedMissing = dedupeStrings(missingInputs);

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: requiredCalls.sort((left, right) => left.priority - right.priority),
    reason: "Match preview plan — fixture search plus optional standings/form.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      strictRequirements: true,
    }),
    missingInputs: normalizedMissing,
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      requiredCalls,
      requiredProviders,
    }),
  };
}

function planMatchRecap(input: BuildResearchPlanInput): ResearchPlan {
  const missingInputs: string[] = [];
  const requiredCalls: ResearchCall[] = [];
  const requiredProviders: IntelligenceProviderId[] = ["api-football"];
  const teams = getTeams(input.entities);
  const fixture = getFixtureEntity(input.entities);
  const hasDate = hasDateContext(input);

  if (!fixture && teams.length < 2) {
    missingInputs.push("fixture_or_teams");
  }

  if (!fixture && teams.length >= 2 && !hasDate) {
    missingInputs.push("match_date");
  }

  for (const [index, team] of teams.slice(0, 2).entries()) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "searchTeams",
      params: { query: team.label },
      reason: `Resolve ${team.kind} for recap fixture lookup.`,
      priority: index + 1,
    });
  }

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "fixtureSearch",
    params: {
      direction: "last",
      ...(fixture?.label ? { label: fixture.label } : {}),
      ...(input.season != null ? { season: input.season } : {}),
    },
    reason: "Match recap requires locating the completed fixture.",
    priority: 3,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureEvents",
    params: {},
    reason: "Recap needs goal and discipline events.",
    priority: 4,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureStatistics",
    params: {},
    reason: "Recap needs team and match statistics.",
    priority: 5,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureLineups",
    params: {},
    reason: "Recap may include starting lineups and formations.",
    priority: 6,
  });

  const normalizedMissing = dedupeStrings(missingInputs);

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: requiredCalls.sort((left, right) => left.priority - right.priority),
    reason: "Match recap plan — fixture lookup plus events, stats, and lineups.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      strictRequirements: true,
    }),
    missingInputs: normalizedMissing,
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      requiredCalls,
      requiredProviders,
    }),
  };
}

function planTacticalBreakdown(input: BuildResearchPlanInput): ResearchPlan {
  const missingInputs: string[] = [];
  const requiredCalls: ResearchCall[] = [];
  const requiredProviders: IntelligenceProviderId[] = ["api-football"];
  const teams = getTeams(input.entities);
  const fixture = getFixtureEntity(input.entities);

  if (!fixture && teams.length < 2) {
    missingInputs.push("fixture_or_teams");
  }

  for (const [index, team] of teams.slice(0, 2).entries()) {
    pushCall(requiredCalls, {
      provider: "api-football",
      operation: "searchTeams",
      params: { query: team.label },
      reason: `Resolve ${team.kind} for tactical fixture lookup.`,
      priority: index + 1,
    });
  }

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "fixtureSearch",
    params: {
      direction: "last",
      ...(fixture?.label ? { label: fixture.label } : {}),
    },
    reason: "Tactical breakdown requires a fixture anchor.",
    priority: 3,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureStatistics",
    params: {},
    reason: "Tactical analysis requires match statistics.",
    priority: 4,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureEvents",
    params: {},
    reason: "Tactical analysis uses phase and event timing where available.",
    priority: 5,
  });

  pushCall(requiredCalls, {
    provider: "api-football",
    operation: "getFixtureLineups",
    params: {},
    reason: "Tactical breakdown needs lineups and formations.",
    priority: 6,
  });

  const normalizedMissing = dedupeStrings(missingInputs);

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: requiredCalls.sort((left, right) => left.priority - right.priority),
    reason:
      "Tactical breakdown plan — fixture stats/events/lineups via API-Football; StatsBomb optional later.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      strictRequirements: true,
    }),
    missingInputs: normalizedMissing,
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: normalizedMissing,
      requiredCalls,
      requiredProviders,
    }),
  };
}

function planOptionalResearch(input: BuildResearchPlanInput): ResearchPlan {
  const requiredProviders: IntelligenceProviderId[] = [];

  if (input.queryInput.manualNotes?.trim()) {
    requiredProviders.push("manual");
  }

  return {
    requiredProviders: dedupeProviders(requiredProviders),
    requiredCalls: [],
    reason:
      "Story/explainer/opinion brief — research optional; use manual notes and light heuristic entity context.",
    canProceed: resolveCanProceed({
      queryInput: input.queryInput,
      missingInputs: [],
      researchOptional: true,
    }),
    missingInputs: [],
    fallbackStrategy: resolveFallbackStrategy({
      queryInput: input.queryInput,
      missingInputs: [],
      requiredCalls: [],
      requiredProviders,
      researchOptional: true,
    }),
  };
}

export function buildResearchPlan(input: BuildResearchPlanInput): ResearchPlan {
  if (!input.queryInput.topic.trim()) {
    return {
      requiredProviders: [],
      requiredCalls: [],
      reason: "Topic is required before research can be planned.",
      canProceed: false,
      missingInputs: ["topic"],
      fallbackStrategy: "skip_research",
    };
  }

  if (!input.queryInput.enableResearch) {
    const requiredProviders: IntelligenceProviderId[] = input.queryInput.manualNotes?.trim()
      ? ["manual"]
      : [];

    return {
      requiredProviders,
      requiredCalls: [],
      reason: "Smart Research disabled — generation may use manual notes only.",
      canProceed: true,
      missingInputs: [],
      fallbackStrategy: "skip_research",
    };
  }

  if (input.queryInput.manualNotes?.trim()) {
    // Manual notes augment every enabled-research plan; provider calls are additive.
  }

  const kind = resolveResearchPlanKind(input);

  switch (kind) {
    case "ranked_list":
      return planRankedList(input);
    case "player_profile":
      return planPlayerProfile(input);
    case "match_preview":
      return planMatchPreview(input);
    case "match_recap":
      return planMatchRecap(input);
    case "tactical_breakdown":
      return planTacticalBreakdown(input);
    case "optional_research":
    default:
      return planOptionalResearch(input);
  }
}
