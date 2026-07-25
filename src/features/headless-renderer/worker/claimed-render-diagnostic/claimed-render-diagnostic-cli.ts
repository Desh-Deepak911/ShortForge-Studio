/**
 * CLI bootstrap for provider-free claimed-render diagnostic.
 * Emits node_entrypoint_started before dynamic imports to surface import failures.
 */

import {
  createClaimedRenderDiagnosticEvidenceBootstrapSink,
  createClaimedRenderDiagnosticEvidenceEventSink,
  writeClaimedRenderDiagnosticEvidenceBootstrap,
} from "./claimed-render-diagnostic-evidence-file";

async function main(): Promise<number> {
  writeClaimedRenderDiagnosticEvidenceBootstrap("node_entrypoint_started");

  const { validateClaimedRenderDiagnosticEnvironment } = await import(
    "./claimed-render-diagnostic-environment"
  );
  const { createInitialBoundaryPresence } = await import(
    "./claimed-render-diagnostic-events"
  );
  const { runClaimedRenderDiagnostic } = await import(
    "./claimed-render-diagnostic-runner"
  );

  const env = process.env;
  const sink = createClaimedRenderDiagnosticEvidenceEventSink();
  const bootstrapSink = createClaimedRenderDiagnosticEvidenceBootstrapSink();
  const verdict = validateClaimedRenderDiagnosticEnvironment(env);

  if (!verdict.ok) {
    sink({
      name: "hosted.claimed_render_diagnostic",
      status: "failed",
      variant: "minimal",
      diagnosticStage: "diagnostic_environment",
      reasonId: verdict.reasonId,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: null,
      cleanupStatus: "not_run",
    });
    bootstrapSink("diagnostic_terminal", "failed", verdict.reasonId);
    return 1;
  }

  writeClaimedRenderDiagnosticEvidenceBootstrap("diagnostic_gate_passed");

  const result = await runClaimedRenderDiagnostic({
    env,
    eventSink: sink,
    bootstrapLifecycleSink: bootstrapSink,
  });

  bootstrapSink(
    "diagnostic_terminal",
    result.overall === "PASS" ? "ok" : "failed",
    result.comparisonClass,
  );

  return result.exitCode;
}

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  })
  .catch(() => {
    writeClaimedRenderDiagnosticEvidenceBootstrap(
      "diagnostic_terminal",
      "failed",
      "node_runtime_exception",
    );
    process.exitCode = 1;
    process.exit(1);
  });
