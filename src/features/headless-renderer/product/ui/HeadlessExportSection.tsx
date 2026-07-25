"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StudioStatus } from "@/components/studio-status";
import { prepareExportRequest } from "@/features/export/domain";
import type { ExportAudioMode } from "@/features/export/utils/export-quality.utils";
import type { ExportSettings } from "@/features/export/utils/export-settings.utils";
import type { FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioPrimaryButton,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import {
  HEADLESS_4K_DURATION_COPY,
  HEADLESS_EXPORT_INTRO,
  creatorMessageForClientError,
} from "../client/creator-messages";
import { createHttpHeadlessRenderClient } from "../client/http-headless-render.client";
import type { HeadlessRenderClient } from "../client/headless-render-client.port";
import { HEADLESS_TEST_AUTHORITY_PREFIX } from "../authority/placeholder-production-guard";
import {
  clearActiveJobReference,
  reconcileActiveJobReference,
  writeActiveJobReference,
} from "../persistence/active-job-reference";
import { startBoundedJobPoller } from "../polling/bounded-job-poller";
import {
  evaluateHeadlessOutputCompatibility,
} from "../snapshot/output-compatibility";
import { freezeHeadlessClickAuthority } from "../snapshot/freeze-export-snapshot";
import {
  reduceHeadlessProduct,
  statusLabelForProductState,
} from "../state/product-dispatch.machine";
import {
  createInitialProductModel,
  type HeadlessProductModel,
} from "../state/product-dispatch.types";
import type { OwnedUploadPort } from "../upload/owned-upload.port";
import { HttpOwnedUploadAdapter } from "../upload/http-owned-upload.adapter";
import { prepareOwnedHeadlessUpload } from "../upload/prepare-owned-upload";
import { HEADLESS_TERMINAL_PUBLIC_STATES } from "../client/public-job.types";
import { dispatchOwnedHeadlessJob } from "../orchestration/dispatch-owned-headless-job";
import { HeadlessJobStatusPanel } from "./HeadlessJobStatusPanel";

export interface HeadlessExportSectionProps {
  readonly draftId: string | undefined;
  readonly story?: FootieScript;
  readonly exportSettings?: ExportSettings;
  readonly audioMode?: ExportAudioMode;
  readonly includeBackgroundMusic?: boolean;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly browserBusy: boolean;
  readonly disabled?: boolean;
  /** Injected client for tests/dev; production uses HTTP. */
  readonly client?: HeadlessRenderClient;
  /** Injected owned-upload port; production uses authenticated HTTP + signed R2 PUTs. */
  readonly ownedUploadPort?: OwnedUploadPort;
  /**
   * Testing/dev only. When true, export may mint explicit `test-auth:` markers
   * for the testing-only client/upload adapters.
   * Never set from production ExportPanel. Never inferred from port injection alone.
   */
  readonly allowTestAuthority?: boolean;
  readonly onRendererChange?: (renderer: "browser" | "headless") => void;
}

export function HeadlessExportSection({
  draftId,
  story,
  exportSettings,
  audioMode,
  includeBackgroundMusic,
  contentDurationMs,
  renderDurationMs,
  browserBusy,
  disabled = false,
  client: injectedClient,
  ownedUploadPort: injectedOwnedUploadPort,
  allowTestAuthority = false,
  onRendererChange,
}: HeadlessExportSectionProps) {
  const clientRef = useRef(injectedClient ?? createHttpHeadlessRenderClient());
  const uploadPortRef = useRef(
    injectedOwnedUploadPort ?? new HttpOwnedUploadAdapter(),
  );
  // Explicit opt-in only — future real provider injection must not mint test-auth.
  const useTestAuthority = allowTestAuthority === true;
  const [model, setModel] = useState<HeadlessProductModel>(() =>
    createInitialProductModel("browser"),
  );
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "4k">("1080p");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [preparingOwnedUpload, setPreparingOwnedUpload] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const pollerRef = useRef<ReturnType<typeof startBoundedJobPoller> | null>(null);
  const modelRef = useRef(model);
  const exportAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const stopPoller = () => {
    pollerRef.current?.stop();
    pollerRef.current = null;
  };

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // Intentional remount/injection updates — QA remounts via key; production stays default.
  useEffect(() => {
    clientRef.current = injectedClient ?? createHttpHeadlessRenderClient();
    uploadPortRef.current =
      injectedOwnedUploadPort ?? new HttpOwnedUploadAdapter();
  }, [injectedClient, injectedOwnedUploadPort]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      exportAbortRef.current?.abort();
      stopPoller();
    };
  }, []);

  const dispatch = (event: Parameters<typeof reduceHeadlessProduct>[1]) => {
    if (!mountedRef.current) return;
    setModel((prev) => reduceHeadlessProduct(prev, event));
  };

  const nextRunId = () => {
    runIdRef.current += 1;
    return runIdRef.current;
  };

  const startPolling = (runId: number, jobId: string) => {
    stopPoller();
    pollerRef.current = startBoundedJobPoller({
      runId,
      isCurrentRun: (id) => id === runIdRef.current,
      fetchStatus: async (signal) => {
        const result = await clientRef.current.getJob(jobId, signal);
        if (!result.ok) {
          throw new Error(result.message);
        }
        return result.value;
      },
      isTerminal: (view) =>
        (HEADLESS_TERMINAL_PUBLIC_STATES as readonly string[]).includes(view.state),
      onResult: (view, id) => {
        dispatch({ type: "JOB_VIEW", runId: id, view });
        if (
          (HEADLESS_TERMINAL_PUBLIC_STATES as readonly string[]).includes(view.state) &&
          typeof window !== "undefined"
        ) {
          if (view.state === "cancelled" || view.state === "expired") {
            clearActiveJobReference(window.localStorage);
          }
        }
      },
      onTransientFailure: (message, id) => {
        dispatch({ type: "POLL_TRANSIENT_FAILURE", runId: id, message });
      },
      onTerminalFailure: (message, id) => {
        dispatch({
          type: "CREATE_FAILED",
          runId: id,
          code: "TEMPORARILY_UNAVAILABLE",
          message,
        });
      },
    });
  };

  // Check availability when Headless is selected (not during job recovery).
  useEffect(() => {
    if (model.ctx.renderer !== "headless") return;
    if (model.ctx.jobId) return;
    const runId = nextRunId();
    dispatch({ type: "CHECK_AVAILABILITY", runId });
    const ac = new AbortController();
    void clientRef.current.getAvailability(ac.signal).then((result) => {
      if (runId !== runIdRef.current) return;
      if (modelRef.current.ctx.jobId) return;
      if (result.ok) {
        dispatch({
          type: "AVAILABILITY_RESULT",
          runId,
          availability: result.value,
        });
      } else {
        dispatch({
          type: "AVAILABILITY_FAILED",
          runId,
          code: result.code,
          message: result.message,
        });
      }
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check on renderer select
  }, [model.ctx.renderer]);

  // Refresh recovery
  useEffect(() => {
    if (!draftId?.trim() || typeof window === "undefined") return;
    const ref = reconcileActiveJobReference(window.localStorage, draftId.trim());
    if (!ref) return;
    const runId = nextRunId();
    dispatch({
      type: "RESTORE_JOB",
      runId,
      jobId: ref.jobId,
      snapshot: {
        operationId: ref.operationId,
        idempotencyKey: `restore:${ref.operationId}`,
        draftId: ref.draftId,
        output: ref.output,
        createdAtMs: ref.createdAtMs,
      },
    });
    // Defer UI control sync so restore does not cascade setState inside the effect body.
    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setFormat(ref.output.format);
      setResolution(ref.output.resolution);
      onRendererChange?.("headless");
    });
    startPolling(runId, ref.jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        pollerRef.current?.poke();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const compat720 = useMemo(
    () =>
      evaluateHeadlessOutputCompatibility({
        resolution: "720p",
        format,
        contentDurationMs,
        renderDurationMs,
      }),
    [format, contentDurationMs, renderDurationMs],
  );
  const compat1080 = useMemo(
    () =>
      evaluateHeadlessOutputCompatibility({
        resolution: "1080p",
        format,
        contentDurationMs,
        renderDurationMs,
      }),
    [format, contentDurationMs, renderDurationMs],
  );
  const compat4k = useMemo(
    () =>
      evaluateHeadlessOutputCompatibility({
        resolution: "4k",
        format,
        contentDurationMs,
        renderDurationMs,
      }),
    [format, contentDurationMs, renderDurationMs],
  );

  const activeCompat = evaluateHeadlessOutputCompatibility({
    resolution,
    format,
    contentDurationMs,
    renderDurationMs,
  });

  const headlessSelected = model.ctx.renderer === "headless";
  const unavailable =
    headlessSelected &&
    (model.state === "unavailable" ||
      model.ctx.availability?.canCreateJob === false);
  const busy =
    model.ctx.busy || preparingOwnedUpload || browserBusy || disabled;
  // Policy (1A.1a): disable renderer switching for the complete busy Headless lifecycle.
  const rendererLocked =
    headlessSelected &&
    (model.ctx.busy ||
      (Boolean(model.ctx.jobId) &&
        model.state !== "succeeded" &&
        model.state !== "failed" &&
        model.state !== "cancelled" &&
        model.state !== "expired"));

  const selectRenderer = (renderer: "browser" | "headless") => {
    if (renderer === model.ctx.renderer) return;
    if (renderer === "browser" && rendererLocked) {
      // Do not fire onRendererChange — parent must not diverge.
      return;
    }
    const accepted = reduceHeadlessProduct(model, {
      type: "SELECT_RENDERER",
      renderer,
    });
    if (accepted.ctx.renderer !== renderer) {
      return;
    }
    dispatch({ type: "SELECT_RENDERER", renderer });
    onRendererChange?.(renderer);
  };

  const handleHeadlessExport = async () => {
    if (!draftId?.trim()) return;
    if (!activeCompat.allowed) return;
    if (model.ctx.availability?.canCreateJob !== true) return;

    const runId = nextRunId();
    exportAbortRef.current?.abort();
    const ac = new AbortController();
    exportAbortRef.current = ac;
    setPreparationMessage(null);
    setPreparingOwnedUpload(true);

    let ownedPreparation: Awaited<ReturnType<typeof prepareOwnedHeadlessUpload>> | null =
      null;
    if (!useTestAuthority) {
      try {
        if (story == null || exportSettings == null || audioMode == null) {
          throw new Error("INVALID_SOURCE");
        }
        const prepared = await prepareExportRequest({
          story,
          options: {
            audioMode,
            exportSettings: {
              ...exportSettings,
              resolution:
                resolution === "720p" ? "720x1280" : "1080x1920",
              format,
            },
          },
          includeBackgroundMusic: includeBackgroundMusic === true,
          throwIfBlocked: false,
        });
        ownedPreparation = await prepareOwnedHeadlessUpload({
          prepared,
          projectId: draftId.trim(),
          signal: ac.signal,
        });
      } catch {
        if (runId === runIdRef.current && mountedRef.current) {
          setPreparationMessage(
            ac.signal.aborted
              ? "Server export preparation was cancelled."
              : "Could not prepare media for server export. Try Browser Export or re-add the source media.",
          );
          setPreparingOwnedUpload(false);
        }
        return;
      }
    }
    if (runId !== runIdRef.current || !mountedRef.current || ac.signal.aborted) {
      if (mountedRef.current) setPreparingOwnedUpload(false);
      return;
    }
    setPreparingOwnedUpload(false);

    const manifestFingerprint = useTestAuthority
      ? `${HEADLESS_TEST_AUTHORITY_PREFIX}manifest`
      : ownedPreparation!.manifest.fingerprint;
    const assetBundleFingerprint = useTestAuthority
      ? `${HEADLESS_TEST_AUTHORITY_PREFIX}bundle`
      : ownedPreparation!.bundle.fingerprint;

    const authority = freezeHeadlessClickAuthority({
      draftId: draftId.trim(),
      resolution,
      format,
      manifestFingerprint,
      assetBundleFingerprint,
    });

    dispatch({
      type: "START_EXPORT",
      runId,
      snapshot: {
        operationId: authority.operationId,
        idempotencyKey: authority.idempotencyKey,
        draftId: authority.draftId,
        output: { resolution, format },
        createdAtMs: authority.createdAtMs,
      },
    });
    dispatch({ type: "PREPARE_OK", runId });
    dispatch({ type: "MATERIALIZE_PROGRESS", runId, phase: "uploading" });

    let dispatched;
    try {
      dispatched = await dispatchOwnedHeadlessJob({
        client: clientRef.current,
        uploadPort: uploadPortRef.current,
        signal: ac.signal,
        uploadRequest: {
          operationId: authority.operationId,
          draftId: authority.draftId,
          manifestBytes: useTestAuthority
            ? new Uint8Array([1, 2, 3, 4])
            : ownedPreparation!.manifestBytes,
          assetBundleBytes: useTestAuthority
            ? new Uint8Array([5, 6, 7, 8])
            : ownedPreparation!.bundleBytes,
          manifestFingerprint: authority.manifestFingerprint,
          assetBundleFingerprint: authority.assetBundleFingerprint,
          sourceObjects: ownedPreparation?.sources.map((source) => ({
            slotKey: source.slotKey,
            bytes: source.bytes,
            contentDigest: source.contentDigest,
            mimeType: source.mimeType,
          })),
          rendererProfile: {
            resolution,
            format,
            fps: 30,
            quality: "standard",
          },
          ...(useTestAuthority
            ? { rendererBuildId: "test-authority-phase1a" }
            : {}),
          idempotencyKey: authority.idempotencyKey,
        },
        ...(useTestAuthority
          ? {
              createBody: {
                version: 1 as const,
                ownership: {
                  ownerId: `${HEADLESS_TEST_AUTHORITY_PREFIX}owner`,
                  projectId: authority.draftId,
                },
                rendererProfile: {
                  resolution,
                  format,
                  fps: 30 as const,
                  quality: "standard" as const,
                },
                rendererBuildId: "test-authority-phase1a",
                idempotencyKey: authority.idempotencyKey,
                requestFingerprint: authority.idempotencyKey,
              },
            }
          : {}),
      });
    } catch {
      if (runId !== runIdRef.current || !mountedRef.current) return;
      dispatch({
        type: "CREATE_FAILED",
        runId,
        code: "CREATE_REJECTED",
        message: creatorMessageForClientError("CREATE_REJECTED"),
      });
      return;
    }

    if (runId !== runIdRef.current || !mountedRef.current) return;

    if (!dispatched.ok && dispatched.stage === "upload") {
      dispatch({
        type: "UPLOAD_FAILED",
        runId,
        message: dispatched.failure.message,
      });
      return;
    }

    dispatch({ type: "UPLOAD_OK", runId });
    if (!dispatched.ok) {
      dispatch({
        type: "CREATE_FAILED",
        runId,
        code: dispatched.failure.code,
        message: dispatched.failure.message,
      });
      return;
    }

    dispatch({
      type: "CREATE_OK",
      runId,
      jobId: dispatched.job.jobId,
      view: dispatched.job.view,
    });

    if (typeof window !== "undefined") {
      writeActiveJobReference(window.localStorage, {
        version: 1,
        draftId: authority.draftId,
        jobId: dispatched.job.jobId,
        createdAtMs: authority.createdAtMs,
        operationId: authority.operationId,
        output: { resolution, format },
      });
    }

    startPolling(runId, dispatched.job.jobId);
  };

  const handleCancel = async () => {
    const runId = modelRef.current.ctx.runId;
    const jobId = modelRef.current.ctx.jobId;
    exportAbortRef.current?.abort();
    dispatch({ type: "REQUEST_CANCEL", runId });
    if (!jobId) {
      // Invalidate late upload/create results from this pre-job operation.
      nextRunId();
      stopPoller();
      return;
    }
    const result = await clientRef.current.cancelJob(jobId);
    if (runId !== runIdRef.current || !mountedRef.current) return;
    if (result.ok) {
      dispatch({ type: "CANCEL_OK", runId, view: result.value });
      if (typeof window !== "undefined") {
        clearActiveJobReference(window.localStorage);
      }
      stopPoller();
    } else {
      dispatch({ type: "CANCEL_FAILED", runId, message: result.message });
    }
  };

  const handleDownload = async () => {
    const jobId = modelRef.current.ctx.jobId;
    if (!jobId) return;
    setDownloadBusy(true);
    try {
      const result = await clientRef.current.createDownloadCapability(jobId);
      if (!result.ok) return;
      if (result.value.expiresAtMs < Date.now()) return;
      const a = document.createElement("a");
      a.href = result.value.url;
      a.download = result.value.filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (result.value.url.startsWith("blob:")) {
        setTimeout(() => URL.revokeObjectURL(result.value.url), 2_000);
      }
    } finally {
      if (mountedRef.current) setDownloadBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-border/20 pt-5">
      <div>
        <p className={`${studioFieldLabel} mb-0`}>Headless export</p>
        <p className={`${studioSubtleText} mt-1`}>{HEADLESS_EXPORT_INTRO}</p>
      </div>

      <div
        className={studioSegmentedControl}
        role="radiogroup"
        aria-label="Renderer"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!headlessSelected}
          disabled={rendererLocked}
          title={
            rendererLocked
              ? "Finish or cancel the current server export before switching to Browser."
              : "Browser export"
          }
          onClick={() => selectRenderer("browser")}
          className={!headlessSelected ? studioSegmentActive : studioSegment}
        >
          Browser
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={headlessSelected}
          disabled={browserBusy || (headlessSelected && rendererLocked)}
          onClick={() => selectRenderer("headless")}
          className={headlessSelected ? studioSegmentActive : studioSegment}
        >
          Headless
        </button>
      </div>

      {headlessSelected ? (
        <>
          {model.state === "checking_availability" ? (
            <StudioStatus
              variant="loading"
              layout="inline"
              description="Checking server export…"
            />
          ) : null}

          {unavailable ? (
            <StudioStatus
              variant="warning"
              layout="inline"
              description={
                model.ctx.safeMessage ??
                "Server rendering is not configured yet. You can continue with Browser Export."
              }
            />
          ) : null}

          {preparingOwnedUpload ? (
            <StudioStatus
              variant="loading"
              layout="inline"
              description="Preparing media for secure server upload…"
            />
          ) : preparationMessage ? (
            <StudioStatus
              variant="warning"
              layout="inline"
              description={preparationMessage}
            />
          ) : null}

          <div>
            <p className={studioFieldLabel}>Format</p>
            <div
              className={`${studioSegmentedControl} mt-1.5`}
              role="radiogroup"
              aria-label="Headless format"
            >
              <button
                type="button"
                role="radio"
                aria-checked={format === "webm"}
                disabled={busy}
                onClick={() => setFormat("webm")}
                className={format === "webm" ? studioSegmentActive : studioSegment}
              >
                WebM
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={format === "mp4"}
                disabled={busy}
                onClick={() => setFormat("mp4")}
                className={format === "mp4" ? studioSegmentActive : studioSegment}
              >
                MP4
              </button>
            </div>
          </div>

          <div>
            <p className={studioFieldLabel}>Resolution</p>
            <div
              className={`${studioSegmentedControl} mt-1.5`}
              role="radiogroup"
              aria-label="Headless resolution"
            >
              {(
                [
                  ["720p", compat720],
                  ["1080p", compat1080],
                  ["4k", compat4k],
                ] as const
              ).map(([value, compat]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={resolution === value}
                  disabled={busy || !compat.allowed}
                  title={compat.reason ?? value}
                  onClick={() => setResolution(value)}
                  className={
                    resolution === value ? studioSegmentActive : studioSegment
                  }
                >
                  {value === "4k" ? "4K" : value}
                </button>
              ))}
            </div>
            {!compat4k.allowed ? (
              <p className={`${studioSubtleText} mt-1.5`}>{HEADLESS_4K_DURATION_COPY}</p>
            ) : null}
            {activeCompat.reason && resolution !== "4k" ? (
              <p className={`${studioSubtleText} mt-1.5`}>{activeCompat.reason}</p>
            ) : null}
          </div>

          <HeadlessJobStatusPanel
            model={model}
            onCancel={() => void handleCancel()}
            onDownload={() => void handleDownload()}
            downloadBusy={downloadBusy}
          />

          {model.state === "idle" ||
          model.state === "unavailable" ||
          model.state === "failed" ||
          model.state === "cancelled" ||
          model.state === "expired" ||
          model.state === "succeeded" ? (
            <button
              type="button"
              className={`${studioPrimaryButton} w-full`}
              disabled={
                busy ||
                unavailable ||
                !activeCompat.allowed ||
                !draftId?.trim() ||
                model.state === "succeeded"
              }
              aria-busy={model.ctx.busy}
              onClick={() => void handleHeadlessExport()}
              title={
                !draftId?.trim()
                  ? "Save this draft before server export."
                  : unavailable
                    ? "Server rendering is not configured yet."
                    : activeCompat.reason ?? "Start server export"
              }
            >
              {preparingOwnedUpload
                ? "Preparing media…"
                : model.ctx.busy
                  ? statusLabelForProductState(model.state)
                : model.state === "succeeded"
                  ? "Export complete"
                  : "Export with Headless"}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
