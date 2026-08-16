/**
 * Bounded real /api/generate-script certification — story-quality Prompt 5.
 * Runtime inputs only. Artifacts stay under .tmp/ (gitignored).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.STORY_QUALITY_CERT_BASE ?? "http://127.0.0.1:3477";
const OUT = path.resolve(".tmp/story-quality-real-cert");
const MAX_REQUESTS = 12;
const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus|pressure decides|the contest tightens|hold hold|answer answer/iu;

const COMEBACK = {
  id: "baseline-player",
  topic: "Calen Voss Harbor return",
  context: [
    "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
    "Harbor United finished tenth in Voss's first stretch back.",
    "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
    "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
    "Do not claim Voss failed a new test.",
  ].join("\n"),
  scriptMode: "story",
  require: [/Voss|ban|return/i, /tenth|poor|finished/i, /Solan|coach|Harbor/i, /support|pressure|patient/i],
  forbid: [/failed a new test/i, SCAFFOLD],
};

const PREVIEW = {
  id: "baseline-preview",
  topic: "Rookfall versus Silvermere continental preview",
  context: [
    "Both clubs won continental titles in the last decade.",
    "Each side has missed the knockout rounds for two seasons.",
    "Former Rookfall coach Ivo Kest now leads Silvermere.",
    "The redemption angle is whether Kest can beat the club that discarded him.",
  ].join("\n"),
  scriptMode: "story",
  require: [/Rookfall/i, /Silvermere/i, /preseason|preview|continental|decade/i, /Kest|former|discarded/i],
  forbid: [SCAFFOLD],
};

const RANKING = {
  id: "baseline-ranking",
  topic: "Five Harbor attackers to watch",
  context: [
    "1. Nia Calder — she creates the first shot in almost every Harbor attack.",
    "2. Tess Orlow — tempo control through the middle third.",
    "3. Bo Renwick — recovery sprints that rescue broken presses.",
    "4. Imani Shore — set-piece delivery from both flanks.",
    "5. Pax Ellery — late-box arrivals after the second ball. His former club just won a continental title.",
  ].join("\n"),
  scriptMode: "story",
  require: [/Nia Calder/i, /Tess Orlow/i, /Bo Renwick/i, /Imani Shore/i, /Pax Ellery/i],
  forbid: [SCAFFOLD, /Real Madrid/i],
};

const BASELINE = {
  duration: 30,
  tone: "dramatic",
  qualityMode: "cheap",
  mode: "script-only",
  hookStyle: "auto",
  formatStrategyId: "auto",
  factHandlingMode: "verified_facts_only",
  enableResearch: false,
  creationReliabilityMode: "flexible",
  stream: false,
};

mkdirSync(OUT, { recursive: true });

let completed = 0;
let consecutiveSame = 0;
let lastRoot = "";
const results = [];

function wordCount(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

function classify(body, spec) {
  const narration = body?.data?.narration ?? "";
  const title = body?.data?.title ?? "";
  const disposition = body?.generationDisposition ?? {};
  const trace = disposition.acceptanceTrace ?? body?.retentionDiagnostics?.acceptanceTrace ?? {};
  const authority = trace.finalNarrationAuthority ?? "unavailable";
  const warning = Boolean(disposition.qualityBelowTarget);
  const reasons = [];
  if (!body?.success) reasons.push("request_failed");
  if (SCAFFOLD.test(narration)) reasons.push("scaffold_language");
  if (/\b(\p{L}{3,})\s+\1\b/u.test(narration)) reasons.push("repeated_filler");
  for (const re of spec.require ?? []) {
    if (!re.test(narration)) reasons.push(`missing_${re.source}`);
  }
  for (const re of spec.forbid ?? []) {
    if (re.test(narration)) reasons.push(`forbidden_${re.source}`);
  }
  const members = spec.id?.includes("ranking")
    ? ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"].filter((n) =>
        narration.includes(n),
      )
    : [];
  if (spec.id?.includes("ranking") && members.length !== 5) {
    reasons.push("ranking_membership_incomplete");
  }
  if (spec.id?.includes("preview") && (!/Rookfall/i.test(narration) || !/Silvermere/i.test(narration))) {
    reasons.push("required_participant_lost");
  }
  let verdict = "fail";
  if (reasons.length === 0 && authority === "deterministic_rescue") {
    verdict = "conditional_pass";
    reasons.push("fallback_not_model_quality");
  } else if (reasons.length === 0) {
    verdict = "pass";
  }
  return {
    title,
    narration,
    hookStrategy: body?.hookPlan?.strategyId ?? body?.hookDiagnostics?.strategyId ?? null,
    callCounts: body?.retentionDiagnostics?.budget ?? null,
    earliestDecisiveRejection: trace.earliestDecisiveRejection ?? null,
    finalNarrationAuthority: authority,
    usedContentIds: body?.retentionDiagnostics?.usedContentIds ?? [],
    omittedContentIds: body?.retentionDiagnostics?.omittedContentIds ?? [],
    wordCount: wordCount(narration),
    qualityBelowTarget: warning,
    disposition: disposition.disposition ?? null,
    reasons,
    verdict,
  };
}

async function post(id, payload) {
  if (completed >= MAX_REQUESTS) {
    throw new Error("request_budget_exhausted");
  }
  const res = await fetch(`${BASE}/api/generate-script`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  completed += 1;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const lines = text.split("\n").filter(Boolean);
    const complete = [...lines].reverse().find((line) => {
      try {
        return JSON.parse(line).type === "complete";
      } catch {
        return false;
      }
    });
    json = complete
      ? JSON.parse(complete)
      : { success: false, error: "non_json_response", raw: text.slice(0, 800) };
  }
  const artifact = path.join(OUT, `${String(completed).padStart(2, "0")}-${id}.json`);
  writeFileSync(
    artifact,
    JSON.stringify({ id, status: res.status, request: payload, response: json }, null, 2),
  );
  const root = json.success
    ? json.generationDisposition?.acceptanceTrace?.finalNarrationAuthority ?? "ok"
    : json.retentionDiagnostics?.failureCategory ?? json.error ?? `http_${res.status}`;
  if (root === lastRoot && !json.success) {
    consecutiveSame += 1;
  } else {
    consecutiveSame = json.success ? 0 : 1;
    lastRoot = root;
  }
  if (consecutiveSame >= 3) {
    throw new Error(`stop_early:${root}`);
  }
  return { json, artifact, status: res.status };
}

function baselinePayload(spec, extras = {}) {
  return {
    topic: spec.topic,
    context: spec.context,
    scriptMode: extras.scriptMode ?? spec.scriptMode,
    ...BASELINE,
    ...extras,
  };
}

async function main() {
  const health = await fetch(`${BASE}/api/generate-script`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "" }),
  }).catch((error) => {
    throw new Error(`local_app_unreachable:${error.message}`);
  });
  if (!health.ok && health.status !== 400) {
    console.warn("health status", health.status);
  }

  const matrix = [
    { id: COMEBACK.id, spec: COMEBACK, payload: baselinePayload(COMEBACK) },
    { id: PREVIEW.id, spec: PREVIEW, payload: baselinePayload(PREVIEW) },
    { id: RANKING.id, spec: RANKING, payload: baselinePayload(RANKING) },
    {
      id: "mode-player-analysis",
      spec: { ...COMEBACK, id: "mode-player-analysis" },
      payload: baselinePayload(COMEBACK, { scriptMode: "player_analysis" }),
    },
    {
      id: "mode-match-preview",
      spec: { ...PREVIEW, id: "mode-match-preview", scriptMode: "match_preview" },
      payload: baselinePayload(PREVIEW, { scriptMode: "match_preview" }),
    },
    {
      id: "mode-top-5",
      spec: { ...RANKING, id: "mode-top-5", scriptMode: "top_5" },
      payload: baselinePayload(RANKING, { scriptMode: "top_5" }),
    },
    {
      id: "quality-balanced",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK, { qualityMode: "balanced" }),
    },
    {
      id: "quality-studio",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK, { qualityMode: "best" }),
    },
    {
      id: "hook-provocative",
      spec: PREVIEW,
      payload: baselinePayload(PREVIEW, { hookStyle: "provocative_question" }),
    },
    {
      id: "hook-bold",
      spec: PREVIEW,
      payload: baselinePayload(PREVIEW, { hookStyle: "stakes_first" }),
    },
    {
      id: "ndjson-parity",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK, { stream: true }),
    },
  ];

  for (const step of matrix) {
    if (completed >= MAX_REQUESTS) break;
    const posted = await post(step.id, step.payload);
    let body = posted.json;
    if (step.payload.stream && typeof posted.json !== "object") {
      body = posted.json;
    }
    if (step.payload.stream && posted.json && !posted.json.data) {
      const lines = String(posted.json.raw ?? "").split("\n").filter(Boolean);
      const complete = [...lines].reverse().find((line) => {
        try {
          return JSON.parse(line).type === "complete";
        } catch {
          return false;
        }
      });
      if (complete) body = JSON.parse(complete);
    }
    const classified = classify(body, step.spec);
    results.push({
      id: step.id,
      httpStatus: posted.status,
      artifact: path.relative(process.cwd(), posted.artifact),
      ...classified,
    });
    console.log(
      `${step.id}: ${classified.verdict} authority=${classified.finalNarrationAuthority} words=${classified.wordCount}`,
    );
  }

  const summary = {
    base: BASE,
    completedRequests: completed,
    results: results.map((row) => ({
      id: row.id,
      verdict: row.verdict,
      authority: row.finalNarrationAuthority,
      disposition: row.disposition,
      qualityBelowTarget: row.qualityBelowTarget,
      wordCount: row.wordCount,
      hookStrategy: row.hookStrategy,
      reasons: row.reasons,
      title: row.title,
    })),
  };
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(OUT, "results.ndjson"), results.map((row) => JSON.stringify(row)).join("\n"));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  writeFileSync(
    path.join(OUT, "fatal.json"),
    JSON.stringify({ error: String(error), completed }, null, 2),
  );
  process.exitCode = 1;
});
