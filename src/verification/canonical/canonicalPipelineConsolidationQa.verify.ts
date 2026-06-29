/**
 * Canonical Pipeline Consolidation QA
 * Run: QA_BASE_URL=http://localhost:3000 npm run test:canonical-pipeline-qa
 */
import assert from "node:assert/strict";

import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import { hasRankedPlayerDataInContextText } from "@/lib/ai/top5-script-prompt.utils";
import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { ScriptMode } from "@/types/footiebitz";

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

interface QaCase {
  id: number;
  label: string;
  topic: string;
  mode: ScriptMode;
  expectRankedInPrompt?: boolean;
  forbidQatar?: boolean;
  promptFactPatterns?: RegExp[];
  scriptFactPatterns?: RegExp[];
  allowCautiousScript?: boolean;
}

interface ResearchResponse {
  executionStatus?: "success" | "partial" | "failed";
  intelligenceQuery?: { id: string };
  assembledContext?: AssembledContext;
  providerResults?: unknown[];
  canonicalResearchBundle?: { providerResults?: unknown[] };
}

interface ScriptResponse {
  success?: boolean;
  error?: string;
  data?: { narration?: string; title?: string };
  researchApplied?: boolean;
  generationContext?: string;
  researchWarning?: string;
}

const CASES: QaCase[] = [
  {
    id: 1,
    label: "top 5 highest goal scorers fifa world cup",
    topic: "top 5 highest goal scorers fifa world cup",
    mode: "top_5",
    expectRankedInPrompt: true,
    promptFactPatterns: [/Klose/i, /Ronaldo/i, /Messi/i],
    scriptFactPatterns: [/Klose|Ronaldo|Müller|Fontaine|Messi/i],
  },
  {
    id: 2,
    label: "top 5 highest goal scorers fifa world cup 2026",
    topic: "top 5 highest goal scorers fifa world cup 2026",
    mode: "top_5",
    expectRankedInPrompt: true,
    forbidQatar: true,
    promptFactPatterns: [/2026|World Cup/i],
    scriptFactPatterns: [/2026|World Cup|rank|scorer|goal/i],
    allowCautiousScript: true,
  },
  {
    id: 3,
    label: "Premier League top scorers 2024",
    topic: "Premier League top scorers 2024",
    mode: "top_5",
    expectRankedInPrompt: true,
    promptFactPatterns: [/Premier League|2024/i],
    scriptFactPatterns: [/Premier|League|2024|goal|scorer|rank/i],
    allowCautiousScript: true,
  },
  {
    id: 4,
    label: "Cristiano Ronaldo FIFA World Cup 2026",
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    mode: "player_analysis",
    forbidQatar: true,
    promptFactPatterns: [/Ronaldo|Cristiano/i, /2026|World Cup/i],
    scriptFactPatterns: [/Ronaldo|Cristiano|Portugal|2026/i],
    allowCautiousScript: true,
  },
  {
    id: 5,
    label: "Barcelona vs Real Madrid tactical analysis",
    topic: "Barcelona vs Real Madrid tactical analysis",
    mode: "tactical_review",
    promptFactPatterns: [/Barcelona|Real Madrid|El Cl[aá]sico/i],
    scriptFactPatterns: [/Barcelona|Real Madrid|tactic|formation|Cl[aá]sico/i],
    allowCautiousScript: true,
  },
  {
    id: 6,
    label: "Manchester City vs Arsenal preview",
    topic: "Manchester City vs Arsenal preview",
    mode: "match_preview",
    promptFactPatterns: [/Manchester City|Arsenal/i],
    scriptFactPatterns: [/City|Arsenal|preview|fixture|match/i],
    allowCautiousScript: true,
  },
  {
    id: 7,
    label: "Spain vs Germany recap",
    topic: "Spain vs Germany recap",
    mode: "match_recap",
    promptFactPatterns: [/Spain|Germany/i],
    scriptFactPatterns: [/Spain|Germany|recap|match|goal/i],
    allowCautiousScript: true,
  },
  {
    id: 8,
    label: "Messi",
    topic: "Messi",
    mode: "player_analysis",
    promptFactPatterns: [/Messi/i],
    scriptFactPatterns: [/Messi|Argentina|goal|career/i],
    allowCautiousScript: true,
  },
  {
    id: 9,
    label: "World Cup 2026",
    topic: "World Cup 2026",
    mode: "story",
    forbidQatar: true,
    promptFactPatterns: [/2026|World Cup|USA|Canada|Mexico/i],
    scriptFactPatterns: [/2026|World Cup|USA|Canada|Mexico|host/i],
    allowCautiousScript: true,
  },
  {
    id: 10,
    label: "El Clasico",
    topic: "El Clasico",
    mode: "story",
    promptFactPatterns: [/Barcelona|Real Madrid|Cl[aá]sico/i],
    scriptFactPatterns: [/Barcelona|Real Madrid|Cl[aá]sico|classic/i],
    allowCautiousScript: true,
  },
];

interface CaseResult {
  id: number;
  label: string;
  executeIntelligenceQueryUsed: boolean;
  providerResultsPresent: boolean;
  assembledContextBuilt: boolean;
  promptFactsOk: boolean;
  scriptUsesFacts: boolean;
  legacyFallbackUsed: boolean;
  pass: boolean;
  notes: string[];
}

function stripQatarGroundingLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/\bqatar\b/i.test(line) || /not the qatar|do not refer to qatar/i.test(line))
    .join("\n");
}

function hasProviderPayload(assembled: AssembledContext, research: ResearchResponse): boolean {
  if (research.providerResults?.length || research.canonicalResearchBundle?.providerResults?.length) {
    return true;
  }

  return (
    assembled.verifiedFacts.some((fact) => fact.text.trim().length > 0) ||
    assembled.rankings.some((ranking) => ranking.entries.length > 0) ||
    assembled.fixtures.length > 0 ||
    assembled.statistics.length > 0 ||
    assembled.events.length > 0 ||
    assembled.lineups.length > 0
  );
}

function hasRankedDataInPrompt(text: string): boolean {
  return hasRankedPlayerDataInContextText(text) || /\n1\.\s+\S+/m.test(text);
}

function matchesPatterns(text: string, patterns: RegExp[] | undefined): boolean {
  if (!patterns?.length) {
    return true;
  }

  return patterns.some((pattern) => pattern.test(text));
}

function scriptUsesFacts(
  narration: string,
  promptText: string,
  patterns: RegExp[] | undefined,
  allowCautious: boolean | undefined,
): boolean {
  if (matchesPatterns(narration, patterns)) {
    return true;
  }

  const rankedNames = [...promptText.matchAll(/\d+\.\s+([^—\n]+)/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  if (rankedNames.some((name) => narration.includes(name.split(" ")[0] ?? ""))) {
    return true;
  }

  if (allowCautious && /unavailable|cautious|not available|if selected|narrow/i.test(narration)) {
    return true;
  }

  return false;
}

async function postResearchFootball(topic: string, mode: ScriptMode): Promise<{
  status: number;
  json: ResearchResponse;
}> {
  const response = await fetch(`${QA_BASE_URL}/api/research-football`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, mode }),
  });

  return {
    status: response.status,
    json: (await response.json()) as ResearchResponse,
  };
}

async function postGenerateScript(topic: string, mode: ScriptMode) {
  const response = await fetch(`${QA_BASE_URL}/api/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      scriptMode: mode,
      enableResearch: true,
      qualityMode: "cheap",
      duration: 30,
      sceneCount: 5,
      tone: "dramatic",
      mode: "script-only",
      stream: false,
    }),
  });

  return {
    status: response.status,
    json: (await response.json()) as ScriptResponse,
  };
}

async function runCase(testCase: QaCase): Promise<CaseResult> {
  const notes: string[] = [];
  const { status, json } = await postResearchFootball(testCase.topic, testCase.mode);

  if (status !== 200) {
    return {
      id: testCase.id,
      label: testCase.label,
      executeIntelligenceQueryUsed: false,
      providerResultsPresent: false,
      assembledContextBuilt: false,
      promptFactsOk: false,
      scriptUsesFacts: false,
      legacyFallbackUsed: true,
      pass: false,
      notes: [`research-football HTTP ${status}`],
    };
  }

  const assembled = json.assembledContext;
  const promptText = assembled ? assembledContextToPrompt(assembled) : "";
  const executionFailed = json.executionStatus === "failed";
  const executeIntelligenceQueryUsed = json.executionStatus != null;
  const assembledContextBuilt = Boolean(assembled?.queryId);
  const providerResultsPresent = assembled ? hasProviderPayload(assembled, json) : false;

  let promptFactsOk = matchesPatterns(promptText, testCase.promptFactPatterns);

  if (testCase.expectRankedInPrompt && !hasRankedDataInPrompt(promptText)) {
    promptFactsOk = false;
    notes.push("missing ranked data in prompt");
  }

  if (testCase.forbidQatar) {
    const qatarFree = !/\bQatar\b/i.test(stripQatarGroundingLines(promptText));
    if (!qatarFree) {
      promptFactsOk = false;
      notes.push("Qatar mentioned in prompt");
    }
  }

  const script = await postGenerateScript(testCase.topic, testCase.mode);
  const narration = script.json.data?.narration ?? "";

  let scriptUsesFactsOk = false;
  if (script.status === 200 && script.json.success && narration.trim()) {
    scriptUsesFactsOk = scriptUsesFacts(
      narration,
      promptText,
      testCase.scriptFactPatterns,
      testCase.allowCautiousScript,
    );

    if (testCase.forbidQatar && /\bQatar\b/i.test(narration)) {
      scriptUsesFactsOk = false;
      notes.push("Qatar mentioned in script");
    }
  } else {
    notes.push(`script generation failed: ${script.json.error ?? script.status}`);
  }

  const pass =
    executeIntelligenceQueryUsed &&
    assembledContextBuilt &&
    providerResultsPresent &&
    promptFactsOk &&
    scriptUsesFactsOk &&
    !executionFailed;

  if (!executeIntelligenceQueryUsed) notes.push("missing execution status");
  if (!assembledContextBuilt) notes.push("no assembled context");
  if (!providerResultsPresent) notes.push("no provider payload");
  if (!promptFactsOk && !notes.some((n) => n.includes("prompt"))) notes.push("prompt facts check failed");
  if (!scriptUsesFactsOk && !notes.some((n) => n.includes("script"))) notes.push("script facts check failed");

  return {
    id: testCase.id,
    label: testCase.label,
    executeIntelligenceQueryUsed,
    providerResultsPresent,
    assembledContextBuilt,
    promptFactsOk,
    scriptUsesFacts: scriptUsesFactsOk,
    legacyFallbackUsed: executionFailed,
    pass,
    notes,
  };
}

function printResult(result: CaseResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`\n[${result.id}] ${result.label} — ${status}`);
  console.log(`  executeIntelligenceQuery used? ${result.executeIntelligenceQueryUsed ? "yes" : "no"}`);
  console.log(`  provider results present?     ${result.providerResultsPresent ? "yes" : "no"}`);
  console.log(`  AssembledContext built?       ${result.assembledContextBuilt ? "yes" : "no"}`);
  console.log(`  prompt facts ok?              ${result.promptFactsOk ? "yes" : "no"}`);
  console.log(`  script uses facts?            ${result.scriptUsesFacts ? "yes" : "no"}`);
  console.log(`  legacy fallback used?         ${result.legacyFallbackUsed ? "yes" : "no"}`);
  if (result.notes.length) {
    console.log(`  notes: ${result.notes.join("; ")}`);
  }
}

async function main() {
  console.log("canonicalPipelineConsolidationQa");
  console.log(`QA_BASE_URL=${QA_BASE_URL}`);

  const results: CaseResult[] = [];
  for (const testCase of CASES) {
    results.push(await runCase(testCase));
  }

  for (const result of results) {
    printResult(result);
  }

  const passCount = results.filter((result) => result.pass).length;
  const top5Cases = results.filter((_, index) => CASES[index]?.expectRankedInPrompt);
  const top5RankedOk = top5Cases.every((result) => result.promptFactsOk);

  console.log("\n--- Gate ---");
  console.log(`Pass count: ${passCount}/10 (need >= 8)`);
  console.log(`Top 5 ranked in prompt: ${top5RankedOk ? "yes" : "no"}`);

  assert.ok(passCount >= 8, `Expected >= 8/10 pass, got ${passCount}/10`);
  assert.equal(top5RankedOk, true, "All top_5 tests must include ranked data in prompt text");

  console.log("\nCanonical Pipeline Consolidation QA passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
