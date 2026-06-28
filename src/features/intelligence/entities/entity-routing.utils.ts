import type { ScriptMode } from "@/types/footiebitz";

import type { EntityCandidate, EntityResolution } from "./entity-types";
import {
  FIXTURE_NICKNAME_RULES,
  isAmbiguousPlayerTerm,
  isKnownClubName,
  isKnownManagerName,
  resolveClubAlias,
  textContainsClubAlias,
} from "./entity-catalog.utils";
import { normalizeEntityName } from "./entity-utils";

export interface EntityResolutionPlan {
  player?: EntityCandidate;
  competition?: EntityCandidate;
  season?: EntityCandidate;
  teams: EntityCandidate[];
  manager?: EntityCandidate;
}

const YEAR_IN_TEXT = /\b(19|20)\d{2}\b/;

const MATCH_CONTEXT_PATTERN =
  /\b(?:vs\.?|v\.|\bagainst\b|\bmatch\b|\bpreview\b|\brecap\b|\btactical)\b/i;

const CLUB_MARKER_PATTERN =
  /\b(?:FC|United|City|Real|Atletico|Atlético|Inter|AC|Bayern|Dortmund)\b/i;

const PLAYER_CONTEXT_PATTERN = /\b(?:player|goals|career|analysis|profile)\b/i;

const MATCH_SPLIT_PATTERN = /\s+vs\.?\s+|\s+v\.?\s+|\s+against\s+/i;

const MATCH_FOCUSED_MODES: ScriptMode[] = [
  "tactical_review",
  "match_preview",
  "match_recap",
];

const HIGH_CONFIDENCE_PERCENT = 85;

export function topicHasExplicitSeasonYear(text: string): boolean {
  return YEAR_IN_TEXT.test(text);
}

export function prefersTeamExtraction(text: string, mode?: ScriptMode): boolean {
  if (prefersPlayerExtraction(text, mode)) {
    return false;
  }

  if (MATCH_SPLIT_PATTERN.test(text)) {
    return true;
  }

  if (MATCH_CONTEXT_PATTERN.test(text)) {
    return true;
  }

  if (CLUB_MARKER_PATTERN.test(text)) {
    return true;
  }

  if (textContainsClubAlias(text)) {
    return true;
  }

  if (mode && isMatchFocusedMode(mode)) {
    return true;
  }

  const remainder = normalizeEntityName(text);
  if (isKnownClubName(remainder) || resolveClubAlias(text)) {
    return true;
  }

  return false;
}

export function prefersPlayerExtraction(text: string, mode?: ScriptMode): boolean {
  if (FIXTURE_NICKNAME_RULES.some((rule) => rule.pattern.test(text))) {
    return false;
  }

  if (mode === "player_analysis") {
    return true;
  }

  if (PLAYER_CONTEXT_PATTERN.test(text)) {
    return true;
  }

  return isBarePersonLikeName(text);
}

export function isBarePersonLikeName(text: string): boolean {
  const stripped = stripRoutingPhrases(text);
  if (!stripped || MATCH_SPLIT_PATTERN.test(text)) {
    return false;
  }

  if (CLUB_MARKER_PATTERN.test(stripped)) {
    return false;
  }

  if (textContainsClubAlias(stripped)) {
    return false;
  }

  if (isKnownClubName(stripped) || resolveClubAlias(stripped)) {
    return false;
  }

  if (isKnownManagerName(stripped)) {
    return false;
  }

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) {
    return false;
  }

  if (!/^[A-Za-zÀ-ÿ'.-]+(\s+[A-Za-zÀ-ÿ'.-]+)*$/.test(stripped)) {
    return false;
  }

  return true;
}

export function shouldExtractTeamsBeforePlayers(text: string, mode?: ScriptMode): boolean {
  return prefersTeamExtraction(text, mode);
}

export function buildEntityResolutionPlan(
  extraction: EntityResolution,
  mode?: ScriptMode,
): EntityResolutionPlan {
  const { candidates, normalizedText } = extraction;

  const teams = candidates.filter(
    (candidate) => candidate.type === "club" || candidate.type === "national_team",
  );
  const competition = candidates.find(
    (candidate) => candidate.type === "competition" || candidate.type === "league",
  );
  const season = candidates.find((candidate) => candidate.type === "season");
  const manager = candidates.find((candidate) => candidate.type === "manager");
  const playerCandidates = candidates.filter((candidate) => candidate.type === "player");

  let player: EntityCandidate | undefined = playerCandidates[0];

  if (player && prefersTeamExtraction(normalizedText, mode)) {
    player = undefined;
  }

  if (player && shouldPreferTeamOverPlayer(normalizedText, player, teams)) {
    player = undefined;
  }

  if (player && manager && overlapsCandidate(player, manager)) {
    player = undefined;
  }

  if (player && isKnownClubName(player.displayName)) {
    player = undefined;
  }

  if (player && isKnownManagerName(player.displayName)) {
    player = undefined;
  }

  if (
    player &&
    isAmbiguousPlayerTerm(player.displayName) &&
    player.confidence.percent < HIGH_CONFIDENCE_PERCENT
  ) {
    player = undefined;
  }

  return {
    player,
    competition,
    season: season && topicHasExplicitSeasonYear(normalizedText) ? season : undefined,
    teams,
    manager,
  };
}

function isMatchFocusedMode(mode: ScriptMode): boolean {
  return MATCH_FOCUSED_MODES.includes(mode);
}

function stripRoutingPhrases(text: string): string {
  return text
    .replace(/\btop\s+\d{1,2}\b/gi, " ")
    .replace(/\b(top scorers?|golden boot|most goals|highlights|preview|recap|tactical analysis|tactical breakdown|player profile|player analysis)\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(MATCH_SPLIT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlapsCandidate(a: EntityCandidate, b: EntityCandidate): boolean {
  return normalizeEntityName(a.displayName) === normalizeEntityName(b.displayName);
}

function shouldPreferTeamOverPlayer(
  normalizedText: string,
  player: EntityCandidate,
  teams: EntityCandidate[],
): boolean {
  const playerKey = normalizeEntityName(player.displayName);

  if (teams.some((team) => normalizeEntityName(team.displayName) === playerKey)) {
    return true;
  }

  if (isKnownClubName(player.displayName) && normalizedText === playerKey) {
    return true;
  }

  return false;
}
