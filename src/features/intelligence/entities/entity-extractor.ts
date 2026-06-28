import type { EntityCandidate, EntityType } from "./entity-types";
import {
  CLUB_ALIAS_ENTRIES,
  FIXTURE_NICKNAME_RULES,
  getAmbiguousPlayerAlternatives,
  isAmbiguousPlayerTerm,
  isKnownClubName,
  isKnownManagerName,
  resolveClubAlias,
  resolveKnownClubDisplayName,
  resolveKnownManagerDisplayName,
} from "./entity-catalog.utils";
import {
  prefersPlayerExtraction,
  shouldExtractTeamsBeforePlayers,
} from "./entity-routing.utils";
import {
  createEntityCandidate,
  createEntityConfidence,
  normalizeEntityName,
  normalizeEntityText,
} from "./entity-utils";
import { COMPETITION_CATALOG } from "@/features/intelligence/competitions";

const PLAYER_CONTEXT_PATTERN = /\b(?:player|goals|career|analysis|profile)\b/i;

interface PhraseRule {
  label: string;
  pattern: RegExp;
  type: EntityType;
  confidencePercent: number;
  league?: boolean;
  competitionKey?: string;
}

const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;
const MATCH_SPLIT_PATTERN = /\s+vs\.?\s+|\s+v\.?\s+|\s+against\s+/i;
const MANAGER_PATTERN =
  /\b(?:manager|head coach|coach)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z][a-z]+(?:\s+[a-z]+){0,2})/gi;

const COMPETITION_PHRASES: PhraseRule[] = [
  ...COMPETITION_CATALOG.flatMap((entry) =>
    entry.patterns.map((pattern) => ({
      label: entry.canonicalName,
      pattern,
      type: (entry.scope === "fifa_world_cup" ? "competition" : "league") as EntityType,
      confidencePercent: 86,
      league: entry.scope !== "fifa_world_cup",
      competitionKey: entry.scope,
    })),
  ),
  { label: "FA Cup", pattern: /\bfa cup\b/i, type: "competition", confidencePercent: 84 },
  { label: "Carabao Cup", pattern: /\bcarabao cup\b/i, type: "competition", confidencePercent: 82 },
  { label: "Copa del Rey", pattern: /\bcopa del rey\b/i, type: "competition", confidencePercent: 82 },
];

const NATIONAL_TEAM_NAMES = new Set(
  [
    "Spain",
    "Germany",
    "France",
    "Italy",
    "Brazil",
    "Argentina",
    "Portugal",
    "England",
    "Netherlands",
    "Belgium",
    "Croatia",
    "Uruguay",
    "Mexico",
    "USA",
    "United States",
    "Morocco",
    "Japan",
    "South Korea",
    "Switzerland",
    "Denmark",
    "Sweden",
    "Poland",
    "Wales",
    "Scotland",
    "Senegal",
    "Cameroon",
    "Ghana",
    "Nigeria",
    "Canada",
    "Australia",
    "Colombia",
    "Chile",
    "Ecuador",
  ].map((name) => normalizeEntityName(name)),
);

const COUNTRY_PHRASES: PhraseRule[] = [
  { label: "Portugal", pattern: /\bportugal\b/i, type: "country", confidencePercent: 75 },
  { label: "Brazil", pattern: /\bbrazil\b/i, type: "country", confidencePercent: 75 },
  { label: "Argentina", pattern: /\bargentina\b/i, type: "country", confidencePercent: 75 },
  { label: "England", pattern: /\bengland\b/i, type: "country", confidencePercent: 75 },
  { label: "France", pattern: /\bfrance\b/i, type: "country", confidencePercent: 75 },
  { label: "Germany", pattern: /\bgermany\b/i, type: "country", confidencePercent: 75 },
  { label: "Spain", pattern: /\bspain\b/i, type: "country", confidencePercent: 75 },
  { label: "Italy", pattern: /\bitaly\b/i, type: "country", confidencePercent: 75 },
];

const STRIP_PHRASES: RegExp[] = [
  /\btop\s+\d{1,2}\b/gi,
  /\btop five\b/gi,
  /\btop scorers?\b/gi,
  /\btop assists?\b/gi,
  /\bgolden boot\b/gi,
  /\bmost goals\b/gi,
  /\bmost assists\b/gi,
  /\bscorers?\b/gi,
  /\bpreview\b/gi,
  /\brecap\b/gi,
  /\bhighlights\b/gi,
  /\btactical analysis\b/gi,
  /\btactical breakdown\b/gi,
  /\bplayer profile\b/gi,
  /\bplayer analysis\b/gi,
  /\branked list\b/gi,
  /\bcountdown\b/gi,
  /\bfifa\b/gi,
  ...COMPETITION_PHRASES.map((rule) => rule.pattern),
  YEAR_PATTERN,
  MANAGER_PATTERN,
];

const PLAYER_REMAINDER_STOP_WORDS = new Set([
  "under",
  "the",
  "a",
  "an",
  "for",
  "with",
  "about",
  "why",
  "how",
  "top",
]);

const PLAYER_NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;

function slugify(value: string): string {
  return normalizeEntityName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildCandidateId(type: EntityType, name: string): string {
  return `candidate:${type}:${slugify(name)}`;
}

function confidenceFromPercent(percent: number) {
  const tier = percent >= 85 ? "high" : percent >= 65 ? "medium" : "low";
  return createEntityConfidence({ tier, percent });
}

function splitMatchSides(topic: string): string[] {
  return topic
    .split(MATCH_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanSideLabel(side: string): string {
  const cleaned = side
    .replace(/\b(tactical analysis|tactical breakdown|preview|recap|highlights)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return resolveClubAlias(cleaned) ?? cleaned;
}

function isNationalTeamSide(side: string): boolean {
  return NATIONAL_TEAM_NAMES.has(normalizeEntityName(side));
}

function addCandidate(
  bucket: Map<string, EntityCandidate>,
  candidate: EntityCandidate,
): void {
  const key = `${candidate.type}:${normalizeEntityName(candidate.name)}`;
  const existing = bucket.get(key);
  if (!existing || existing.confidence.percent < candidate.confidence.percent) {
    bucket.set(key, candidate);
  }
}

function extractSeasonCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  for (const match of text.matchAll(YEAR_PATTERN)) {
    const year = match[0];
    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId("season", year),
        name: year,
        displayName: year,
        type: "season",
        matchedPhrase: year,
        confidence: confidenceFromPercent(92),
        metadata: { year: Number(year) },
      }),
    );
  }
}

function extractPhraseCandidates(
  text: string,
  rules: PhraseRule[],
  bucket: Map<string, EntityCandidate>,
): void {
  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    if (
      rule.label === "World Cup" &&
      /\bfifa world cup\b/i.test(text)
    ) {
      continue;
    }

    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId(rule.type, rule.label),
        name: normalizeEntityName(rule.label),
        displayName: rule.label,
        type: rule.type,
        matchedPhrase: rule.label,
        confidence: confidenceFromPercent(rule.confidencePercent),
        metadata: {
          ...(rule.league ? { league: true } : {}),
          ...(rule.competitionKey ? { competitionKey: rule.competitionKey } : {}),
        },
      }),
    );
  }
}

function extractNicknameFixtureCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  for (const rule of FIXTURE_NICKNAME_RULES) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const fixtureLabel = `${rule.home} vs ${rule.away}`;
    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId("fixture", rule.label),
        name: normalizeEntityName(rule.label),
        displayName: fixtureLabel,
        type: "fixture",
        matchedPhrase: rule.label,
        confidence: confidenceFromPercent(88),
        metadata: {
          homeSide: rule.home,
          awaySide: rule.away,
          teamType: "club",
        },
      }),
    );

    for (const side of [rule.home, rule.away]) {
      addCandidate(
        bucket,
        createEntityCandidate({
          id: buildCandidateId("club", side),
          name: normalizeEntityName(side),
          displayName: side,
          type: "club",
          matchedPhrase: rule.label,
          confidence: confidenceFromPercent(86),
        }),
      );
    }
  }
}

function extractAliasClubCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  for (const entry of CLUB_ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(
        `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (!pattern.test(text)) {
        continue;
      }

      addCandidate(
        bucket,
        createEntityCandidate({
          id: buildCandidateId("club", entry.canonical),
          name: normalizeEntityName(entry.canonical),
          displayName: entry.canonical,
          type: "club",
          matchedPhrase: alias,
          aliases: [...entry.aliases],
          confidence: confidenceFromPercent(86),
        }),
      );
    }
  }
}

function extractKnownClubCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  const remainder = stripKnownPhrases(text);
  if (!remainder || MATCH_SPLIT_PATTERN.test(text)) {
    return;
  }

  const clubName = resolveKnownClubDisplayName(remainder);
  if (!clubName) {
    return;
  }

  addCandidate(
    bucket,
    createEntityCandidate({
      id: buildCandidateId("club", clubName),
      name: normalizeEntityName(clubName),
      displayName: clubName,
      type: "club",
      matchedPhrase: remainder,
      confidence: confidenceFromPercent(84),
    }),
  );
}

function extractClubCandidatesFromMatchSides(text: string, bucket: Map<string, EntityCandidate>): void {
  if (!MATCH_SPLIT_PATTERN.test(text)) {
    return;
  }

  for (const side of splitMatchSides(text).map(cleanSideLabel).filter(Boolean)) {
    const clubName = resolveKnownClubDisplayName(side) ?? resolveClubAlias(side);
    if (!clubName) {
      continue;
    }

    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId("club", clubName),
        name: normalizeEntityName(clubName),
        displayName: clubName,
        type: "club",
        matchedPhrase: side,
        confidence: confidenceFromPercent(82),
      }),
    );
  }
}

function extractStandaloneManagerCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  const remainder = stripKnownPhrases(text);
  if (!remainder) {
    return;
  }

  const managerName = resolveKnownManagerDisplayName(remainder);
  if (!managerName) {
    return;
  }

  addCandidate(
    bucket,
    createEntityCandidate({
      id: buildCandidateId("manager", managerName),
      name: normalizeEntityName(managerName),
      displayName: managerName,
      type: "manager",
      matchedPhrase: remainder,
      confidence: confidenceFromPercent(88),
    }),
  );
}

function extractFixtureAndTeamCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  if (!MATCH_SPLIT_PATTERN.test(text)) {
    return;
  }

  const sides = splitMatchSides(text).map(cleanSideLabel).filter(Boolean);
  if (sides.length < 2) {
    return;
  }

  const home = sides[0]!;
  const away = sides[1]!;
  const fixtureLabel = `${home} vs ${away}`;
  const bothNational = isNationalTeamSide(home) && isNationalTeamSide(away);
  const teamType: EntityType = bothNational ? "national_team" : "club";

  addCandidate(
    bucket,
    createEntityCandidate({
      id: buildCandidateId("fixture", fixtureLabel),
      name: normalizeEntityName(fixtureLabel),
      displayName: fixtureLabel,
      type: "fixture",
      matchedPhrase: fixtureLabel,
      confidence: confidenceFromPercent(bothNational ? 84 : 80),
      metadata: {
        homeSide: home,
        awaySide: away,
        teamType,
      },
    }),
  );

  for (const side of sides.slice(0, 2)) {
    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId(teamType, side),
        name: normalizeEntityName(side),
        displayName: side,
        type: teamType,
        matchedPhrase: side,
        confidence: confidenceFromPercent(bothNational ? 82 : 78),
      }),
    );
  }
}

function extractManagerCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  for (const match of text.matchAll(MANAGER_PATTERN)) {
    const rawName = match[1]?.trim();
    if (!rawName) {
      continue;
    }

    const displayName = rawName
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");

    addCandidate(
      bucket,
      createEntityCandidate({
        id: buildCandidateId("manager", displayName),
        name: normalizeEntityName(displayName),
        displayName,
        type: "manager",
        matchedPhrase: match[0],
        confidence: confidenceFromPercent(86),
      }),
    );
  }
}

function stripKnownPhrases(text: string): string {
  let remainder = text.replace(MANAGER_PATTERN, " ");
  for (const pattern of STRIP_PHRASES) {
    remainder = remainder.replace(pattern, " ");
  }
  remainder = remainder.replace(MATCH_SPLIT_PATTERN, " ");
  return normalizeEntityText(remainder);
}

function extractPlayerCandidates(text: string, bucket: Map<string, EntityCandidate>): void {
  const remainder = stripKnownPhrases(text);
  if (!remainder) {
    return;
  }

  const matchedNames = new Set<string>();

  for (const match of remainder.matchAll(PLAYER_NAME_PATTERN)) {
    const displayName = normalizeEntityText(match[1] ?? "");
    if (displayName.length < 3 || matchedNames.has(normalizeEntityName(displayName))) {
      continue;
    }

    if (isKnownClubName(displayName) || resolveClubAlias(displayName)) {
      continue;
    }

    matchedNames.add(normalizeEntityName(displayName));
    addPlayerCandidate(bucket, displayName, displayName, confidenceFromPercent(76));
  }

  if (matchedNames.size === 0 && remainder.length >= 3 && !/\d/.test(remainder)) {
    const words = remainder.split(/\s+/);
    if (
      words.length <= 4 &&
      !words.some((word) => PLAYER_REMAINDER_STOP_WORDS.has(normalizeEntityName(word))) &&
      !isKnownClubName(remainder) &&
      !resolveClubAlias(remainder) &&
      !isKnownManagerName(remainder)
    ) {
      const displayName = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      const confidence = isAmbiguousPlayerTerm(displayName)
        ? confidenceFromPercent(58)
        : confidenceFromPercent(words.length === 1 ? 64 : 68);

      addPlayerCandidate(bucket, displayName, remainder, confidence);
    }
  }
}

function addPlayerCandidate(
  bucket: Map<string, EntityCandidate>,
  displayName: string,
  matchedPhrase: string,
  confidence: ReturnType<typeof confidenceFromPercent>,
): void {
  const alternatives = getAmbiguousPlayerAlternatives(displayName);

  addCandidate(
    bucket,
    createEntityCandidate({
      id: buildCandidateId("player", displayName),
      name: normalizeEntityName(displayName),
      displayName,
      type: "player",
      matchedPhrase,
      confidence,
      ...(alternatives.length > 0
        ? {
            metadata: {
              ambiguous: true,
              alternatives: alternatives.join("|"),
            },
          }
        : {}),
    }),
  );
}

function collectAmbiguities(candidates: EntityCandidate[]): string[] {
  const ambiguities: string[] = [];
  const players = candidates.filter((candidate) => candidate.type === "player");

  if (players.length > 1) {
    ambiguities.push("Multiple player names detected — disambiguation may be required.");
  }

  if (players.length === 1 && players[0]?.displayName.split(/\s+/).length === 1) {
    const playerName = players[0]!.displayName;
    if (isAmbiguousPlayerTerm(playerName)) {
      const alternatives = getAmbiguousPlayerAlternatives(playerName);
      ambiguities.push(
        `"${playerName}" is ambiguous — may refer to ${alternatives.join(" or ")}. Verify before resolving.`,
      );
    } else {
      ambiguities.push(
        `Single-name player "${playerName}" may be ambiguous — verify the correct person.`,
      );
    }
  }

  const fixture = candidates.find((candidate) => candidate.type === "fixture");
  if (fixture && players.length > 0) {
    ambiguities.push("Both fixture and player entities detected — confirm primary focus.");
  }

  return ambiguities;
}

/**
 * Extracts entity candidates from free-form topic text using heuristics only.
 * No provider/API calls.
 */
export interface ExtractEntityCandidatesOptions {
  mode?: import("@/types/footiebitz").ScriptMode;
}

export function extractEntityCandidates(
  topic: string,
  options?: ExtractEntityCandidatesOptions,
): EntityCandidate[] {
  const normalizedText = normalizeEntityText(topic);
  if (!normalizedText) {
    return [];
  }

  const bucket = new Map<string, EntityCandidate>();
  const teamFirst = shouldExtractTeamsBeforePlayers(normalizedText, options?.mode);
  const playerFirst = prefersPlayerExtraction(normalizedText, options?.mode);

  extractSeasonCandidates(normalizedText, bucket);
  extractPhraseCandidates(normalizedText, COMPETITION_PHRASES, bucket);
  extractPhraseCandidates(normalizedText, COUNTRY_PHRASES, bucket);
  extractNicknameFixtureCandidates(normalizedText, bucket);
  extractFixtureAndTeamCandidates(normalizedText, bucket);
  extractAliasClubCandidates(normalizedText, bucket);
  extractClubCandidatesFromMatchSides(normalizedText, bucket);
  extractManagerCandidates(normalizedText, bucket);
  extractStandaloneManagerCandidates(normalizedText, bucket);

  if (teamFirst || !playerFirst) {
    extractKnownClubCandidates(normalizedText, bucket);
  }

  const hasTeamEntity = [...bucket.values()].some(
    (candidate) =>
      candidate.type === "fixture" ||
      candidate.type === "club" ||
      candidate.type === "national_team",
  );
  const hasManager = [...bucket.values()].some((candidate) => candidate.type === "manager");

  const shouldExtractPlayers =
    (playerFirst && !hasTeamEntity) ||
    (prefersPlayerExtraction(normalizedText, options?.mode) &&
      PLAYER_CONTEXT_PATTERN.test(normalizedText)) ||
    (!teamFirst && !hasTeamEntity && !hasManager);

  if (shouldExtractPlayers) {
    extractPlayerCandidates(normalizedText, bucket);
  }

  return [...bucket.values()].sort((a, b) => b.confidence.percent - a.confidence.percent);
}

export function extractEntityCandidatesWithMeta(
  topic: string,
  options?: ExtractEntityCandidatesOptions,
): {
  candidates: EntityCandidate[];
  ambiguities: string[];
  normalizedText: string;
} {
  const normalizedText = normalizeEntityText(topic);
  const candidates = extractEntityCandidates(topic, options);
  return {
    candidates,
    ambiguities: collectAmbiguities(candidates),
    normalizedText,
  };
}
