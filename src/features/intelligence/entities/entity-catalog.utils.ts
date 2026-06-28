import { normalizeEntityName, normalizeEntityText } from "./entity-utils";

/** Fixture nicknames mapped to canonical sides. */
export const FIXTURE_NICKNAME_RULES = [
  {
    pattern: /\bel clasico\b/i,
    label: "El Clasico",
    home: "Barcelona",
    away: "Real Madrid",
  },
] as const;

export const CLUB_ALIAS_ENTRIES = [
  { aliases: ["barca", "barça", "fc barcelona"], canonical: "Barcelona" },
  { aliases: ["real madrid"], canonical: "Real Madrid" },
  { aliases: ["man city", "manchester city"], canonical: "Manchester City" },
  { aliases: ["man united", "man utd", "manchester united"], canonical: "Manchester United" },
  { aliases: ["psg", "paris saint germain", "paris saint-germain"], canonical: "Paris Saint-Germain" },
  { aliases: ["juve"], canonical: "Juventus" },
  { aliases: ["inter", "inter milan"], canonical: "Inter Milan" },
  { aliases: ["bayern", "fc bayern", "bayern munich"], canonical: "Bayern Munich" },
  { aliases: ["bvb", "dortmund", "borussia dortmund"], canonical: "Borussia Dortmund" },
  { aliases: ["atletico", "atletico madrid", "atlético madrid"], canonical: "Atletico Madrid" },
  { aliases: ["ac milan"], canonical: "AC Milan" },
] as const;

export const KNOWN_CLUB_NAMES = [
  "Arsenal",
  "Barcelona",
  "Bayern Munich",
  "Borussia Dortmund",
  "Chelsea",
  "Inter Milan",
  "Juventus",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Paris Saint-Germain",
  "Real Madrid",
  "Tottenham Hotspur",
  "AC Milan",
  "Atletico Madrid",
  "Newcastle United",
  "Aston Villa",
  "West Ham United",
] as const;

export const KNOWN_MANAGER_NAMES = [
  "Pep Guardiola",
  "Jurgen Klopp",
  "Carlo Ancelotti",
  "Mikel Arteta",
  "Xavi Hernandez",
  "Erik ten Hag",
  "Ange Postecoglou",
  "Roberto De Zerbi",
] as const;

/** Single-name or short player terms that need explicit disambiguation. */
export const AMBIGUOUS_PLAYER_TERMS: Record<string, readonly string[]> = {
  ronaldo: ["Cristiano Ronaldo", "Ronaldo Nazário"],
};

const KNOWN_CLUB_LOOKUP = new Set(KNOWN_CLUB_NAMES.map((name) => normalizeEntityName(name)));

const KNOWN_MANAGER_LOOKUP = new Set(
  KNOWN_MANAGER_NAMES.map((name) => normalizeEntityName(name)),
);

const CLUB_ALIAS_LOOKUP = new Map<string, string>();

for (const entry of CLUB_ALIAS_ENTRIES) {
  for (const alias of entry.aliases) {
    CLUB_ALIAS_LOOKUP.set(normalizeAliasKey(alias), entry.canonical);
  }
}

for (const club of KNOWN_CLUB_NAMES) {
  CLUB_ALIAS_LOOKUP.set(normalizeAliasKey(club), club);
}

export function normalizeAliasKey(value: string): string {
  return normalizeEntityText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function resolveClubAlias(value: string): string | undefined {
  const trimmed = normalizeEntityText(value);
  if (!trimmed) {
    return undefined;
  }

  return CLUB_ALIAS_LOOKUP.get(normalizeAliasKey(trimmed));
}

export function isKnownClubName(value: string): boolean {
  const canonical = resolveClubAlias(value) ?? value;
  return KNOWN_CLUB_LOOKUP.has(normalizeEntityName(canonical));
}

export function isKnownManagerName(value: string): boolean {
  return KNOWN_MANAGER_LOOKUP.has(normalizeEntityName(value));
}

export function resolveKnownClubDisplayName(value: string): string | undefined {
  const alias = resolveClubAlias(value);
  if (alias) {
    return alias;
  }

  const normalized = normalizeEntityName(value);
  return KNOWN_CLUB_NAMES.find((club) => normalizeEntityName(club) === normalized);
}

export function resolveKnownManagerDisplayName(value: string): string | undefined {
  const normalized = normalizeEntityName(value);
  return KNOWN_MANAGER_NAMES.find((manager) => normalizeEntityName(manager) === normalized);
}

export function isAmbiguousPlayerTerm(value: string): boolean {
  return normalizeAliasKey(value) in AMBIGUOUS_PLAYER_TERMS;
}

export function getAmbiguousPlayerAlternatives(value: string): readonly string[] {
  return AMBIGUOUS_PLAYER_TERMS[normalizeAliasKey(value)] ?? [];
}

export function textContainsClubAlias(text: string): boolean {
  const normalized = normalizeEntityText(text);
  for (const alias of CLUB_ALIAS_LOOKUP.keys()) {
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
