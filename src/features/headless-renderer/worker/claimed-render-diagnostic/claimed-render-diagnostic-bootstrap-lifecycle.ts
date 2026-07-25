/**
 * Sprint 11E Phase 2E.2D.8F.6D — safe bootstrap lifecycle events for claimed-render diagnostic.
 */

export const CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME =
  "hosted.claimed_render_diagnostic_bootstrap" as const;

export const CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_LIFECYCLE_STAGES = Object.freeze([
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

export type ClaimedRenderDiagnosticBootstrapLifecycleStage =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_LIFECYCLE_STAGES)[number];

export type ClaimedRenderDiagnosticBootstrapLifecycleEvent = {
  readonly name: typeof CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME;
  readonly lifecycleStage: ClaimedRenderDiagnosticBootstrapLifecycleStage;
  readonly status: "ok" | "failed";
  readonly reasonId: string | null;
};

const FORBIDDEN_OUTPUT =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|https?:\/\/|file:\/\/|@sha256:|process\.env|0x[a-f0-9]{8,})/i;

export function assertClaimedRenderBootstrapLifecycleEventSafe(
  line: string,
): { readonly ok: true } | { readonly ok: false } {
  if (FORBIDDEN_OUTPUT.test(line)) return { ok: false };
  if (/\\u00[0-9a-f]{2}/i.test(line)) return { ok: false };
  return { ok: true };
}

export function formatClaimedRenderBootstrapLifecycleEvent(
  event: ClaimedRenderDiagnosticBootstrapLifecycleEvent,
): string {
  const payload = {
    name: event.name,
    lifecycle_stage: event.lifecycleStage,
    status: event.status,
    reason_id: event.reasonId,
  };
  const line = JSON.stringify(payload);
  if (!assertClaimedRenderBootstrapLifecycleEventSafe(line).ok) {
    return JSON.stringify({
      name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
      lifecycle_stage: "diagnostic_terminal",
      status: "failed",
      reason_id: "bootstrap_sanitize_blocked",
    });
  }
  return line;
}

export type ClaimedRenderDiagnosticBootstrapLifecycleSink = (
  stage: ClaimedRenderDiagnosticBootstrapLifecycleStage,
  status?: "ok" | "failed",
  reasonId?: string | null,
) => void;

export function createStdoutClaimedRenderBootstrapLifecycleSink(): ClaimedRenderDiagnosticBootstrapLifecycleSink {
  return (stage, status = "ok", reasonId = null) => {
    process.stdout.write(
      `${formatClaimedRenderBootstrapLifecycleEvent({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage: stage,
        status,
        reasonId,
      })}\n`,
    );
  };
}

export function writeClaimedRenderBootstrapLifecycleStdout(
  stage: ClaimedRenderDiagnosticBootstrapLifecycleStage,
  status: "ok" | "failed" = "ok",
  reasonId: string | null = null,
): void {
  createStdoutClaimedRenderBootstrapLifecycleSink()(stage, status, reasonId);
}

export function parseClaimedRenderBootstrapLifecycleLines(
  output: string,
): ClaimedRenderDiagnosticBootstrapLifecycleEvent[] {
  const events: ClaimedRenderDiagnosticBootstrapLifecycleEvent[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    if (!assertClaimedRenderBootstrapLifecycleEventSafe(trimmed).ok) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        name?: string;
        lifecycle_stage?: string;
        status?: string;
        reason_id?: string | null;
      };
      if (parsed.name !== CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME) continue;
      if (
        !(CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_LIFECYCLE_STAGES as readonly string[]).includes(
          parsed.lifecycle_stage ?? "",
        )
      ) {
        continue;
      }
      events.push({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage:
          parsed.lifecycle_stage as ClaimedRenderDiagnosticBootstrapLifecycleStage,
        status: parsed.status === "failed" ? "failed" : "ok",
        reasonId:
          typeof parsed.reason_id === "string" ? parsed.reason_id : null,
      });
    } catch {
      continue;
    }
  }
  return events;
}
