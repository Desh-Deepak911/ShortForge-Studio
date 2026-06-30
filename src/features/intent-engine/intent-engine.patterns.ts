import type { SubIntentPatternRule, WeightedIntentPatternRule } from "./intent-engine.types";

export const PRIMARY_INTENT_PATTERNS: readonly WeightedIntentPatternRule[] = [
  // Opinion / debate / comparison (high priority)
  { intent: "opinion", pattern: /\bgoat\b/i, label: "GOAT", weight: 5 },
  { intent: "opinion", pattern: /\bgreatest of all time\b/i, label: "greatest of all time", weight: 5 },
  { intent: "opinion", pattern: /\bunderrated\b/i, label: "underrated", weight: 4.5 },
  { intent: "opinion", pattern: /\boverrated\b/i, label: "overrated", weight: 4.5 },
  { intent: "opinion", pattern: /\bwho is better\b/i, label: "who is better", weight: 4.5 },
  { intent: "opinion", pattern: /\bwho is greater\b/i, label: "who is greater", weight: 4.5 },
  { intent: "opinion", pattern: /\bunpopular opinion\b/i, label: "unpopular opinion", weight: 4 },
  { intent: "opinion", pattern: /\bhot take\b/i, label: "hot take", weight: 4 },
  { intent: "opinion", pattern: /\bdebate\b/i, label: "debate", weight: 3.5 },
  { intent: "opinion", pattern: /\bdeserves\b/i, label: "deserves", weight: 3 },
  { intent: "opinion", pattern: /\bshould\b/i, label: "should", weight: 2.5 },
  { intent: "opinion", pattern: /\bopinion\b/i, label: "opinion", weight: 3 },
  {
    intent: "opinion",
    pattern: /\b\w+\s+vs\.?\s+\w+\b/i,
    label: "named comparison (vs)",
    weight: 3,
    suppresses: ["match_preview"],
  },
  {
    intent: "opinion",
    pattern: /\b\w+\s+or\s+\w+\b/i,
    label: "either-or comparison",
    weight: 2.5,
    suppresses: ["match_preview"],
  },

  // Countdown / ranked list
  { intent: "ranked_list", pattern: /\btop\s+\d{1,2}\b/i, label: "top N list", weight: 5 },
  { intent: "ranked_list", pattern: /\btop five\b/i, label: "top five", weight: 5 },
  { intent: "ranked_list", pattern: /\btop 5\b/i, label: "top 5", weight: 5 },
  { intent: "ranked_list", pattern: /\btop 10\b/i, label: "top 10", weight: 5 },
  { intent: "ranked_list", pattern: /\bcountdown\b/i, label: "countdown", weight: 4.5 },
  { intent: "ranked_list", pattern: /\branked list\b/i, label: "ranked list", weight: 4.5 },
  { intent: "ranked_list", pattern: /\bbest \d{1,2}\b/i, label: "best N", weight: 4 },
  { intent: "ranked_list", pattern: /\bfive greatest\b/i, label: "five greatest", weight: 4.5 },
  { intent: "ranked_list", pattern: /\bgreatest nights\b/i, label: "greatest nights", weight: 4.5 },
  { intent: "ranked_list", pattern: /\bgreatest\b.*\bnights\b/i, label: "greatest nights (flexible)", weight: 4.5 },
  { intent: "ranked_list", pattern: /\bbest goals\b/i, label: "best goals", weight: 4 },
  { intent: "ranked_list", pattern: /\bgreatest\b/i, label: "greatest", weight: 3 },
  { intent: "ranked_list", pattern: /\bbest\b/i, label: "best", weight: 2.5 },
  { intent: "ranked_list", pattern: /\branking\b/i, label: "ranking", weight: 3 },
  { intent: "ranked_list", pattern: /\bmost\b/i, label: "most", weight: 2.5 },
  { intent: "ranked_list", pattern: /\bgolden boot\b/i, label: "golden boot", weight: 3.5 },

  // Match preview (fixture language — not vs alone)
  { intent: "match_preview", pattern: /\bmatch preview\b/i, label: "match preview phrase", weight: 6 },
  { intent: "match_preview", pattern: /\bscore prediction\b/i, label: "score prediction", weight: 5 },
  { intent: "match_preview", pattern: /\bexpected lineup\b/i, label: "expected lineup", weight: 5 },
  { intent: "match_preview", pattern: /\bstarting xi\b/i, label: "starting XI", weight: 5 },
  { intent: "match_preview", pattern: /\bmatchday\b/i, label: "matchday", weight: 4.5 },
  { intent: "match_preview", pattern: /\blineups?\b/i, label: "lineup", weight: 4 },
  { intent: "match_preview", pattern: /\bwho will win\b/i, label: "who will win", weight: 4 },
  { intent: "match_preview", pattern: /\bprediction\b/i, label: "prediction", weight: 3.5 },
  { intent: "match_preview", pattern: /\bpreview\b/i, label: "preview", weight: 3.5 },
  { intent: "match_preview", pattern: /\bbuild[- ]up\b/i, label: "build-up", weight: 3 },
  { intent: "match_preview", pattern: /\bbefore kick[- ]?off\b/i, label: "before kick-off", weight: 3 },
  { intent: "match_preview", pattern: /\bahead of\b/i, label: "ahead of", weight: 2.5 },
  { intent: "match_preview", pattern: /\bupcoming\b/i, label: "upcoming", weight: 2.5 },
  { intent: "match_preview", pattern: /\bthis weekend\b/i, label: "this weekend", weight: 2.5 },
  { intent: "match_preview", pattern: /\btomorrow\b/i, label: "tomorrow", weight: 2.5 },
  { intent: "match_preview", pattern: /\btonight\b/i, label: "tonight", weight: 2.5 },
  { intent: "match_preview", pattern: /\blive\b/i, label: "live", weight: 2 },

  // Match recap
  { intent: "match_recap", pattern: /\bmatch recap\b/i, label: "match recap phrase", weight: 6 },
  { intent: "match_recap", pattern: /\brecap\b/i, label: "recap", weight: 3.5 },
  { intent: "match_recap", pattern: /\bhighlights\b/i, label: "highlights", weight: 3.5 },
  { intent: "match_recap", pattern: /\blast night\b/i, label: "last night", weight: 2.5 },
  { intent: "match_recap", pattern: /\bfull[- ]time\b/i, label: "full-time", weight: 2.5 },
  { intent: "match_recap", pattern: /\bresult\b/i, label: "result", weight: 2 },

  // Tactical analysis
  { intent: "tactical_breakdown", pattern: /\btactical breakdown\b/i, label: "tactical breakdown phrase", weight: 6 },
  { intent: "tactical_breakdown", pattern: /\btactical analysis\b/i, label: "tactical analysis phrase", weight: 6 },
  { intent: "tactical_breakdown", pattern: /\bchanged football tactics\b/i, label: "changed football tactics", weight: 5.5 },
  { intent: "tactical_breakdown", pattern: /\bfootball tactics\b/i, label: "football tactics", weight: 5 },
  { intent: "tactical_breakdown", pattern: /\btactics\b/i, label: "tactics", weight: 4.5 },
  { intent: "tactical_breakdown", pattern: /\btactical\b/i, label: "tactical", weight: 4 },
  { intent: "tactical_breakdown", pattern: /\bformation\b/i, label: "formation", weight: 3.5 },
  { intent: "tactical_breakdown", pattern: /\bpressing\b/i, label: "pressing", weight: 3 },
  { intent: "tactical_breakdown", pattern: /\bxg\b/i, label: "xG", weight: 3 },
  { intent: "tactical_breakdown", pattern: /\blow block\b/i, label: "low block", weight: 3 },

  // Historical explainer
  { intent: "historical_explainer", pattern: /\bhistorical explainer\b/i, label: "historical explainer phrase", weight: 6 },
  { intent: "historical_explainer", pattern: /\bwhy .+ collapsed\b/i, label: "why X collapsed", weight: 5.5 },
  { intent: "historical_explainer", pattern: /\bwhy\b/i, label: "why", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\bcollapse[d]?\b/i, label: "collapse", weight: 4 },
  { intent: "historical_explainer", pattern: /\bafter .+ left\b/i, label: "after X left", weight: 4.5 },
  { intent: "historical_explainer", pattern: /\bhistory of\b/i, label: "history of", weight: 4.5 },
  { intent: "historical_explainer", pattern: /\bhistory\b/i, label: "history", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\bevolution\b/i, label: "evolution", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\btransformed\b/i, label: "transformed", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\brevolutionized\b/i, label: "revolutionized", weight: 4 },
  { intent: "historical_explainer", pattern: /\bchanged football\b/i, label: "changed football", weight: 4 },
  {
    intent: "historical_explainer",
    pattern: /\bhow .+ changed\b/i,
    label: "how X changed",
    weight: 3.5,
    suppresses: ["tactical_breakdown"],
  },
  { intent: "historical_explainer", pattern: /\bfall of\b/i, label: "fall of", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\brise and fall\b/i, label: "rise and fall", weight: 3.5 },
  { intent: "historical_explainer", pattern: /\bhistorical\b/i, label: "historical", weight: 2.5 },
  { intent: "historical_explainer", pattern: /\blegacy\b/i, label: "legacy", weight: 2.5 },
  { intent: "historical_explainer", pattern: /\ball[- ]time\b/i, label: "all-time", weight: 2.5 },
  { intent: "historical_explainer", pattern: /\borigins of\b/i, label: "origins of", weight: 3 },

  // Biography / player analysis
  { intent: "player_profile", pattern: /\bthe rise of\b/i, label: "the rise of", weight: 5.5 },
  { intent: "player_profile", pattern: /\brise of\b/i, label: "rise of", weight: 5 },
  { intent: "player_profile", pattern: /\bplayer profile\b/i, label: "player profile phrase", weight: 5 },
  { intent: "player_profile", pattern: /\bplayer analysis\b/i, label: "player analysis phrase", weight: 5 },
  { intent: "player_profile", pattern: /\bstory of\b/i, label: "story of", weight: 4 },
  { intent: "player_profile", pattern: /\bjourney\b/i, label: "journey", weight: 3.5 },
  { intent: "player_profile", pattern: /\bcareer\b/i, label: "career", weight: 3.5 },
  { intent: "player_profile", pattern: /\bbreakthrough\b/i, label: "breakthrough", weight: 4 },
  { intent: "player_profile", pattern: /\byoung star\b/i, label: "young star", weight: 4 },
  { intent: "player_profile", pattern: /\bchildhood\b/i, label: "childhood", weight: 3 },
  { intent: "player_profile", pattern: /\bbecame\b/i, label: "became", weight: 2.5 },
  { intent: "player_profile", pattern: /\bwhy .+ is\b/i, label: "why X is", weight: 3 },
  { intent: "player_profile", pattern: /\bhow good is\b/i, label: "how good is", weight: 3 },
  { intent: "player_profile", pattern: /\bbreakout season\b/i, label: "breakout season", weight: 3.5 },
  {
    intent: "player_profile",
    pattern: /\b(striker|midfielder|winger|goalkeeper|defender)\b/i,
    label: "position mention",
    weight: 1.5,
  },

  // News
  { intent: "news", pattern: /\bbreaking\b/i, label: "breaking", weight: 4 },
  { intent: "news", pattern: /\blatest news\b/i, label: "latest news", weight: 3.5 },
  { intent: "news", pattern: /\bconfirmed\b/i, label: "confirmed", weight: 2.5 },
  { intent: "news", pattern: /\bannounced\b/i, label: "announced", weight: 2.5 },
  { intent: "news", pattern: /\breport\b/i, label: "report", weight: 2 },

  // Story fallback
  { intent: "story", pattern: /\bstory\b/i, label: "story keyword", weight: 1 },
  { intent: "story", pattern: /\bnarrative\b/i, label: "narrative", weight: 1 },
];

export const SUB_INTENT_PATTERNS: readonly SubIntentPatternRule[] = [
  { subIntent: "top_scorers", weight: 3, pattern: /\btop scorers\b/i, label: "top scorers" },
  { subIntent: "top_scorers", weight: 3, pattern: /\bgolden boot\b/i, label: "golden boot" },
  { subIntent: "top_scorers", weight: 2, pattern: /\bmost goals\b/i, label: "most goals" },
  { subIntent: "top_scorers", weight: 2, pattern: /\bgoal scorers?\b/i, label: "goal scorers" },

  { subIntent: "top_assists", weight: 3, pattern: /\btop assists\b/i, label: "top assists" },
  { subIntent: "top_assists", weight: 2, pattern: /\bmost assists\b/i, label: "most assists" },
  { subIntent: "top_assists", weight: 2, pattern: /\bplaymakers?\b/i, label: "playmaker" },

  { subIntent: "transfers", weight: 3, pattern: /\btransfer\b/i, label: "transfer" },
  { subIntent: "transfers", weight: 2, pattern: /\bsigning\b/i, label: "signing" },
  { subIntent: "transfers", weight: 2, pattern: /\bsigned\b/i, label: "signed" },
  { subIntent: "transfers", weight: 2, pattern: /\brumou?r\b/i, label: "rumour" },

  { subIntent: "injuries", weight: 3, pattern: /\binjur(y|ies)\b/i, label: "injury" },
  { subIntent: "injuries", weight: 2, pattern: /\bsidelined\b/i, label: "sidelined" },
  { subIntent: "injuries", weight: 2, pattern: /\bout for\b/i, label: "out for" },
  { subIntent: "injuries", weight: 2, pattern: /\bfitness\b/i, label: "fitness" },

  { subIntent: "form", weight: 3, pattern: /\bin form\b/i, label: "in form" },
  { subIntent: "form", weight: 2, pattern: /\bform guide\b/i, label: "form guide" },
  { subIntent: "form", weight: 2, pattern: /\bhot streak\b/i, label: "hot streak" },
  { subIntent: "form", weight: 2, pattern: /\brecent run\b/i, label: "recent run" },

  { subIntent: "records", weight: 3, pattern: /\brecord\b/i, label: "record" },
  { subIntent: "records", weight: 2, pattern: /\bunbeaten run\b/i, label: "unbeaten run" },
  { subIntent: "records", weight: 2, pattern: /\bmost ever\b/i, label: "most ever" },

  { subIntent: "predictions", weight: 3, pattern: /\bprediction\b/i, label: "prediction" },
  { subIntent: "predictions", weight: 2, pattern: /\bpredict\b/i, label: "predict" },
  { subIntent: "predictions", weight: 2, pattern: /\bwho will win\b/i, label: "who will win" },
  { subIntent: "predictions", weight: 2, pattern: /\bforecast\b/i, label: "forecast" },

  { subIntent: "rivalries", weight: 3, pattern: /\brivalry\b/i, label: "rivalry" },
  { subIntent: "rivalries", weight: 3, pattern: /\bderby\b/i, label: "derby" },
  { subIntent: "rivalries", weight: 2, pattern: /\bgrudge match\b/i, label: "grudge match" },

  { subIntent: "timeline", weight: 3, pattern: /\btimeline\b/i, label: "timeline" },
  { subIntent: "timeline", weight: 2, pattern: /\bchronolog/i, label: "chronological" },
  { subIntent: "timeline", weight: 2, pattern: /\byear by year\b/i, label: "year by year" },
  { subIntent: "timeline", weight: 2, pattern: /\bthrough the years\b/i, label: "through the years" },
];

export const MATCH_PREVIEW_COMPARISON_PENALTY = 6;

export const FIXTURE_PREVIEW_MATCHUP_BOOST = 4;

export const FIXTURE_RECAP_MATCHUP_BOOST = 4;
