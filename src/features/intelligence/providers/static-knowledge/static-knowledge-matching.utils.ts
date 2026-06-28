import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import { isAllTimeWorldCupTopScorersIntent } from "@/features/research/utils/top-scorers-research.utils";
import { resolveResearchRankingIntent } from "@/features/research/utils/intelligence-analysis-research.utils";

import {
  findCompetitionAliasesInTopic,
  findFootballNicknamesInTopic,
} from "./static-knowledge-catalog.utils";
import type { StaticKnowledgeMatch } from "./static-knowledge.types";
import type { StaticKnowledgeResearchInput } from "./static-knowledge-research.types";

const BALLON_DOR_PATTERN = /\bballon d['']?or\b|\bgolden ball\b/i;
const WORLD_CUP_WINNERS_PATTERN =
  /\b(world cup winners|fifa world cup winners|world cup champions)\b/i;
const CHAMPIONS_LEAGUE_WINNERS_PATTERN =
  /\b(champions league winners|ucl winners|european cup winners)\b/i;

function resolveRankingIntent(input: StaticKnowledgeResearchInput): RankingIntent | undefined {
  if (input.rankingIntent) {
    return input.rankingIntent;
  }

  return resolveResearchRankingIntent({
    topic: input.topic,
    mode: input.mode,
    intelligenceAnalysis: input.intelligenceAnalysis,
  });
}

export function resolveStaticKnowledgeMatch(
  input: StaticKnowledgeResearchInput,
): StaticKnowledgeMatch | null {
  const topic = input.topic.trim();
  if (!topic) {
    return null;
  }

  const rankingIntent = resolveRankingIntent(input);
  if (rankingIntent && isAllTimeWorldCupTopScorersIntent(rankingIntent)) {
    return {
      datasetId: "world-cup-all-time-top-scorers",
      reason: "All-time FIFA World Cup top scorers brief.",
      limit: rankingIntent.limit,
    };
  }

  if (BALLON_DOR_PATTERN.test(topic)) {
    return {
      datasetId: "ballon-dor-winners",
      reason: "Historic Ballon d'Or winners reference.",
    };
  }

  if (WORLD_CUP_WINNERS_PATTERN.test(topic)) {
    return {
      datasetId: "world-cup-winners",
      reason: "Historic FIFA World Cup winners reference.",
    };
  }

  if (CHAMPIONS_LEAGUE_WINNERS_PATTERN.test(topic)) {
    return {
      datasetId: "champions-league-winners",
      reason: "Historic UEFA Champions League winners reference.",
    };
  }

  return null;
}

/** Reference lookups augment research but do not drive a full plan on their own. */
export function resolveStaticKnowledgeReferenceFacts(topic: string): string[] {
  const facts: string[] = [];

  for (const alias of findCompetitionAliasesInTopic(topic)) {
    facts.push(`"${alias.alias}" refers to ${alias.canonical}.`);
  }

  for (const nickname of findFootballNicknamesInTopic(topic)) {
    if (nickname.type === "fixture" && nickname.entities.length >= 2) {
      facts.push(
        `"${nickname.label}" (${nickname.nickname}) — ${nickname.entities.join(" vs ")}.`,
      );
    } else {
      facts.push(`"${nickname.nickname}" refers to ${nickname.label}.`);
    }
  }

  return facts.filter((fact, index, list) => list.indexOf(fact) === index);
}
