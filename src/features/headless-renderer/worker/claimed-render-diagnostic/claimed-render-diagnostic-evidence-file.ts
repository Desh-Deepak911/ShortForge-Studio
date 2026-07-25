/**
 * Sprint 11E Phase 2E.2D.8F.6F — fixed ephemeral evidence JSONL channel.
 * Authoritative file path is frozen; operator-supplied paths are rejected.
 */

import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";

import {
  assertClaimedRenderBootstrapLifecycleEventSafe,
  CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
  formatClaimedRenderBootstrapLifecycleEvent,
  type ClaimedRenderDiagnosticBootstrapLifecycleEvent,
  type ClaimedRenderDiagnosticBootstrapLifecycleSink,
  type ClaimedRenderDiagnosticBootstrapLifecycleStage,
} from "./claimed-render-diagnostic-bootstrap-lifecycle";
import {
  CLAIMED_RENDER_DIAGNOSTIC_AUDIO_CODEC_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_AUDIO_PIPELINE_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_RESULT_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_SUBSTAGES,
  CLAIMED_RENDER_DIAGNOSTIC_CODEC_CONTAINER_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_RUNTIME_CAPABILITY_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_STORAGE_CAPABILITY_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_VIDEO_CODEC_CLASSES,
  CLAIMED_RENDER_DIAGNOSTIC_WORKSPACE_CAPABILITY_CLASSES,
} from "./claimed-render-diagnostic-capability-boundary";
import {
  assertClaimedRenderDiagnosticEventSafe,
  formatClaimedRenderDiagnosticEvent,
  type ClaimedRenderDiagnosticEventSink,
  type ClaimedRenderDiagnosticSafeEvent,
} from "./claimed-render-diagnostic-events";

export const CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR =
  "/tmp/shortforge-claimed-render-diagnostic" as const;

export const CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH =
  `${CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR}/evidence.jsonl` as const;

export const CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_MAX_SEC = 300;

const ALLOWED_EVENT_NAMES = Object.freeze([
  CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
  "hosted.claimed_render_diagnostic",
] as const);

const ALLOWED_BOOTSTRAP_STAGES = Object.freeze([
  "shell_entrypoint_started",
  "node_process_starting",
  "node_entrypoint_started",
  "diagnostic_gate_passed",
  "variant_minimal_started",
  "variant_minimal_terminal",
  "variant_live_smoke_started",
  "variant_live_smoke_terminal",
  "diagnostic_terminal",
  "shell_child_exit",
  "evidence_hold_started",
  "evidence_hold_completed",
] as const);

const ALLOWED_DIAGNOSTIC_STAGES = Object.freeze([
  "diagnostic_environment",
  "binary_preflight",
  "fixture_prepare",
  "claimed_job_prepare",
  "capability_preflight",
  "execute_render_job",
  "comparison",
  "cleanup",
] as const);

const ALLOWED_VARIANTS = Object.freeze(["minimal", "live_smoke"] as const);

const ALLOWED_STATUS = Object.freeze(["ok", "failed", "skipped"] as const);

const ALLOWED_BOUNDARY = Object.freeze([
  "observed",
  "not_observed",
  "not_applicable",
] as const);

const ALLOWED_CLEANUP = Object.freeze(["ok", "failed", "not_run"] as const);

const FORBIDDEN_OUTPUT =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|https?:\/\/|file:\/\/|@sha256:|process\.env|0x[a-f0-9]{8,})/i;

export function resolveClaimedRenderDiagnosticEvidencePath(): string {
  return CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH;
}

export function assertClaimedRenderDiagnosticEvidencePathFixed(
  candidate: string,
): { readonly ok: true } | { readonly ok: false; readonly reasonId: "evidence_path_not_fixed" } {
  if (candidate !== CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH) {
    return { ok: false, reasonId: "evidence_path_not_fixed" };
  }
  return { ok: true };
}

export function assertClaimedRenderDiagnosticEvidenceLineSafe(
  line: string,
): { readonly ok: true } | { readonly ok: false } {
  if (!line.trim().startsWith("{")) return { ok: false };
  if (FORBIDDEN_OUTPUT.test(line)) return { ok: false };
  if (/\\u00[0-9a-f]{2}/i.test(line)) return { ok: false };
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isEnum(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

export function validateClaimedRenderDiagnosticEvidenceRecord(
  parsed: unknown,
): { readonly ok: true } | { readonly ok: false; readonly reasonId: string } {
  if (!isRecord(parsed)) return { ok: false, reasonId: "schema_not_object" };
  if (!isEnum(parsed.name, ALLOWED_EVENT_NAMES)) {
    return { ok: false, reasonId: "schema_event_name" };
  }

  if (parsed.name === CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME) {
    if (!isEnum(parsed.lifecycle_stage, ALLOWED_BOOTSTRAP_STAGES)) {
      return { ok: false, reasonId: "schema_lifecycle_stage" };
    }
    if (!isEnum(parsed.status, ["ok", "failed"])) {
      return { ok: false, reasonId: "schema_status" };
    }
    if (
      parsed.reason_id != null &&
      (typeof parsed.reason_id !== "string" || parsed.reason_id.length > 64)
    ) {
      return { ok: false, reasonId: "schema_reason_id" };
    }
    return { ok: true };
  }

  if (!isEnum(parsed.status, ALLOWED_STATUS)) {
    return { ok: false, reasonId: "schema_status" };
  }
  if (!isEnum(parsed.variant, ALLOWED_VARIANTS)) {
    return { ok: false, reasonId: "schema_variant" };
  }
  if (!isEnum(parsed.diagnostic_stage, ALLOWED_DIAGNOSTIC_STAGES)) {
    return { ok: false, reasonId: "schema_diagnostic_stage" };
  }
  if (
    parsed.reason_id != null &&
    (typeof parsed.reason_id !== "string" || parsed.reason_id.length > 64)
  ) {
    return { ok: false, reasonId: "schema_reason_id" };
  }
  if (
    typeof parsed.workspace_classification_count !== "number" ||
    !Number.isInteger(parsed.workspace_classification_count) ||
    parsed.workspace_classification_count < 0 ||
    parsed.workspace_classification_count > 15
  ) {
    return { ok: false, reasonId: "schema_workspace_count" };
  }
  if (
    parsed.bounded_duration_ms != null &&
    (typeof parsed.bounded_duration_ms !== "number" ||
      !Number.isInteger(parsed.bounded_duration_ms) ||
      parsed.bounded_duration_ms < 0 ||
      parsed.bounded_duration_ms > 600_000)
  ) {
    return { ok: false, reasonId: "schema_duration" };
  }
  if (!isEnum(parsed.cleanup_status, ALLOWED_CLEANUP)) {
    return { ok: false, reasonId: "schema_cleanup_status" };
  }
  if (!isRecord(parsed.boundary_presence)) {
    return { ok: false, reasonId: "schema_boundary_presence" };
  }
  for (const value of Object.values(parsed.boundary_presence)) {
    if (!isEnum(value, ALLOWED_BOUNDARY)) {
      return { ok: false, reasonId: "schema_boundary_value" };
    }
  }
  const capabilityFields = Object.freeze([
    ["capability_substage", CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_SUBSTAGES],
    ["capability_class", CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_CLASSES],
    [
      "requested_output_container_class",
      CLAIMED_RENDER_DIAGNOSTIC_CODEC_CONTAINER_CLASSES,
    ],
    [
      "requested_video_codec_class",
      CLAIMED_RENDER_DIAGNOSTIC_VIDEO_CODEC_CLASSES,
    ],
    [
      "requested_audio_codec_class",
      CLAIMED_RENDER_DIAGNOSTIC_AUDIO_CODEC_CLASSES,
    ],
    [
      "source_storage_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_STORAGE_CAPABILITY_CLASSES,
    ],
    [
      "artifact_storage_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_STORAGE_CAPABILITY_CLASSES,
    ],
    [
      "browser_runtime_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_RUNTIME_CAPABILITY_CLASSES,
    ],
    [
      "ffmpeg_runtime_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_RUNTIME_CAPABILITY_CLASSES,
    ],
    [
      "audio_pipeline_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_AUDIO_PIPELINE_CLASSES,
    ],
    [
      "workspace_capability_class",
      CLAIMED_RENDER_DIAGNOSTIC_WORKSPACE_CAPABILITY_CLASSES,
    ],
    ["result_class", CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_RESULT_CLASSES],
  ] as const);
  for (const [field, allowed] of capabilityFields) {
    const value = parsed[field];
    if (value == null) continue;
    if (!isEnum(value, allowed)) {
      return { ok: false, reasonId: "schema_capability_field" };
    }
  }
  return { ok: true };
}

export function validateClaimedRenderDiagnosticEvidenceLine(
  line: string,
): { readonly ok: true } | { readonly ok: false; readonly reasonId: string } {
  if (!assertClaimedRenderDiagnosticEvidenceLineSafe(line).ok) {
    return { ok: false, reasonId: "privacy_rejected" };
  }
  try {
    const parsed = JSON.parse(line) as unknown;
    const schema = validateClaimedRenderDiagnosticEvidenceRecord(parsed);
    if (!schema.ok) return schema;
    return { ok: true };
  } catch {
    return { ok: false, reasonId: "schema_json_parse" };
  }
}

export function appendClaimedRenderDiagnosticEvidenceLine(line: string): void {
  const pathFixed = assertClaimedRenderDiagnosticEvidencePathFixed(
    resolveClaimedRenderDiagnosticEvidencePath(),
  );
  if (!pathFixed.ok) {
    throw new Error(pathFixed.reasonId);
  }
  const validated = validateClaimedRenderDiagnosticEvidenceLine(line);
  if (!validated.ok) {
    throw new Error(validated.reasonId);
  }
  mkdirSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR, { recursive: true });
  const fd = openSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "a");
  try {
    writeSync(fd, `${line}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function emitEvidenceLine(line: string): void {
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    // stdout is best effort
  }
  appendClaimedRenderDiagnosticEvidenceLine(line);
}

export function createClaimedRenderDiagnosticEvidenceBootstrapSink(): ClaimedRenderDiagnosticBootstrapLifecycleSink {
  return (
    stage: ClaimedRenderDiagnosticBootstrapLifecycleStage,
    status: "ok" | "failed" = "ok",
    reasonId: string | null = null,
  ) => {
    const line = formatClaimedRenderBootstrapLifecycleEvent({
      name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
      lifecycleStage: stage,
      status,
      reasonId,
    });
    if (!assertClaimedRenderBootstrapLifecycleEventSafe(line).ok) return;
    emitEvidenceLine(line);
  };
}

export function createClaimedRenderDiagnosticEvidenceEventSink(): ClaimedRenderDiagnosticEventSink {
  return (event: ClaimedRenderDiagnosticSafeEvent) => {
    const line = formatClaimedRenderDiagnosticEvent(event);
    if (!assertClaimedRenderDiagnosticEventSafe(line).ok) return;
    emitEvidenceLine(line);
  };
}

export function parseClaimedRenderDiagnosticEvidenceFile(
  content: string,
): readonly (ClaimedRenderDiagnosticBootstrapLifecycleEvent | ClaimedRenderDiagnosticSafeEvent)[] {
  const events: Array<
    ClaimedRenderDiagnosticBootstrapLifecycleEvent | ClaimedRenderDiagnosticSafeEvent
  > = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const validated = validateClaimedRenderDiagnosticEvidenceLine(line);
    if (!validated.ok) continue;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed.name === CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME) {
      events.push({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage: parsed.lifecycle_stage as ClaimedRenderDiagnosticBootstrapLifecycleStage,
        status: parsed.status === "failed" ? "failed" : "ok",
        reasonId: typeof parsed.reason_id === "string" ? parsed.reason_id : null,
      });
      continue;
    }
    events.push({
      name: "hosted.claimed_render_diagnostic",
      status: parsed.status as ClaimedRenderDiagnosticSafeEvent["status"],
      variant: parsed.variant as ClaimedRenderDiagnosticSafeEvent["variant"],
      diagnosticStage: parsed.diagnostic_stage as ClaimedRenderDiagnosticSafeEvent["diagnosticStage"],
      reasonId: typeof parsed.reason_id === "string" ? parsed.reason_id : null,
      boundaryPresence:
        parsed.boundary_presence as ClaimedRenderDiagnosticSafeEvent["boundaryPresence"],
      workspaceClassificationCount: parsed.workspace_classification_count as number,
      boundedDurationMs:
        typeof parsed.bounded_duration_ms === "number"
          ? parsed.bounded_duration_ms
          : null,
      cleanupStatus: parsed.cleanup_status as ClaimedRenderDiagnosticSafeEvent["cleanupStatus"],
    });
  }
  return events;
}

export function writeClaimedRenderDiagnosticEvidenceBootstrap(
  stage: ClaimedRenderDiagnosticBootstrapLifecycleStage,
  status: "ok" | "failed" = "ok",
  reasonId: string | null = null,
): void {
  createClaimedRenderDiagnosticEvidenceBootstrapSink()(stage, status, reasonId);
}
