"use client";

/**
 * Dev-only Export Device QA harness (Sprint 6F).
 * Not linked from production navigation.
 */

import { useMemo, useState } from "react";

import {
  EXPORT_GOLDEN_PROJECTS,
  collectExportParityCheckpoints,
  createExportDeviceQaReport,
  serializeExportDeviceQaReport,
  type ExportGoldenId,
  type ExportManualQaChecks,
  DEFAULT_MANUAL_QA_NOT_TESTED,
} from "@/features/export/qa";
import { runExportCapabilityPreflight } from "@/features/export/domain";
import { buildExportGoldenManifest } from "@/verification/export/goldens";

export default function ExportDeviceQaPage() {
  const [goldenId, setGoldenId] = useState<ExportGoldenId>("golden-a");
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<ExportManualQaChecks>(
    DEFAULT_MANUAL_QA_NOT_TESTED,
  );
  const [reportJson, setReportJson] = useState<string | null>(null);

  const def = useMemo(
    () => EXPORT_GOLDEN_PROJECTS.find((g) => g.id === goldenId)!,
    [goldenId],
  );

  const manifest = useMemo(() => {
    const preferred =
      def.format === "both"
        ? format
        : def.format === "mp4"
          ? "mp4"
          : "webm";
    return buildExportGoldenManifest(goldenId, { format: preferred });
  }, [goldenId, format, def.format]);

  const preflight = useMemo(
    () => runExportCapabilityPreflight(manifest),
    [manifest],
  );
  const checkpoints = useMemo(
    () => collectExportParityCheckpoints(manifest),
    [manifest],
  );

  const buildReport = () => {
    const run = createExportDeviceQaReport({
      runId: `dev-${Date.now()}`,
      manifestFingerprint: manifest.fingerprint,
      goldenId,
      evidenceClass: "not-tested",
      browser:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "unknown",
      platform: typeof navigator !== "undefined" ? navigator.platform : undefined,
      format: manifest.output.format,
      width: manifest.output.width,
      height: manifest.output.height,
      projectDurationMs: manifest.project.renderDurationMs,
      wallClockExportMs: 0,
      peakMemoryEstimateBytes: preflight.estimatedCost.estimatedPeakMemoryBytes,
      manualChecks: manual,
      notes:
        notes ||
        "Dev harness semantic report only — real export not executed from this page.",
    });
    setReportJson(serializeExportDeviceQaReport(run));
  };

  const downloadReport = () => {
    if (!reportJson) return;
    const blob = new Blob([reportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-qa-${goldenId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-muted">
        Export Device QA is development-only.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-sm text-foreground">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted">Development</p>
        <h1 className="text-2xl font-semibold">Export Device QA</h1>
        <p className="text-muted">
          Golden fixtures A–G for Sprint 6F. Does not run production exports from
          this page — use semantic preflight + manual checklist, then export from
          the studio with the same project.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] text-muted">Golden project</span>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            value={goldenId}
            onChange={(e) => setGoldenId(e.target.value as ExportGoldenId)}
          >
            {EXPORT_GOLDEN_PROJECTS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id.toUpperCase()} — {g.title}
              </option>
            ))}
          </select>
        </label>

        {def.format === "both" ? (
          <label className="block space-y-1">
            <span className="text-[12px] text-muted">Format</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={format}
              onChange={(e) => setFormat(e.target.value as "webm" | "mp4")}
            >
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
            </select>
          </label>
        ) : (
          <p className="text-muted">Format: {def.format.toUpperCase()}</p>
        )}

        <div className="rounded-md border border-border/60 bg-surface/30 p-3 text-[12px]">
          <p>Fingerprint: {manifest.fingerprint.slice(0, 16)}…</p>
          <p>
            Duration: {manifest.project.renderDurationMs}ms · Scenes:{" "}
            {manifest.scenes.length} · Audio: {manifest.audio.mode}
          </p>
          <p>
            Preflight: {preflight.supported ? "supported" : "blocked"} · Renderer:{" "}
            {preflight.renderer}
          </p>
          <p>Checkpoints: {checkpoints.length}</p>
          <p className="text-muted">{def.features.join(" · ")}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Manual checks</h2>
        {(Object.keys(DEFAULT_MANUAL_QA_NOT_TESTED) as (keyof ExportManualQaChecks)[]).map(
          (key) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span className="text-[12px]">{key}</span>
              <select
                className="rounded border border-border bg-background px-2 py-1 text-[12px]"
                value={manual[key]}
                onChange={(e) =>
                  setManual((prev) => ({
                    ...prev,
                    [key]: e.target.value as ExportManualQaChecks[typeof key],
                  }))
                }
              >
                <option value="not-tested">not-tested</option>
                <option value="pass">pass</option>
                <option value="pass-with-warning">pass-with-warning</option>
                <option value="fail">fail</option>
                <option value="n/a">n/a</option>
              </select>
            </label>
          ),
        )}
        <label className="block space-y-1">
          <span className="text-[12px] text-muted">Notes</span>
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-2 text-[12px] font-medium"
          onClick={buildReport}
        >
          Build QA JSON report
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-2 text-[12px] font-medium disabled:opacity-40"
          disabled={!reportJson}
          onClick={downloadReport}
        >
          Download report
        </button>
      </div>

      {reportJson ? (
        <pre className="max-h-80 overflow-auto rounded-md border border-border/60 bg-surface/20 p-3 text-[11px]">
          {reportJson}
        </pre>
      ) : null}
    </main>
  );
}
