"use client";

import { useEffect, useRef } from "react";

import { StudioStatus } from "@/components/studio-status";
import {
  studioGhostButton,
  studioPrimaryButton,
  studioSecondaryButton,
} from "@/lib/utils/studioUi";
import {
  classifyHeadlessMissingFrameTelemetry,
  HEADLESS_RENDERING_FRAME_TELEMETRY_UNAVAILABLE_MESSAGE,
} from "@/features/headless-renderer/domain/headless-export-progress-authority";

import { creatorMessageForReasonId } from "../client/creator-messages";
import {
  statusDescriptionForProductState,
  statusLabelForProductState,
} from "../state/product-dispatch.machine";
import type { HeadlessProductModel } from "../state/product-dispatch.types";

export interface HeadlessJobStatusPanelProps {
  readonly model: HeadlessProductModel;
  readonly onCancel: () => void;
  readonly onRetry?: () => void;
  readonly onDownload: () => void;
  readonly downloadBusy?: boolean;
}

export function HeadlessJobStatusPanel({
  model,
  onCancel,
  onRetry,
  onDownload,
  downloadBusy = false,
}: HeadlessJobStatusPanelProps) {
  const focusRef = useRef<HTMLDivElement>(null);
  const state = model.state;
  const label = statusLabelForProductState(state);
  const percent = model.ctx.advisoryPercent;
  const completedFrames = model.ctx.advisoryCompletedFrames;
  const totalFrames = model.ctx.advisoryTotalFrames;
  const showFrameProgress =
    state === "rendering" &&
    completedFrames != null &&
    totalFrames != null &&
    totalFrames > 0 &&
    completedFrames >= 0 &&
    completedFrames <= totalFrames;
  const frameProgressLabel = showFrameProgress
    ? `Rendering frame ${completedFrames.toLocaleString()} of ${totalFrames.toLocaleString()}`
    : null;
  const missingFrameTelemetryClass = classifyHeadlessMissingFrameTelemetry({
    state,
    completedFrames,
    totalFrames,
    pollsWithoutFrameTelemetry: model.ctx.renderingPollsWithoutFrameTelemetry,
  });
  const renderingStatusDescription = statusDescriptionForProductState("rendering");
  const renderingTelemetryUnavailable =
    missingFrameTelemetryClass === "missing_after_bounded_polls";

  const isTerminalSuccess = state === "succeeded";
  const isTerminalError =
    state === "failed" || state === "expired" || state === "cancelled";
  const reasonMessage = isTerminalError
    ? model.ctx.safeMessage ??
      creatorMessageForReasonId(model.ctx.jobView?.terminalReason?.reasonId)
    : null;
  const activeMessage =
    !isTerminalError && !isTerminalSuccess
      ? showFrameProgress
        ? frameProgressLabel
        : state === "rendering"
          ? renderingTelemetryUnavailable
            ? HEADLESS_RENDERING_FRAME_TELEMETRY_UNAVAILABLE_MESSAGE
            : renderingStatusDescription
          : model.ctx.safeMessage ?? statusDescriptionForProductState(state)
      : null;
  const announcedMessage = isTerminalSuccess
    ? statusDescriptionForProductState(state)
    : isTerminalError
      ? reasonMessage
      : showFrameProgress
        ? frameProgressLabel
        : activeMessage != null
          ? activeMessage
          : label;
  const isCancelling = state === "cancelling";
  const canCancel =
    Boolean(model.ctx.jobId) &&
    (isCancelling ||
      (model.ctx.busy &&
        state !== "succeeded" &&
        state !== "failed" &&
        state !== "cancelled" &&
        state !== "expired"));
  const canRetry =
    onRetry != null &&
    (state === "failed" || state === "expired") &&
    model.ctx.jobView?.terminalReason?.retryable !== false;
  const canDownload =
    state === "succeeded" && model.ctx.jobView?.artifactAvailable === true;

  useEffect(() => {
    if (isTerminalSuccess || isTerminalError) {
      focusRef.current?.focus();
    }
  }, [isTerminalSuccess, isTerminalError, state]);

  if (state === "idle" || state === "unavailable" || state === "checking_availability") {
    return null;
  }

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-border/30 bg-surface/40 p-4 outline-none"
      aria-labelledby="headless-job-status-label"
      data-headless-frame-telemetry={missingFrameTelemetryClass}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          id="headless-job-status-label"
          className="text-sm font-medium text-foreground/90"
        >
          {label}
        </p>
        {percent != null && model.ctx.busy ? (
          <span className="text-xs text-muted" aria-hidden="true">
            {Math.round(percent)}%
          </span>
        ) : null}
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcedMessage}
      </div>

      {model.ctx.busy && percent != null ? (
        <div
          className="h-1 overflow-hidden rounded-full bg-surface-elevated"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label="Export progress"
        >
          <div
            className="h-full rounded-full bg-accent/70 transition-all duration-300"
            style={{ width: `${Math.round(percent)}%` }}
          />
        </div>
      ) : null}

      {isTerminalSuccess ? (
        <StudioStatus
          variant="success"
          layout="inline"
          description={statusDescriptionForProductState(state) ?? "Export complete."}
        />
      ) : null}

      {isTerminalError && reasonMessage ? (
        <StudioStatus
          variant={state === "cancelled" ? "warning" : "error"}
          layout="inline"
          description={reasonMessage}
        />
      ) : null}

      {!isTerminalSuccess && !isTerminalError && activeMessage ? (
        <p className="text-xs text-muted">{activeMessage}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canCancel ? (
          <button
            type="button"
            className={studioGhostButton}
            onClick={onCancel}
            aria-busy={isCancelling}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            className={studioSecondaryButton}
            onClick={onRetry}
            disabled={model.ctx.busy}
          >
            Retry
          </button>
        ) : null}
        {canDownload ? (
          <button
            type="button"
            className={studioPrimaryButton}
            onClick={onDownload}
            aria-busy={downloadBusy}
            disabled={downloadBusy}
          >
            {downloadBusy ? "Preparing download…" : "Download"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
