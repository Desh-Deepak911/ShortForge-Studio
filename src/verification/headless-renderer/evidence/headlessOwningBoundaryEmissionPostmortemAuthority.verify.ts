/**
 * Sprint 11E Phase 2E.2D.8F.7.3 — owning-boundary emission postmortem authority.
 * Run: npm run test:headless-owning-boundary-emission-postmortem-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { sanitizeOwningBoundaryObservation } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";

import {
  assertExecutionProbeEvidenceSafe,
  renderFlyRenderExecutionProbeEvidenceMarkdown,
  writeFlyRenderExecutionProbeEvidence,
} from "../fly-render-live/claimed-render-execution-probe-evidence";
import {
  assertProbeBoundaryEvidenceContract,
  captureBoundedHostedRenderBoundaryLogLines,
  classifyBoundaryEmissionFromFlyLogs,
  countRawHostedRenderBoundaryMentionsInWindow,
  filterBoundaryEventsForRunCorrelation,
  ingestOwningBoundaryEvidenceFromFlyLogs,
  parseHostedRenderBoundaryEventFromLogLine,
  parseHostedRenderBoundaryEventsFromLines,
} from "../fly-render-live/owning-boundary-probe-authority";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const RENDER_MACHINE_ID = "d895d16f264918";
const VERIFY_MACHINE_ID = "d895d12a240938";
const PROBE_OBSERVATION_START_MS = Date.parse("2026-07-24T10:52:19.462Z");
const PROBE_OBSERVATION_END_MS = Date.parse("2026-07-24T10:55:27.717Z");
const ROOT = path.resolve(import.meta.dirname, "../../../..");
const CURRENT_PROBE_PASS_SHA =
  "1342cc902cd0051effb4a4f3b466d9d6b717401a4776a073678f16a1072eac7b";
const ARCHIVED_PROBE_FAIL_SHA_8I52C =
  "9355792575999a4fb8fec0032f3519e7a3d0f08033c9e34e842b1a809c3d5076";
const PRIOR_BOUNDARY_PROBE_FAIL_SHA =
  "d23acb8c1b25db87319018c7899128f75e30938a986c5725756d7fc334dd44ef";
const PRIOR_BOOTSTRAP_FAIL_SHA =
  "aafd4161ca3f071e1dd5fd68cd7c536cafc1e367b3ff7991e5a2d939388540c0";
const PRE_RUN_ARCHIVE_SHA =
  "535c7cc07f06866ebbc148ff9cd406e0d01bb1285505bcecf56db4e289b806f0";
const DIAG_PASS_SHA =
  "da861f68858a48ab330804e36c9d9dd0c2e8e586f11dd4a6736f6fbb51f0ffc4";

const FLY_PREFIX = `2026-07-24T10:54:57Z app[${RENDER_MACHINE_ID}] iad [info]`;

const FIXTURE_8F72E_CLAIMED_CONTEXT = `${FLY_PREFIX}{"name":"hosted.render.boundary","atMs":1784890497317,"mode":"render","action":"claimed_context_validated","facts":{"owning_boundary":"claimed_context_validated","boundary_sequence":"1","machine_class":"exact_render","concurrency_class":"single","execution_window_class":"bounded","claim_ack_correlation_class":"current_run"}}`;

const FIXTURE_8F72E_CANONICAL_REQUEST = `${FLY_PREFIX}{"name":"hosted.render.boundary","atMs":1784890497532,"mode":"render","action":"canonical_request_loaded","facts":{"owning_boundary":"canonical_request_loaded","boundary_sequence":"2","machine_class":"exact_render","concurrency_class":"single","execution_window_class":"bounded","claim_ack_correlation_class":"current_run","render_request_schema_class":"valid_v1","render_profile_class":"phase3_supported","manifest_validation_class":"valid","bundle_validation_class":"valid","expected_slot_coverage_class":"complete","finalized_source_object_coverage_class":"complete","source_asset_count_class":"small","source_asset_materialization_class":"not_started","source_asset_byte_verification_class":"not_reached","source_workspace_collision_class":"none","page_reserved_path_integrity_class":"intact","storage_adapter_class":"redacted","canonical_job_identity_coherence_class":"coherent"}}`;

const FIXTURE_8F72E_VERIFY_MACHINE_BOUNDARY = `2026-07-24T10:54:57Z app[${VERIFY_MACHINE_ID}] iad [info]{"name":"hosted.render.boundary","atMs":1784890497000,"mode":"verify","action":"claimed_context_validated","facts":{"owning_boundary":"claimed_context_validated","boundary_sequence":"1"}}`;

const FIXTURE_8F72E_PRE_WINDOW = `2026-07-24T10:51:00Z app[${RENDER_MACHINE_ID}] iad [info]{"name":"hosted.render.boundary","atMs":1784890313000,"mode":"render","action":"claimed_context_validated","facts":{"owning_boundary":"claimed_context_validated","boundary_sequence":"1"}}`;

function fixture8F72EProbeWindowLogText(): string {
  return [
    FIXTURE_8F72E_PRE_WINDOW,
    FIXTURE_8F72E_VERIFY_MACHINE_BOUNDARY,
    FIXTURE_8F72E_CLAIMED_CONTEXT,
    FIXTURE_8F72E_CANONICAL_REQUEST,
  ].join("\n");
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.7.3 — owning-boundary emission postmortem authority\n",
  );

  await test("accepted probe and diagnostic evidence SHAs remain byte-identical", () => {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md")))
        .digest("hex"),
      CURRENT_PROBE_PASS_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-8i6d-${ARCHIVED_PROBE_FAIL_SHA_8I52C}.md`,
            ),
          ),
        )
        .digest("hex"),
      ARCHIVED_PROBE_FAIL_SHA_8I52C,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${PRIOR_BOUNDARY_PROBE_FAIL_SHA}.md`,
            ),
          ),
        )
        .digest("hex"),
      PRIOR_BOUNDARY_PROBE_FAIL_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${PRIOR_BOOTSTRAP_FAIL_SHA}.md`,
            ),
          ),
        )
        .digest("hex"),
      PRIOR_BOOTSTRAP_FAIL_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${PRE_RUN_ARCHIVE_SHA}.md`,
            ),
          ),
        )
        .digest("hex"),
      PRE_RUN_ARCHIVE_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.md")))
        .digest("hex"),
      DIAG_PASS_SHA,
    );
  });

  await test("Fly flattened log line parses machine id and ISO log timestamp", () => {
    const parsed = parseHostedRenderBoundaryEventFromLogLine(
      FIXTURE_8F72E_CANONICAL_REQUEST,
    );
    assert.ok(parsed != null);
    assert.equal(parsed!.machineId, RENDER_MACHINE_ID);
    assert.equal(parsed!.action, "canonical_request_loaded");
    assert.equal(parsed!.logTimestampMs, Date.parse("2026-07-24T10:54:57Z"));
    assert.equal(parsed!.facts?.render_profile_class, "phase3_supported");
    assert.equal(parsed!.facts?.owning_boundary, "canonical_request_loaded");
  });

  await test("action field is distinct from owning_boundary fact id", () => {
    const parsed = parseHostedRenderBoundaryEventFromLogLine(
      FIXTURE_8F72E_CLAIMED_CONTEXT,
    );
    assert.ok(parsed != null);
    assert.equal(parsed!.action, "claimed_context_validated");
    assert.equal(parsed!.facts?.owning_boundary, "claimed_context_validated");
    assert.equal(parsed!.facts?.boundary_sequence, "1");
  });

  await test("legacy bare-json-only gate would miss Fly-prefixed boundary lines", () => {
    const line = FIXTURE_8F72E_CLAIMED_CONTEXT;
    assert.equal(line.trim().startsWith("{"), false);
    assert.ok(parseHostedRenderBoundaryEventFromLogLine(line) != null);
  });

  await test("observation window edges exclude pre-window and post-window events", () => {
    const postWindow = `2026-07-24T10:56:00Z app[${RENDER_MACHINE_ID}] iad [info]{"name":"hosted.render.boundary","atMs":1784890600000,"mode":"render","action":"source_assets_materialization_started","facts":{"owning_boundary":"source_assets_materialization_started","boundary_sequence":"3"}}`;
    const parsed = parseHostedRenderBoundaryEventsFromLines([
      FIXTURE_8F72E_PRE_WINDOW,
      FIXTURE_8F72E_CLAIMED_CONTEXT,
      FIXTURE_8F72E_CANONICAL_REQUEST,
      postWindow,
    ]);
    const filtered = filterBoundaryEventsForRunCorrelation({
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
      events: parsed,
    });
    assert.equal(filtered.length, 2);
    assert.deepEqual(
      filtered.map((event) => event.action),
      ["claimed_context_validated", "canonical_request_loaded"],
    );
  });

  await test("exact render Machine correlation ignores verify-machine boundary noise", () => {
    const rawCount = countRawHostedRenderBoundaryMentionsInWindow({
      flyLogText: fixture8F72EProbeWindowLogText(),
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
    });
    assert.equal(rawCount, 2);
  });

  await test("8F.7.2E captured Fly shape ingests two correlated boundaries", () => {
    const ingested = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText: fixture8F72EProbeWindowLogText(),
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
      workspaceMaterializationCompleted: false,
      terminalReasonId: "page_workspace_attribution_missing",
      terminalSubstage: "page_contract_ready",
      cleanupOutcomeClass: "ok",
    });
    assert.equal(ingested.ok, true);
    if (!ingested.ok || ingested.evidence == null) return;
    assert.equal(
      ingested.emissionClassification,
      "boundary_events_emitted_but_incomplete",
    );
    assert.deepEqual(ingested.evidence.observedSequence, [
      "claimed_context_validated",
      "canonical_request_loaded",
    ]);
    assert.equal(
      ingested.evidence.lastObservedBoundary,
      "canonical_request_loaded",
    );
    assert.equal(
      ingested.evidence.missingNextBoundary,
      "source_assets_materialization_started",
    );
    const canonicalEvent = parseHostedRenderBoundaryEventFromLogLine(
      FIXTURE_8F72E_CANONICAL_REQUEST,
    );
    assert.equal(canonicalEvent?.facts?.render_profile_class, "phase3_supported");
  });

  await test("emitted-but-rejected regression when Fly prefix prevented correlation", () => {
    const classification = classifyBoundaryEmissionFromFlyLogs({
      flyLogText: fixture8F72EProbeWindowLogText(),
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
      ingestedEvidencePresent: false,
    });
    assert.equal(
      classification,
      "boundary_events_emitted_but_observer_rejected",
    );
    const legacyMiss = parseHostedRenderBoundaryEventsFromLines(
      fixture8F72EProbeWindowLogText().split("\n").filter((line) => line.startsWith("{")),
    );
    assert.equal(legacyMiss.length, 0);
  });

  await test("no-event emission classification when window has no boundary mentions", () => {
    const classification = classifyBoundaryEmissionFromFlyLogs({
      flyLogText: `${FLY_PREFIX}{"name":"hosted.loop.delivery","atMs":1,"action":"dispatch_sweep"}`,
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
      ingestedEvidencePresent: false,
    });
    assert.equal(classification, "boundary_events_not_emitted");
  });

  await test("log window expired when only pre-boundary boundaries exist", () => {
    const classification = classifyBoundaryEmissionFromFlyLogs({
      flyLogText: FIXTURE_8F72E_PRE_WINDOW,
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
      ingestedEvidencePresent: false,
    });
    assert.equal(classification, "log_window_expired");
  });

  await test("provider log read failed classification on empty log text", () => {
    const classification = classifyBoundaryEmissionFromFlyLogs({
      flyLogText: "",
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      ingestedEvidencePresent: false,
    });
    assert.equal(classification, "provider_log_read_failed");
  });

  await test("bounded capture retains in-window render-machine boundary lines", () => {
    const captured = captureBoundedHostedRenderBoundaryLogLines({
      flyLogText: fixture8F72EProbeWindowLogText(),
      observationBoundaryMs: PROBE_OBSERVATION_START_MS,
      observationEndedMs: PROBE_OBSERVATION_END_MS,
      renderMachineId: RENDER_MACHINE_ID,
    });
    assert.equal(captured.length, 2);
    assert.match(captured[0]!, /claimed_context_validated/);
    assert.match(captured[1]!, /canonical_request_loaded/);
  });

  await test("privacy sanitization redacts hostile flattened fact values", () => {
    const hostile = `${FLY_PREFIX}{"name":"hosted.render.boundary","atMs":1,"action":"claimed_context_validated","facts":{"owning_boundary":"claimed_context_validated","boundary_sequence":"1","storage_adapter_class":"postgresql://secret"}}`;
    const parsed = parseHostedRenderBoundaryEventFromLogLine(hostile);
    assert.ok(parsed != null);
    const sanitized = sanitizeOwningBoundaryObservation({
      atMs: parsed!.atMs,
      action: parsed!.action,
      ...(parsed!.facts ?? {}),
      facts: parsed!.facts,
    });
    assert.ok(sanitized != null);
    assert.equal(sanitized!.facts.storage_adapter_class, "redacted");
  });

  await test("page terminal evidence contract rejects missing boundary and classification", () => {
    const contract = assertProbeBoundaryEvidenceContract({
      overall: "FAIL",
      failureSubstage: "page_contract_ready",
      failureReasonId: "page_workspace_attribution_missing",
      executionAttribution: {
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_workspace_attribution_missing",
      },
      owningBoundaryEvidence: null,
      boundaryEmissionClassification: null,
    });
    assert.equal(contract.ok, false);
    if (contract.ok) return;
    assert.match(contract.message, /page_terminal_without_boundary_evidence_or_classification/);
  });

  await test("page terminal evidence contract accepts explicit emission classification", () => {
    const contract = assertProbeBoundaryEvidenceContract({
      overall: "FAIL",
      failureSubstage: "page_contract_ready",
      failureReasonId: "page_workspace_attribution_missing",
      executionAttribution: {
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_workspace_attribution_missing",
      },
      owningBoundaryEvidence: null,
      boundaryEmissionClassification: "boundary_events_emitted_but_incomplete",
    });
    assert.equal(contract.ok, true);
  });

  await test("execution probe evidence writer enforces page terminal boundary contract", () => {
    assert.throws(() =>
      writeFlyRenderExecutionProbeEvidence({
        evidencePath: ".tmp/boundary-contract-missing.md",
        document: {
          title: "fixture",
          overall: "FAIL",
          eligibilityVerdict: "fixture",
          startedAtIso: "2026-07-24T10:52:19.462Z",
          endedAtIso: "2026-07-24T10:55:27.717Z",
          failureSubstage: "page_contract_ready",
          failureReasonId: "page_workspace_attribution_missing",
          executionAttribution: {
            executionSubstage: "page_contract_ready",
            pageFailureReason: "page_workspace_attribution_missing",
          } as never,
          cleanupStatus: "ok",
          executionStages: [],
          smokeWorkload: null,
          resourceObservation: null,
          executionDurationMs: null,
          artifactAuthority: null,
          acceptedImageDigestSha256: null,
          owningBoundaryEvidence: null,
          owningBoundaryIngestionFailure: null,
          boundaryEmissionClassification: null,
          jobCreateAttribution: null,
          notes: [],
        },
      }),
    );
  });

  await test("execution probe evidence markdown includes boundary emission classification", () => {
    const md = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "fixture",
      overall: "FAIL",
      eligibilityVerdict: "fixture",
      startedAtIso: "2026-07-24T10:52:19.462Z",
      endedAtIso: "2026-07-24T10:55:27.717Z",
      failureSubstage: "page_contract_ready",
      failureReasonId: "page_workspace_attribution_missing",
      executionAttribution: null,
      cleanupStatus: "ok",
      executionStages: [],
      smokeWorkload: null,
      resourceObservation: null,
      executionDurationMs: null,
      artifactAuthority: null,
      acceptedImageDigestSha256: null,
      owningBoundaryEvidence: null,
      owningBoundaryIngestionFailure: "boundary_evidence_ingestion_failed",
      boundaryEmissionClassification: "boundary_events_emitted_but_observer_rejected",
      jobCreateAttribution: null,
      notes: ["fixture"],
    });
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
    assert.match(md, /Boundary emission classification:/);
    assert.match(md, /boundary_events_emitted_but_observer_rejected/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
