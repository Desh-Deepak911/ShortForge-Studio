/**
 * Duration control QA (run: npm run test:duration-control-qa).
 *
 * Live generation checks (QA-1–6) require the dev server and OpenAI key:
 *   npm run dev
 * then:
 *   QA_BASE_URL=http://localhost:3000 npm run test:duration-control-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildStoryScriptPrompt } from "@/lib/ai/prompts";
import {
  countWords,
  enforceNarrationWordBudget,
  estimateNarrationDurationMs,
  getEstimatedScriptDurationSeconds,
  getMaxNarrationDurationMs,
  getNarrationWordBudget,
} from "@/features/story/utils/narration-duration-budget.utils";

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

function assertWithin30sWordBudget(narration: string, context: string): void {
  const budget = getNarrationWordBudget(30);
  const words = countWords(narration);
  const estimatedSeconds = getEstimatedScriptDurationSeconds(narration);
  const maxDurationMs = getMaxNarrationDurationMs(budget);

  assert.ok(narration.trim().length > 0, `${context}: narration is empty`);
  assert.ok(
    words <= budget.hardCapWords,
    `${context}: ${words} words exceeds hard cap ${budget.hardCapWords}`,
  );
  assert.ok(
    estimateNarrationDurationMs(narration) <= maxDurationMs,
    `${context}: estimated ${estimatedSeconds}s exceeds max stretch ${budget.maxDurationSeconds}s`,
  );
  assert.ok(
    estimatedSeconds < 70,
    `${context}: estimated ${estimatedSeconds}s is 70s+`,
  );
}

async function postGenerateScript(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qualityMode: "cheap",
      duration: 30,
      sceneCount: 5,
      ...body,
      mode: "script-only",
      stream: false,
    }),
  });

  return {
    status: response.status,
    json: (await response.json()) as {
      success?: boolean;
      data?: { narration?: string; title?: string };
      error?: string;
      scriptLengthWarning?: string;
    },
  };
}

async function runQa() {
  console.log("durationControlQa");

  const budget30 = getNarrationWordBudget(30);
  const scriptGeneration = readSrc("src/features/story/services/script-generation.service.ts");
  const prompts = readSrc("src/lib/ai/prompts.ts");

  await test("QA-1 30s tactical review generates around 70–105 words", async () => {
    const prompt = buildStoryScriptPrompt(
      "Arsenal vs Chelsea low block",
      "tactical",
      30,
      "tactical_review",
      undefined,
      {
        idealMinWords: budget30.idealMinWords,
        idealMaxWords: budget30.idealMaxWords,
        hardCapWords: budget30.hardCapWords,
        maxDurationSeconds: budget30.maxDurationSeconds,
      },
    );

    assert.match(prompt, /Hard maximum word count: 105/);
    assert.match(prompt, /tactical review/i);
    assert.match(scriptGeneration, /compressStoryScript/);

    if (!QA_BASE_URL) {
      console.log("    (live word count skipped — set QA_BASE_URL=http://localhost:3000)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Arsenal vs Chelsea low block",
      tone: "tactical",
      scriptMode: "tactical_review",
      duration: 30,
      enableResearch: false,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s tactical_review");

    const words = countWords(json.data?.narration ?? "");
    if (words < budget30.idealMinWords) {
      console.log(`    (note — ${words} words below ideal min ${budget30.idealMinWords}, within hard cap)`);
    }
  });

  await test("QA-2 30s researched match script does not become 70s+", async () => {
    assert.match(prompts, /Use research context selectively/);
    assert.match(prompts, /Prioritize the strongest 3–5 facts only/);
    assert.match(scriptGeneration, /enforceScriptLengthBudget/);

    if (!QA_BASE_URL) {
      console.log("    (live generation skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Arsenal vs Chelsea",
      tone: "news",
      scriptMode: "match_recap",
      duration: 30,
      enableResearch: true,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s researched match_recap");
  });

  await test("QA-3 dramatic tone stays concise", async () => {
    const prompt = buildStoryScriptPrompt(
      "Arsenal vs Chelsea",
      "dramatic",
      30,
      "match_recap",
      undefined,
      {
        idealMinWords: budget30.idealMinWords,
        idealMaxWords: budget30.idealMaxWords,
        hardCapWords: budget30.hardCapWords,
        maxDurationSeconds: budget30.maxDurationSeconds,
      },
    );

    assert.match(prompt, /Dramatic tone must not increase length/);

    if (!QA_BASE_URL) {
      console.log("    (live generation skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Arsenal vs Chelsea",
      tone: "dramatic",
      scriptMode: "match_recap",
      duration: 30,
      enableResearch: false,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s dramatic");
  });

  await test("QA-4 top_5 mode still works but remains within budget", async () => {
    const prompt = buildStoryScriptPrompt(
      "Top 5 Premier League strikers",
      "news",
      30,
      "top_5",
      undefined,
      {
        idealMinWords: budget30.idealMinWords,
        idealMaxWords: budget30.idealMaxWords,
        hardCapWords: budget30.hardCapWords,
        maxDurationSeconds: budget30.maxDurationSeconds,
      },
    );

    assert.match(prompt, /Ranked and punchy/);
    assert.match(prompt, /Hard maximum word count: 105/);

    if (!QA_BASE_URL) {
      console.log("    (live generation skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Top 5 Premier League strikers this season",
      tone: "news",
      scriptMode: "top_5",
      duration: 30,
      enableResearch: false,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s top_5");
  });

  await test("QA-5 player analysis remains within budget", async () => {
    const prompt = buildStoryScriptPrompt(
      "Erling Haaland",
      "tactical",
      30,
      "player_analysis",
      undefined,
      {
        idealMinWords: budget30.idealMinWords,
        idealMaxWords: budget30.idealMaxWords,
        hardCapWords: budget30.hardCapWords,
        maxDurationSeconds: budget30.maxDurationSeconds,
      },
    );

    assert.match(prompt, /Player-focused lens|player analysis/i);

    if (!QA_BASE_URL) {
      console.log("    (live generation skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Erling Haaland",
      tone: "tactical",
      scriptMode: "player_analysis",
      duration: 30,
      enableResearch: true,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s player_analysis");
  });

  await test("QA-6 manual context does not cause long scripts", async () => {
    const manualContext = [
      "Manual context:",
      "- Arsenal 62% possession, 14 shots, 2.1 xG",
      "- Chelsea 38% possession, 7 shots, 0.8 xG",
      "- Saka 78th minute winner after sustained pressure",
      "- Rice dominated midfield duels",
    ].join("\n");

    const prompt = buildStoryScriptPrompt(
      "Arsenal vs Chelsea",
      "tactical",
      30,
      "match_recap",
      manualContext,
      {
        idealMinWords: budget30.idealMinWords,
        idealMaxWords: budget30.idealMaxWords,
        hardCapWords: budget30.hardCapWords,
        maxDurationSeconds: budget30.maxDurationSeconds,
      },
    );

    assert.match(prompt, /Rice dominated midfield duels/);

    const overlong = enforceNarrationWordBudget(
      `${"word ".repeat(180)}Manual stats included.`,
      budget30,
    );
    assert.equal(overlong.truncated, true);
    assert.ok(countWords(overlong.narration) <= budget30.hardCapWords);

    if (!QA_BASE_URL) {
      console.log("    (live generation skipped — set QA_BASE_URL)");
      return;
    }

    const { status, json } = await postGenerateScript({
      topic: "Arsenal vs Chelsea",
      tone: "tactical",
      scriptMode: "match_recap",
      duration: 30,
      context: manualContext,
      enableResearch: false,
    });

    assert.equal(status, 200);
    assert.equal(json.success, true);
    assertWithin30sWordBudget(json.data?.narration ?? "", "30s manual context");
  });

  await test("QA-7 review page shows actual estimated duration", () => {
    const storyReview = readSrc("src/components/StoryReview.tsx");
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");

    assert.match(storyReview, /getEstimatedScriptDurationSeconds/);
    assert.match(storyReview, /Target:/);
    assert.match(storyReview, /Estimated script:/);
    assert.match(reviewFlow, /targetDurationSeconds=/);
  });

  await test("QA-8 voiceover still works", () => {
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
    const voiceHook = readSrc("src/hooks/useStoryVoiceoverApply.ts");
    const voiceCard = readSrc("src/components/VoiceSettingsCard.tsx");

    assert.match(reviewFlow, /VoiceSettingsCard/);
    assert.match(reviewFlow, /variant="review"/);
    assert.match(voiceHook, /\/api\/generate-voiceover/);
    assert.match(voiceHook, /baseline\.narration\.trim\(\)/);
    assert.doesNotMatch(voiceCard, /exceedsTargetScriptDuration/);
    assert.doesNotMatch(reviewFlow, /disabled=\{.*exceedsTarget/);
  });

  await test("QA-9 Build Storyboard still works", () => {
    const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
    const route = readSrc("src/app/api/generate-script/route.ts");

    assert.match(reviewFlow, /Build Storyboard/);
    assert.match(reviewFlow, /mode:\s*"scenes-only"/);
    assert.match(reviewFlow, /voiceoverDurationMs/);
    assert.match(route, /generateScenesForReviewedScript/);
  });

  console.log("\nDuration control QA checks passed (run lint + build separately for QA-10/11).");
}

runQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
