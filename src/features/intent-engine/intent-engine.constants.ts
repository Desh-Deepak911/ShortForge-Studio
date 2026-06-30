import type { Intent } from "./intent-engine.types";

export const INTENT_ENGINE_VERSION = "2.0.0";

/** Minimum normalized confidence for high-quality audit classifications. */
export const INTENT_QUALITY_CONFIDENCE_THRESHOLD = 0.8;

/** Fixture-language signals required before a vs-matchup can boost match preview. */
export const FIXTURE_PREVIEW_SIGNALS: readonly RegExp[] = [
  /\bmatch preview\b/i,
  /\bpreview\b/i,
  /\bprediction\b/i,
  /\blineups?\b/i,
  /\bstarting xi\b/i,
  /\bkick[- ]?off\b/i,
  /\bmatchday\b/i,
  /\bhead to head today\b/i,
  /\bthis weekend\b/i,
  /\btomorrow\b/i,
  /\btonight\b/i,
  /\blive\b/i,
  /\bexpected lineup\b/i,
  /\bwho will win\b/i,
  /\bscore prediction\b/i,
  /\bbuild[- ]up\b/i,
  /\bbefore kick[- ]?off\b/i,
  /\bahead of\b/i,
  /\bupcoming\b/i,
];

/** Signals that a vs-style topic is an opinion/comparison, not a fixture preview. */
export const PLAYER_COMPARISON_SIGNALS: readonly RegExp[] = [
  /\bgoat\b/i,
  /\bgreatest of all time\b/i,
  /\bunderrated\b/i,
  /\boverrated\b/i,
  /\bwho is better\b/i,
  /\bwho is greater\b/i,
  /\bhot take\b/i,
  /\bunpopular opinion\b/i,
  /\bdebate\b/i,
  /\bdeserves\b/i,
  /\bshould\b/i,
  /\bopinion\b/i,
  /\bversus\b/i,
  /\bor\b/i,
];

/** Team/fixture entity hints — countries and club suffixes common in match previews. */
export const TEAM_ENTITY_SIGNALS: readonly RegExp[] = [
  /\bfc\b/i,
  /\bunited\b/i,
  /\bcity\b/i,
  /\breal\b/i,
  /\bbarcelona\b/i,
  /\barsenal\b/i,
  /\bchelsea\b/i,
  /\bliverpool\b/i,
  /\bbrazil\b/i,
  /\bargentina\b/i,
  /\bindia\b/i,
  /\bpakistan\b/i,
  /\bengland\b/i,
  /\bfrance\b/i,
  /\bgermany\b/i,
  /\bspain\b/i,
  /\bitaly\b/i,
  /\bportugal\b/i,
  /\bnational team\b/i,
];

export const MATCHUP_SEPARATOR_PATTERN = /\s+vs\.?\s+|\s+v\.?\s+|\s+versus\s+/i;

export const PAST_MATCH_SIGNALS: readonly RegExp[] = [
  /\brecap\b/i,
  /\bhighlights\b/i,
  /\bfull[- ]time\b/i,
  /\bft\b/i,
  /\blast night\b/i,
  /\byesterday\b/i,
  /\bresult\b/i,
  /\bbeat\b/i,
  /\bdefeated\b/i,
  /\bwon \d/i,
  /\bdrew \d/i,
  /\blost \d/i,
  /\b\d-\d\b/,
];

export const DEFAULT_INTENT: Intent = "story";
