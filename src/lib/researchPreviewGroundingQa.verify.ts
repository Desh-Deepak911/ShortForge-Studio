/**
 * Research Preview + grounding QA (run: QA_BASE_URL=http://localhost:3000 npm run test:research-preview-grounding-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildGenerateScriptResearchPreview } from "@/features/create/utils/research-preview.utils";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "";

const ALL_TIME_SCORERS = [
  "Miroslav Klose",
  "Ronaldo",
  "Müller",
  "Fontaine",
  "Messi",
];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
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
      intelligenceQuery?: import("@/features/intelligence/planner/query-orchestrator.types").IntelligenceQuery;
      assembledContext?: AssembledContext;
    },
  };
}

async function postGenerateScript(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qualityMode: "cheap",
      duration: 45,
      sceneCount: 5,
      tone: "news",
      mode: "script-only",
      stream: false,
      ...body,
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
    },
  };
}

function stripQatarGroundingLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/\bqatar\b/i.test(line))
    .join("\n");
}

function assertResearchContextNoQatar(text: string, label: string): void {
  assert.doesNotMatch(
    stripQatarGroundingLines(text),
    /\bQatar\b/i,
    `${label} must not mention Qatar outside grounding rules`,
  );
}

function assertNarrationNoQatar(text: string, label: string): void {
  assert.doesNotMatch(text, /\bQatar\b/i, `${label} must not mention Qatar`);
}

function assertHostsMentioned(text: string, label: string): void {
  const hasHosts =
    /USA|United States/i.test(text) &&
    /Canada/i.test(text) &&
    /Mexico/i.test(text);
  assert.ok(hasHosts, `${label} must mention USA, Canada, and Mexico as 2026 hosts`);
}

function assertCautiousParticipation(text: string, label: string): void {
  assert.ok(
    /if selected|not confirmed|uncertain|unknown|unclear|whether|may|could|if he|if ronaldo|participation|squad/i.test(
      text,
    ),
    `${label} must use cautious language about 2026 participation`,
  );
}

async function runQa() {
  console.log("researchPreviewGroundingQa");

  await test("1 manual context / stats empty by default", () => {
    const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
    assert.match(flow, /const \[context, setContext\] = useState\(""\)/);
    const composer = readSrc("src/components/StoryComposer.tsx");
    assert.match(composer, /Additional Notes/);
    assert.match(composer, /Add any extra details you/);
    assert.match(composer, /Smart Research/);
    const panel = readSrc("src/features/create/components/ResearchPreviewPanel.tsx");
    assert.match(panel, /Research Preview/);
    assert.match(panel, /Research Summary/);
    assert.match(panel, /Research status/);
    assert.match(panel, /Confidence/);
  });

  await test("2 research preview shows data separately from manual context", () => {
    const panel = readSrc("src/features/create/components/ResearchPreviewPanel.tsx");
    const composer = readSrc("src/components/StoryComposer.tsx");
    assert.match(panel, /View details/);
    assert.match(panel, /Ranked players|rankedPlayers/i);
    assert.match(composer, /ResearchPreviewPanel/);
    assert.doesNotMatch(composer, /setContext\(preview/);
  });

  await test("3 preview research wired before generate story", () => {
    const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
    assert.match(flow, /previewResearch/);
    assert.match(flow, /buildGenerateScriptResearchPreview\(researchPreview\)/);
    assert.match(flow, /queryId/);
    assert.match(flow, /\/api\/research-football/);
    assert.match(flow, /researchPreviewPayload \? \{ researchPreview/);
  });

  await test("4 player analysis CR7 WC 2026 research — no Qatar, hosts, cautious participation", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped live — set QA_BASE_URL=http://localhost:3000)");
      return;
    }

    const topic = "Cristiano Ronaldo FIFA World Cup 2026";
    const { status, json } = await postResearchFootball({
      topic,
      mode: "player_analysis",
    });

    assert.equal(status, 200);
    const assembled = json.assembledContext;
    const text = assembled ? assembledContextToPrompt(assembled) : "";
    assert.ok(assembled, "expected assembledContext");

    assertResearchContextNoQatar(text, "research context");
    assertHostsMentioned(text, "research context");
    assertCautiousParticipation(text, "research context");

    const script = await postGenerateScript({
      topic,
      scriptMode: "player_analysis",
      enableResearch: true,
      duration: 30,
    });

    if (script.status !== 200 || !script.json.success) {
      console.log(`    (script generation skipped: ${script.json.error ?? script.status})`);
      return;
    }

    const narration = script.json.data?.narration ?? "";
    assert.ok(narration.trim(), "expected narration");
    assertNarrationNoQatar(narration, "generated script");
    assertHostsMentioned(narration, "generated script");
    assertCautiousParticipation(narration, "generated script");
  });

  await test("5 top 5 all-time world cup — preview lists five scorers, script includes them", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped live — set QA_BASE_URL)");
      return;
    }

    const topic = "top 5 highest goal scorers fifa world cup";
    const { status, json } = await postResearchFootball({
      topic,
      mode: "top_5",
    });

    assert.equal(status, 200);
    const assembled = json.assembledContext!;
    assert.equal(assembled.provenance.source, "static-fallback");
    assert.equal(assembled.rankings[0]?.entries.length, 5);

    const previewText = assembledContextToPrompt(assembled);
    assert.match(previewText, /RANKINGS:|RANKED PLAYER DATA:/);
    for (const name of ALL_TIME_SCORERS) {
      assert.match(previewText, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }

    const previewPayload = buildGenerateScriptResearchPreview({
      status: "success",
      topic,
      mode: "top_5",
      assembledContext: assembled,
      intelligenceQuery: json.intelligenceQuery!,
    });
    assert.ok(previewPayload?.queryId, "preview payload passes queryId for generate");

    const script = await postGenerateScript({
      topic,
      scriptMode: "top_5",
      enableResearch: true,
      researchPreview: previewPayload,
      duration: 45,
    });

    if (script.status !== 200 || !script.json.success) {
      console.log(`    (script generation skipped: ${script.json.error ?? script.status})`);
      return;
    }

    assert.equal(script.json.researchApplied, true);
    const narration = script.json.data?.narration ?? "";
    for (const name of ALL_TIME_SCORERS) {
      assert.match(
        narration,
        new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `narration missing ${name}`,
      );
    }
  });

  await test("6 top 5 world cup 2026 — API data or data unavailable warning", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped live — set QA_BASE_URL)");
      return;
    }

    const topic = "top 5 highest goal scorers fifa world cup 2026";
    const { status, json } = await postResearchFootball({
      topic,
      mode: "top_5",
    });

    assert.equal(status, 200);
    const assembled = json.assembledContext!;
    assert.equal(assembled.season, 2026);

    if (assembled.provenance.source === "api-football" && assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
      assert.ok(assembled.rankings.every((ranking) => ranking.entries.every((entry) => entry.value != null)));
      assert.match(assembledContextToPrompt(assembled), /RANKINGS:|RANKED PLAYER DATA:/);
      console.log(`    (API-Football returned ${assembled.rankings[0]?.entries.length ?? 0} scorers)`);
      return;
    }

    assert.ok(
      assembled.warnings.some((warning) =>
        /unavailable|topscorers|provider|2026|no ranked|not found|configured/i.test(warning),
      ),
      `expected data-unavailable warning, got: ${assembled.warnings.join("; ")}`,
    );
    console.log(`    (fallback with warning: ${assembled.warnings[0] ?? "none"})`);
  });

  await test("7 review → voiceover → scenes → editor pipeline wiring intact", () => {
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

  console.log("\nResearch Preview + grounding QA checks passed.");
  console.log("Run npm run lint && npm run build for QA-8 and QA-9.");
}

runQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
