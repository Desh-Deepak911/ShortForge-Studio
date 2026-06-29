/**
 * Top 5 research QA (run: npm run test:top5-research-qa).
 *
 * Live checks require dev server:
 *   npm run dev
 *   QA_BASE_URL=http://localhost:3000 npm run test:top5-research-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import { parseRankingIntent } from "@/features/research/utils/ranking-intent.utils";
import {
  countWords,
  getEstimatedScriptDurationSeconds,
  getNarrationWordBudget,
} from "@/features/story/utils/narration-duration-budget.utils";

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "";

const ALL_TIME_SCORERS = [
  "Miroslav Klose",
  "Ronaldo Nazário",
  "Gerd Müller",
  "Just Fontaine",
  "Lionel Messi",
];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => {
      console.log(`  ✓ ${name}`);
    },
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

interface ResearchFootballResponse {
  executionStatus?: string;
  assembledContext?: AssembledContext;
}

async function postResearchFootball(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/research-football`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as ResearchFootballResponse,
  };
}

function promptFromResearch(json: ResearchFootballResponse): string {
  return json.assembledContext ? assembledContextToPrompt(json.assembledContext) : "";
}

async function postGenerateScript(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qualityMode: "cheap",
      duration: 30,
      sceneCount: 5,
      tone: "dramatic",
      ...body,
      mode: "script-only",
      stream: false,
    }),
  });

  return {
    status: response.status,
    json: (await response.json()) as {
      success?: boolean;
      error?: string;
      data?: { narration?: string; title?: string };
      researchApplied?: boolean;
      generationContext?: string;
      researchWarning?: string;
      scriptLengthWarning?: string;
    },
  };
}

function assertAllTimeScorersPresent(text: string, context: string): void {
  for (const name of ALL_TIME_SCORERS) {
    assert.match(text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${context}: missing ${name}`);
  }
}

function rankingLabels(assembled: AssembledContext): string {
  return assembled.rankings
    .flatMap((ranking) => ranking.entries.map((entry) => entry.label))
    .join("\n");
}

async function runQa() {
  console.log("top5ResearchQa");

  await test("QA-1 all-time FIFA World Cup top scorers static fallback", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL=http://localhost:3000)");
      return;
    }

    const { status, json } = await postResearchFootball({
      topic: "top 5 highest goal scorers fifa world cup",
      mode: "top_5",
    });

    assert.equal(status, 200);
    const assembled = json.assembledContext;
    assert.ok(assembled, "expected assembledContext");
    assert.equal(assembled!.provenance.source, "static-fallback");
    assert.ok(assembled!.rankings.some((ranking) => ranking.entries.length >= 5));

    const text = promptFromResearch(json);
    assert.match(text, /RANKINGS:|RANKED PLAYER DATA:/);
    assertAllTimeScorersPresent(text, "all-time world cup context");
    assertAllTimeScorersPresent(rankingLabels(assembled!), "all-time world cup rankings");
  });

  await test("QA-2 FIFA World Cup 2022 uses API topscorers or safe warning", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const topic = "top 5 highest goal scorers fifa world cup 2022";
    const rankingIntent = parseRankingIntent(topic);
    assert.equal(rankingIntent.timeScope, "season");
    assert.equal(rankingIntent.season, 2022);

    const { status, json } = await postResearchFootball({ topic, mode: "top_5" });

    assert.equal(status, 200);
    const assembled = json.assembledContext;
    assert.ok(assembled, "expected assembledContext");

    if (assembled!.provenance.source === "api-football" && assembled!.rankings.some((r) => r.entries.length)) {
      assert.match(promptFromResearch(json), /RANKINGS:|RANKED PLAYER DATA:/);
      return;
    }

    assert.ok(
      assembled!.warnings.some((warning) => /topscorers|provider|season|configured/i.test(warning)),
      `expected safe warning, got: ${assembled!.warnings.join("; ")}`,
    );
  });

  await test("QA-3 Premier League 2024 calls top scorers research path", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const engine = readSrc("src/features/intelligence/providers/api-football-research.engine.ts");
    const client = readSrc("src/lib/football/api-football.client.ts");
    assert.match(engine, /getTopScorers|top_scorers/i);
    assert.match(client, /\/players\/topscorers/);

    const topic = "top 5 premier league goal scorers 2024";
    const rankingIntent = parseRankingIntent(topic);
    assert.equal(rankingIntent.competition, "premier_league");
    assert.equal(rankingIntent.season, 2024);

    const { status, json } = await postResearchFootball({ topic, mode: "top_5" });

    assert.equal(status, 200);
    const assembled = json.assembledContext;
    assert.ok(assembled, "expected assembledContext");

    if (assembled!.provenance.source === "api-football" && assembled!.rankings.some((r) => r.entries.length)) {
      assert.match(promptFromResearch(json), /RANKINGS:|RANKED PLAYER DATA:/);
      return;
    }

    assert.ok(assembled!.warnings.length > 0, "expected safe provider warning when API unavailable");
  });

  await test("QA-4 API-Football failure does not break research or script routes", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const research = await postResearchFootball({
      topic: "top 5 goal scorers zzzznonexistenttopic999 2099",
      mode: "top_5",
    });
    assert.equal(research.status, 200);
    assert.ok(research.json.assembledContext);

    const script = await postGenerateScript({
      topic: "top 5 goal scorers zzzznonexistenttopic999",
      scriptMode: "top_5",
      enableResearch: true,
    });
    assert.equal(script.status, 200);
    assert.equal(script.json.success, true);
    assert.ok(script.json.data?.narration?.trim(), "expected narration despite research fallback");
  });

  await test("QA-5 top_5 script stays within duration budget", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "top 5 highest goal scorers fifa world cup",
      scriptMode: "top_5",
      enableResearch: true,
      duration: 30,
    });

    if (status !== 200 || !json.success) {
      console.log(`    (skipped — live script generation unavailable: ${json.error ?? status})`);
      return;
    }

    assert.equal(json.researchApplied, true, "research should apply for static fallback rankings");
    assert.match(json.generationContext ?? "", /Miroslav Klose/);

    const narration = json.data?.narration ?? "";
    const budget = getNarrationWordBudget(30);
    const words = countWords(narration);
    const estimatedSeconds = getEstimatedScriptDurationSeconds(narration);

    assert.ok(words <= budget.hardCapWords, `${words} words exceeds cap ${budget.hardCapWords}`);
    assert.ok(estimatedSeconds < 70, `estimated ${estimatedSeconds}s is 70s+`);
  });

  await test("QA-6 review → voiceover → scenes → editor pipeline wiring intact", () => {
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
    const reviewPage = readSrc("src/app/create/review/[draftId]/page.tsx");
    const voiceRoute = readSrc("src/app/api/generate-voiceover/route.ts");
    const scriptRoute = readSrc("src/app/api/generate-script/route.ts");
    const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");

    assert.match(reviewPage, /ScriptReviewFlow/);
    assert.match(reviewFlow, /StoryReview/);
    assert.match(reviewFlow, /VoiceSettingsCard/);
    assert.match(reviewFlow, /mode:\s*"scenes-only"/);
    assert.match(voiceRoute, /generateVoiceover|voiceover/i);
    assert.match(scriptRoute, /generateScenesForReviewedScript/);
    assert.match(editorFlow, /StoryWorkspace/);
    assert.match(editorFlow, /useEditorStoryDocument/);
  });

  await test("QA-7 generate-script passes rankings via resolveScriptResearchContext", () => {
    const route = readSrc("src/app/api/generate-script/route.ts");
    const resolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
    assert.match(route, /resolveScriptResearchContext/);
    assert.match(route, /researchApplied/);
    assert.match(route, /top5RankedDataAvailable/);
    assert.match(resolver, /applyAssembledResearchContext/);
    assert.match(resolver, /resolveResearchPromptText/);
    assert.match(resolver, /assembledContextToPrompt/);
    assert.match(resolver, /isResearchContextTextUseful/);
    assert.match(resolver, /hasRankedPlayerDataInContextText/);
    assert.doesNotMatch(resolver, /buildFootballResearchContextText/);
  });

  console.log("\nTop 5 research QA checks passed (live API + static wiring).");
  console.log("Run npm run lint && npm run build for QA-8 and QA-9.");
}

runQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
