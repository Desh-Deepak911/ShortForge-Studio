/**
 * Prompt 8 bounded live /api/generate-script certification.
 * Maximum 10 provider invocations (planner + composer + rewrite + retry),
 * not 10 HTTP requests. One accepted result is encoded as JSON and NDJSON
 * without a second generation. Artifacts stay under gitignored .tmp/.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.STORY_QUALITY_CERT_BASE ?? "http://127.0.0.1:3477";
const OUT = path.resolve(".tmp/story-quality-real-cert/prompt8");
const MAX_PROVIDER_INVOCATIONS = 10;
const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus|pressure decides|the contest tightens|hold hold|answer answer/iu;

const EXPECTED = Object.freeze({
  cheap: 2,
  balanced: 3,
});

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
  require: [/Rookfall/i, /Silvermere/i, /preseason|preview|continental|decade|meeting|contest/i, /Kest|former|discarded/i],
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
  require: [/Nia Calder/i, /Tess Orlow/i, /Bo Renwick/i, /Imani Shore/i, /Pax Ellery/i, /number one|stands last|decisive|#1/i],
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

let usedInvocations = 0;
const results = [];
let lastRejectionStage = null;
let stoppedReason = null;

function wordCount(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

function countInvocations(budget) {
  if (!budget || typeof budget !== "object") return 0;
  return (
    (budget.planner ?? 0) +
    (budget.initialNarration ?? 0) +
    (budget.lengthCompression ?? 0) +
    (budget.hookRepair ?? 0) +
    (budget.hookFallback ?? 0) +
    (budget.retentionBodyRewrite ?? 0)
  );
}

function splitInvocations(budget) {
  return {
    planner: budget?.planner ?? 0,
    composer: budget?.initialNarration ?? 0,
    rewrite: (budget?.hookRepair ?? 0) + (budget?.retentionBodyRewrite ?? 0),
    retry: (budget?.lengthCompression ?? 0) + (budget?.hookFallback ?? 0),
  };
}

function canStart(expected) {
  return usedInvocations + expected <= MAX_PROVIDER_INVOCATIONS;
}

function publicFields(body) {
  return {
    success: body?.success === true,
    data: body?.data ?? null,
    generationContext: body?.generationContext ?? null,
    researchApplied: body?.researchApplied ?? null,
    hookPlan: body?.hookPlan ?? null,
    hookDiagnostics: body?.hookDiagnostics ?? null,
    retentionPlan: body?.retentionPlan ?? null,
    retentionValidation: body?.retentionValidation ?? null,
    retentionDiagnostics: body?.retentionDiagnostics ?? null,
    generationDisposition: body?.generationDisposition ?? null,
  };
}

function serializeCanonical(body) {
  const json = publicFields(body);
  return {
    json,
    ndjson: `${JSON.stringify({ type: "complete", ...json })}\n`,
  };
}

function classify(body, spec) {
  const narration = body?.data?.narration ?? "";
  const disposition = body?.generationDisposition ?? {};
  const trace = disposition.acceptanceTrace ?? body?.retentionDiagnostics?.acceptanceTrace ?? {};
  const authority = trace.finalNarrationAuthority ?? "unavailable";
  const events = Array.isArray(trace.events) ? trace.events : [];
  const rescueEntered = events.some((event) => event.stage === "deterministic_rescue_entered");
  const rewriteAccepted = events.some((event) => event.stage === "rewrite_accepted");
  const warningNotes = body?.validationSummary?.warningNotes ?? [];
  const qualityReasons = warningNotes.filter(
    (note) =>
      typeof note === "string" &&
      (note.startsWith("substance:") ||
        note === "quality_below_target" ||
        note === "narration_substance_below_target" ||
        note === "quality_threshold_miss"),
  );
  const budget = body?.retentionDiagnostics?.budget ?? null;
  const invocations = countInvocations(budget);
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
    const members = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"].filter((name) =>
      narration.includes(name),
    );
    if (members.length !== 5) reasons.push("ranking_membership_incomplete");
    if (!/number one|stands last|decisive|#1/i.test(narration)) {
      reasons.push("ranking_number_one_payoff_missing");
    }
  }
  if (spec.id?.includes("preview") && (!/Rookfall/i.test(narration) || !/Silvermere/i.test(narration))) {
    reasons.push("required_participant_lost");
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
    callCounts: budget,
    invocationSplit: splitInvocations(budget),
    invocations,
    earliestDecisiveRejection: trace.earliestDecisiveRejection ?? null,
    finalNarrationAuthority: authority,
    providerFailure: trace.providerFailure ?? null,
    qualityBelowTarget: Boolean(disposition.qualityBelowTarget),
    qualityReasons,
    disposition: disposition.disposition ?? null,
    rescueEntered,
    rewriteAccepted,
    modelCallSuccess: Boolean(body?.success) && !rescueEntered,
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, error: "non_json_response" };
  }
  const artifact = path.join(OUT, `cert-${String(results.length + 1).padStart(2, "0")}-${id}.json`);
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
          duration: payload.duration,
          tone: payload.tone,
        },
        response: json,
      },
      null,
      2,
    ),
  );
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

function leakCheck(body, spec) {
  const publicJson = JSON.stringify(publicFields(body));
  const sentinels = [
    "Do not claim Voss failed a new test.",
    spec.context,
  ];
  return sentinels.filter((value) => value && publicJson.includes(value));
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
    {
      id: "player-comeback-fast",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK),
      model: "gpt-4.1-mini",
      qualityMode: "cheap",
      optional: false,
    },
    {
      id: "match-preview-fast",
      spec: PREVIEW,
      payload: baselinePayload(PREVIEW),
      model: "gpt-4.1-mini",
      qualityMode: "cheap",
      optional: false,
    },
    {
      id: "top-five-fast",
      spec: RANKING,
      payload: baselinePayload(RANKING),
      model: "gpt-4.1-mini",
      qualityMode: "cheap",
      optional: false,
    },
    {
      id: "player-comeback-balanced",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK, { qualityMode: "balanced" }),
      model: "gpt-4.1",
      qualityMode: "balanced",
      optional: false,
    },
    {
      id: "player-hook-provocative",
      spec: COMEBACK,
      payload: baselinePayload(COMEBACK, {
        scriptMode: "player_analysis",
        hookStyle: "provocative_question",
      }),
      model: "gpt-4.1-mini",
      qualityMode: "cheap",
      optional: true,
    },
    {
      id: "preview-hook-bold",
      spec: PREVIEW,
      payload: baselinePayload(PREVIEW, { hookStyle: "stakes_first" }),
      model: "gpt-4.1-mini",
      qualityMode: "cheap",
      optional: true,
    },
  ];

  for (const step of matrix) {
    const expected = EXPECTED[step.qualityMode === "balanced" ? "balanced" : "cheap"];
    if (!canStart(expected)) {
      stoppedReason = `optional_case_stopped_for_budget:${step.id}`;
      console.log(stoppedReason);
      break;
    }
    const posted = await post(step.id, step.payload);
    const classified = classify(posted.json, step.spec);
    usedInvocations += classified.invocations;
    const leaks = leakCheck(posted.json, step.spec);
    results.push({
      id: step.id,
      model: step.model,
      endpointFamily: "responses",
      qualityMode: step.qualityMode,
      storyMode: step.payload.scriptMode,
      hookStyle: step.payload.hookStyle,
      httpStatus: posted.status,
      artifact: path.relative(process.cwd(), posted.artifact),
      publicLeaks: leaks,
      ...classified,
    });
    console.log(
      `${step.id}: ${classified.verdict} authority=${classified.finalNarrationAuthority} rescue=${classified.rescueEntered} rewrite=${classified.rewriteAccepted} calls=${classified.invocations} total=${usedInvocations} hook=${classified.hookStrategy}`,
    );
    const stage = classified.earliestDecisiveRejection;
    if (
      stage &&
      stage === lastRejectionStage &&
      classified.finalNarrationAuthority === "deterministic_rescue"
    ) {
      stoppedReason = `repeated_systemic_rejection:${stage}`;
      console.log(stoppedReason);
      break;
    }
    lastRejectionStage = stage;
    if (usedInvocations > MAX_PROVIDER_INVOCATIONS) {
      stoppedReason = "provider_budget_overrun_after_in_flight_generation";
      break;
    }
  }

  const accepted = results.find(
    (row) =>
      row.finalNarrationAuthority === "model_direct" ||
      row.finalNarrationAuthority === "model_after_rewrite",
  );
  let transportParity = null;
  if (accepted) {
    const raw = JSON.parse(
      await import("node:fs").then((fs) =>
        fs.readFileSync(path.resolve(accepted.artifact), "utf8"),
      ),
    );
    const encoded = serializeCanonical(raw.response);
    const parsed = JSON.parse(encoded.ndjson);
    transportParity = {
      sharedInternalResult: true,
      independentSecondGeneration: false,
      sourceId: accepted.id,
      narrationEqual: encoded.json.data?.narration === parsed.data?.narration,
      authorityEqual:
        encoded.json.generationDisposition?.acceptanceTrace?.finalNarrationAuthority ===
        parsed.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      dispositionEqual:
        encoded.json.generationDisposition?.disposition ===
        parsed.generationDisposition?.disposition,
    };
    writeFileSync(
      path.join(OUT, "shared-result-json-ndjson.json"),
      JSON.stringify({ json: encoded.json, ndjson: encoded.ndjson, transportParity }, null, 2),
    );
  }

  const summary = {
    base: BASE,
    completedRequests: results.length,
    providerInvocations: usedInvocations,
    maxProviderInvocations: MAX_PROVIDER_INVOCATIONS,
    stoppedReason,
    transportParity,
    modelDirect: results.filter((row) => row.finalNarrationAuthority === "model_direct").length,
    modelAfterRewrite: results.filter((row) => row.finalNarrationAuthority === "model_after_rewrite").length,
    deterministicRescue: results.filter((row) => row.finalNarrationAuthority === "deterministic_rescue").length,
    results: results.map((row) => ({
      id: row.id,
      model: row.model,
      endpointFamily: row.endpointFamily,
      qualityMode: row.qualityMode,
      storyMode: row.storyMode,
      hookStyle: row.hookStyle,
      hookStrategy: row.hookStrategy,
      verdict: row.verdict,
      invocations: row.invocations,
      invocationSplit: row.invocationSplit,
      modelCallSuccess: row.modelCallSuccess,
      rejectionOrRepairStage: row.earliestDecisiveRejection,
      finalNarrationAuthority: row.finalNarrationAuthority,
      disposition: row.disposition,
      qualityBelowTarget: row.qualityBelowTarget,
      qualityReasons: row.qualityReasons,
      rescueEntered: row.rescueEntered,
      rewriteAccepted: row.rewriteAccepted,
      providerFailure: row.providerFailure,
      safeAcceptanceTrace: row.safeAcceptanceTrace,
      wordCount: row.narrationWordCount,
      publicLeaks: row.publicLeaks,
      reasons: row.reasons,
    })),
  };
  writeFileSync(path.join(OUT, "model-cert-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "model-cert-results.ndjson"),
    `${results.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  writeFileSync(
    path.join(OUT, "model-cert-fatal.json"),
    JSON.stringify({ error: String(error), usedInvocations }, null, 2),
  );
  process.exitCode = 1;
});
