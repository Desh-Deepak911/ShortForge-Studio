/**
 * Remaining Prompt 6 /api/generate-script cases after preview early-stop.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.STORY_QUALITY_CERT_BASE ?? "http://127.0.0.1:3477";
const OUT = path.resolve(".tmp/story-quality-real-cert/prompt6");
const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus|pressure decides|the contest tightens|hold hold|answer answer/iu;

const COMEBACK = {
  id: "player-comeback",
  topic: "Calen Voss Harbor return",
  context: [
    "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
    "Harbor United finished tenth in Voss's first stretch back.",
    "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
    "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
    "Do not claim Voss failed a new test.",
  ].join("\n"),
  scriptMode: "player_analysis",
  require: [/Voss|ban|return/i, /tenth|poor|finished/i, /Solan|coach|Harbor/i, /support|pressure|patient/i],
  forbid: [/failed a new test/i, SCAFFOLD],
};

const PREVIEW = {
  id: "match-preview",
  topic: "Rookfall versus Silvermere continental preview",
  context: [
    "Both clubs won continental titles in the last decade.",
    "Each side has missed the knockout rounds for two seasons.",
    "Former Rookfall coach Ivo Kest now leads Silvermere.",
    "The redemption angle is whether Kest can beat the club that discarded him.",
  ].join("\n"),
  scriptMode: "match_preview",
  require: [/Rookfall/i, /Silvermere/i, /preseason|preview|continental|decade/i, /Kest|former|discarded/i],
  forbid: [SCAFFOLD],
};

const RANKING = {
  id: "top-five-ranking",
  topic: "Five Harbor attackers to watch",
  context: [
    "1. Nia Calder — she creates the first shot in almost every Harbor attack.",
    "2. Tess Orlow — tempo control through the middle third.",
    "3. Bo Renwick — recovery sprints that rescue broken presses.",
    "4. Imani Shore — set-piece delivery from both flanks.",
    "5. Pax Ellery — late-box arrivals after the second ball. His former club just won a continental title.",
  ].join("\n"),
  scriptMode: "top_5",
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
let completed = 2;
const results = [];

function wordCount(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

function classify(body, spec) {
  const narration = body?.data?.narration ?? "";
  const disposition = body?.generationDisposition ?? {};
  const trace = disposition.acceptanceTrace ?? body?.retentionDiagnostics?.acceptanceTrace ?? {};
  const authority = trace.finalNarrationAuthority ?? "unavailable";
  const events = Array.isArray(trace.events) ? trace.events : [];
  const rescueEntered = events.some((event) => event.stage === "deterministic_rescue_entered");
  const reasons = [];
  if (!body?.success) reasons.push("request_failed");
  if (SCAFFOLD.test(narration)) reasons.push("scaffold_language");
  for (const re of spec.require ?? []) {
    if (!re.test(narration)) reasons.push(`missing_${re.source}`);
  }
  for (const re of spec.forbid ?? []) {
    if (re.test(narration)) reasons.push(`forbidden_${re.source}`);
  }
  if (spec.id?.includes("ranking")) {
    const members = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"].filter((n) =>
      narration.includes(n),
    );
    if (members.length !== 5) reasons.push("ranking_membership_incomplete");
  }
  if (rescueEntered || authority === "deterministic_rescue") {
    reasons.push("deterministic_rescue_not_model_quality");
  }
  if (authority !== "model_direct" && authority !== "model_after_rewrite") {
    reasons.push("authority_not_model");
  }
  return {
    narrationWordCount: wordCount(narration),
    hookStrategy: body?.hookPlan?.strategyId ?? null,
    callCounts: body?.retentionDiagnostics?.budget ?? null,
    earliestDecisiveRejection: trace.earliestDecisiveRejection ?? null,
    finalNarrationAuthority: authority,
    providerFailure: trace.providerFailure ?? null,
    qualityBelowTarget: Boolean(disposition.qualityBelowTarget),
    disposition: disposition.disposition ?? null,
    rescueEntered,
    safeAcceptanceTrace: {
      events: events.map((event) => event.stage),
      earliestDecisiveRejection: trace.earliestDecisiveRejection ?? null,
      finalNarrationAuthority: authority,
      providerFailure: trace.providerFailure ?? null,
    },
    reasons,
    verdict: reasons.length === 0 ? "pass" : "fail",
  };
}

async function post(id, payload) {
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
    json = complete ? JSON.parse(complete) : { success: false, error: "non_json_response" };
  }
  const artifact = path.join(OUT, `cert-${String(completed).padStart(2, "0")}-${id}.json`);
  writeFileSync(
    artifact,
    JSON.stringify(
      {
        id,
        status: res.status,
        request: {
          topic: payload.topic,
          scriptMode: payload.scriptMode,
          qualityMode: payload.qualityMode,
          hookStyle: payload.hookStyle,
          stream: payload.stream,
        },
        response: json,
      },
      null,
      2,
    ),
  );
  return { json, artifact, status: res.status };
}

function payload(spec, extras = {}) {
  return {
    topic: spec.topic,
    context: spec.context,
    scriptMode: extras.scriptMode ?? spec.scriptMode,
    ...BASELINE,
    ...extras,
  };
}

const matrix = [
  { id: "top-five-fast", spec: RANKING, payload: payload(RANKING), model: "gpt-4.1-mini", qualityMode: "cheap" },
  {
    id: "player-comeback-balanced",
    spec: COMEBACK,
    payload: payload(COMEBACK, { qualityMode: "balanced" }),
    model: "gpt-4.1",
    qualityMode: "balanced",
  },
  {
    id: "match-preview-hook-provocative",
    spec: PREVIEW,
    payload: payload(PREVIEW, { hookStyle: "provocative_question" }),
    model: "gpt-4.1-mini",
    qualityMode: "cheap",
  },
  {
    id: "player-comeback-ndjson",
    spec: COMEBACK,
    payload: payload(COMEBACK, { stream: true }),
    model: "gpt-4.1-mini",
    qualityMode: "cheap",
  },
];

for (const step of matrix) {
  const posted = await post(step.id, step.payload);
  const classified = classify(posted.json, step.spec);
  results.push({
    id: step.id,
    model: step.model,
    endpointFamily: "responses",
    qualityMode: step.qualityMode,
    storyMode: step.payload.scriptMode,
    hookStyle: step.payload.hookStyle,
    httpStatus: posted.status,
    ...classified,
  });
  console.log(
    `${step.id}: ${classified.verdict} authority=${classified.finalNarrationAuthority} rescue=${classified.rescueEntered}`,
  );
}

writeFileSync(
  path.join(OUT, "model-cert-slice-summary.json"),
  `${JSON.stringify({ completedRequests: completed, results }, null, 2)}\n`,
);
console.log(JSON.stringify({ completedRequests: completed, results }, null, 2));
