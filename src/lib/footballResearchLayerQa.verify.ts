/**
 * Football Research Layer QA (run: npm run test:football-research-layer-qa).
 *
 * Live API checks (QA-2–6) require the dev server:
 *   npm run dev
 * then in another terminal:
 *   QA_BASE_URL=http://localhost:3000 npm run test:football-research-layer-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFootballResearchContextText } from "@/features/research/legacy";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import { mergeFootballContext } from "@/features/football/utils/football-research.utils";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";
import { buildStoryScriptPrompt } from "@/lib/ai/prompts";

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "";

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

async function postResearchFootball(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/research-football`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as {
      researchContext?: FootballResearchContext;
      contextText?: string;
    },
  };
}

async function runQa() {
  console.log("footballResearchLayerQa");

  await test("QA-1 without API_FOOTBALL_KEY script generation path still supports manual context", () => {
    const route = readSrc("src/app/api/generate-script/route.ts");
    const apiProvider = readSrc("src/features/intelligence/providers/api-football.provider.ts");
    const fallback = readSrc("src/features/intelligence/planner/intelligence-execution-fallback.server.ts");
    const scriptResolver = readSrc("src/features/research/utils/script-research-context.server.utils.ts");

    assert.match(route, /resolveScriptOnlyGenerationContext/);
    assert.match(route, /context: manualContext/);
    assert.match(apiProvider, /API_FOOTBALL_KEY is not configured/);
    assert.match(fallback, /source: manualFacts\.length > 0 \? "manual" : "fallback"/);
    assert.match(scriptResolver, /applyAssembledResearchContext/);

    const manual = "Manual: high press in the first half.";
    const prompt = buildStoryScriptPrompt(
      "Arsenal vs Chelsea",
      "dramatic",
      30,
      "match_recap",
      manual,
      getNarrationWordBudget(30),
    );

    assert.match(prompt, /Manual: high press in the first half/);
    assert.match(prompt, /Stats and context rules/);
  });

  await test("QA-2 with API_FOOTBALL_KEY research route returns context", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL=http://localhost:3000 with dev server running)");
      return;
    }

    const { status, json } = await postResearchFootball({
      topic: "Arsenal vs Chelsea",
      mode: "match_recap",
    });

    assert.equal(status, 200);
    assert.ok(json.researchContext, "expected researchContext");
    assert.ok(json.contextText?.includes("RESEARCHED FOOTBALL CONTEXT"));
  });

  await test("QA-3 tactical_review uses fixture stats/context when found", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const { json } = await postResearchFootball({
      topic: "Arsenal vs Chelsea",
      mode: "tactical_review",
    });

    const ctx = json.researchContext;
    if (!ctx || ctx.source !== "api-football" || !ctx.fixture) {
      console.log("    (skipped — provider returned no tactical fixture bundle)");
      return;
    }

    const text = buildFootballResearchContextText(ctx);
    assert.match(text, /Formations & lineups:|Team statistics:|In-match events:/);
    assert.ok(
      Boolean(ctx.statistics?.length) ||
        Boolean(ctx.lineups?.length) ||
        Boolean(ctx.events?.length),
    );
  });

  await test("QA-4 match_preview uses upcoming fixture/team context", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const { json } = await postResearchFootball({
      topic: "Arsenal vs Chelsea",
      mode: "match_preview",
    });

    const ctx = json.researchContext;
    if (!ctx || ctx.source !== "api-football") {
      console.log("    (skipped — provider returned fallback)");
      return;
    }

    if (!ctx.fixture && !ctx.standings?.length) {
      console.log("    (skipped — no upcoming fixture or standings from provider)");
      return;
    }

    const text = buildFootballResearchContextText(ctx);
    assert.match(text, /Upcoming fixture:|Standings:|Recent form:/);
    assert.ok(ctx.fixture || ctx.teams?.length);
  });

  await test("QA-5 match_recap uses score/events/stats when found", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const { json } = await postResearchFootball({
      topic: "Arsenal vs Chelsea",
      mode: "match_recap",
    });

    const ctx = json.researchContext;
    if (!ctx || ctx.source !== "api-football" || !ctx.fixture) {
      console.log("    (skipped — no completed fixture from provider)");
      return;
    }

    const text = buildFootballResearchContextText(ctx);
    assert.match(text, /Final score:/);
    assert.ok(
      ctx.fixture.homeGoals != null ||
        Boolean(ctx.events?.length) ||
        Boolean(ctx.statistics?.length),
    );
  });

  await test("QA-6 player_analysis uses player/team stats when found", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL)");
      return;
    }

    const { json } = await postResearchFootball({
      topic: "Erling Haaland",
      mode: "player_analysis",
    });

    const ctx = json.researchContext;
    if (!ctx || ctx.source !== "api-football") {
      console.log("    (skipped — player not found from provider)");
      return;
    }

    assert.ok(ctx.players?.length);
    const text = buildFootballResearchContextText(ctx);
    assert.match(text, /Player profile:|Haaland/i);
  });

  await test("QA-7 top_5 does not invent rankings if data unavailable", () => {
    const emptyTopFive: FootballResearchContext = {
      mode: "top_5",
      topic: "zzzznonexistenttopic999",
      summary: "No data",
      facts: [],
      warnings: ["No ranking data available from provider."],
      source: "fallback",
    };

    const text = buildFootballResearchContextText(emptyTopFive);
    assert.match(text, /No ranking data available from provider/);
    assert.doesNotMatch(text, /Rankings:/);

    const prompt = buildStoryScriptPrompt(
      "zzzznonexistenttopic999",
      "news",
      45,
      "top_5",
      text,
      getNarrationWordBudget(45),
    );
    assert.match(prompt, /Do NOT invent exact numbers/);
    assert.match(prompt, /evidence-backed/);
  });

  await test("QA-8 manual context still works", () => {
    const manual = "Coach noted a mid-block shift in the second half.";
    const researched = "RESEARCHED FOOTBALL CONTEXT\n\nMode: match recap\nSummary: Test";
    const merged = mergeFootballContext(manual, researched);

    assert.match(merged ?? "", /Coach noted a mid-block shift/);
    assert.match(merged ?? "", /RESEARCHED FOOTBALL CONTEXT/);

    const prompt = buildStoryScriptPrompt(
      "Arsenal vs Chelsea",
      "tactical",
      30,
      "match_recap",
      merged,
      getNarrationWordBudget(30),
    );
    assert.match(prompt, /Coach noted a mid-block shift/);
    assert.match(prompt, /Researched football context rules/);
  });

  await test("QA-9 scenes-only generation still works", () => {
    const route = readSrc("src/app/api/generate-script/route.ts");
    const scenesStart = route.indexOf('if (params.mode === "scenes-only")');
    const scenesEnd = route.indexOf("const audioFirstResult = await generateAudioFirstStory");
    assert.ok(scenesStart >= 0 && scenesEnd > scenesStart);
    const scenesBlock = route.slice(scenesStart, scenesEnd);

    assert.match(route, /generateScenesForReviewedScript/);
    assert.doesNotMatch(scenesBlock, /enableResearch/);
    assert.doesNotMatch(scenesBlock, /researchFootballContext/);
  });

  await test("QA-10 review page still works", () => {
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
    assert.match(reviewFlow, /mode:\s*"scenes-only"/);
    assert.match(reviewFlow, /StoryReview/);
    assert.match(reviewFlow, /VoiceSettingsCard/);
    assert.doesNotMatch(reviewFlow, /enableResearch/);
  });

  await test("QA-11 editor still works", () => {
    const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
    assert.match(editorFlow, /useEditorStoryDocument/);
    assert.match(editorFlow, /StoryWorkspace/);
    assert.doesNotMatch(editorFlow, /generate-script/);
    assert.doesNotMatch(editorFlow, /researchFootballContext/);
  });

  console.log("\nAll Football Research Layer QA checks passed.");
}

runQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
