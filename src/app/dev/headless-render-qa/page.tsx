"use client";

/**
 * Dev-only Headless product dispatch QA harness (Sprint 11E Phase 1A).
 * Injects FakeHeadlessRenderClient + FakeOwnedUploadAdapter only.
 * Not production authority — remount via key when harness mode resets.
 */

import { useMemo, useState } from "react";

import { HeadlessExportSection } from "@/features/headless-renderer/product/ui/HeadlessExportSection";
import { PRODUCTION_HEADLESS_UNAVAILABLE } from "@/features/headless-renderer/product/availability/availability.types";
import { evaluateHeadlessOutputCompatibility } from "@/features/headless-renderer/product/snapshot/output-compatibility";
import { FakeHeadlessRenderClient } from "@/features/headless-renderer/product/testing/fake-headless-render.client";
import { FakeOwnedUploadAdapter } from "@/features/headless-renderer/product/testing/fake-owned-upload.adapter";
import {
  studioFieldLabel,
  studioPanel,
  studioPrimaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

type HarnessMode = "available" | "unavailable" | "malformed";

function createHarnessClient(mode: HarnessMode): FakeHeadlessRenderClient {
  if (mode === "unavailable") {
    return new FakeHeadlessRenderClient({
      availability: PRODUCTION_HEADLESS_UNAVAILABLE,
      autoAdvance: false,
    });
  }
  if (mode === "malformed") {
    return new FakeHeadlessRenderClient({
      malformedViews: true,
      autoAdvance: false,
    });
  }
  // Slower advance so Cancel / Force-fail remain reachable in the harness UI.
  return new FakeHeadlessRenderClient({ autoAdvance: true, advanceStepMs: 800 });
}

export default function HeadlessRenderQaPage() {
  const [mode, setMode] = useState<HarnessMode>("available");
  const [contentSec, setContentSec] = useState(4);
  const [draftId] = useState("dev-headless-qa-draft");
  const [harnessEpoch, setHarnessEpoch] = useState(0);
  const [client, setClient] = useState(() => createHarnessClient("available"));
  const [uploadPort, setUploadPort] = useState(() => new FakeOwnedUploadAdapter());

  const contentDurationMs = Math.round(contentSec * 1000);
  const renderDurationMs = contentDurationMs + 400;

  const compat4k = useMemo(
    () =>
      evaluateHeadlessOutputCompatibility({
        resolution: "4k",
        format: "webm",
        contentDurationMs,
        renderDurationMs,
      }),
    [contentDurationMs, renderDurationMs],
  );

  const resetHarness = (nextMode: HarnessMode = mode) => {
    setMode(nextMode);
    setClient(createHarnessClient(nextMode));
    setUploadPort(new FakeOwnedUploadAdapter());
    setHarnessEpoch((k) => k + 1);
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Headless Render QA</h1>
        <p className={studioSubtleText}>
          Dev harness only. Fake client + fake owned upload — not production
          headless authority. Remounts when mode/client reset (explicit key).
        </p>
      </header>

      <section className={`${studioPanel} space-y-3`}>
        <label className={studioFieldLabel} htmlFor="harness-mode">
          Capability mode
        </label>
        <select
          id="harness-mode"
          className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm"
          value={mode}
          onChange={(e) => resetHarness(e.target.value as HarnessMode)}
        >
          <option value="available">Available (upload → create → lifecycle)</option>
          <option value="unavailable">Unavailable (production-like)</option>
          <option value="malformed">Malformed responses</option>
        </select>

        <label className={studioFieldLabel} htmlFor="content-sec">
          Content duration (seconds)
        </label>
        <input
          id="content-sec"
          type="number"
          min={1}
          max={40}
          step={1}
          value={contentSec}
          onChange={(e) => setContentSec(Number(e.target.value) || 1)}
          className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm"
        />
        <p className={studioSubtleText}>
          4K allowed: {compat4k.allowed ? "yes" : "no"}
          {compat4k.reason ? ` — ${compat4k.reason}` : ""}
        </p>

        <p className={studioSubtleText}>
          Available mode: Export with Headless → owned upload → createJob →
          queued/rendering/encoding/validating/succeeded → Download. Use Cancel
          while active; force a failed job via client tools is not exposed —
          Retry after an eligible failure is covered by verification. Refresh
          recovery uses the safe local job reference for this draft id.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={studioPrimaryButton}
            onClick={() => resetHarness(mode)}
          >
            Reset fake client (remount)
          </button>
          {mode === "available" ? (
            <button
              type="button"
              className={studioPrimaryButton}
              onClick={() => {
                const jobId = client.latestJobId();
                if (jobId) client.forceState(jobId, "failed");
              }}
            >
              Force fail latest job (retry QA)
            </button>
          ) : null}
        </div>
      </section>

      <HeadlessExportSection
        key={`${mode}-${harnessEpoch}`}
        draftId={draftId}
        contentDurationMs={contentDurationMs}
        renderDurationMs={renderDurationMs}
        browserBusy={false}
        client={client}
        ownedUploadPort={uploadPort}
        allowTestAuthority
      />
    </main>
  );
}
