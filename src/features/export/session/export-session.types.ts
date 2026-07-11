/**
 * Lightweight ExportSession — stores user selections only (Sprint 6F.1).
 * Never stores ExportManifest. Every export builds a fresh manifest.
 */

import type {
  ExportFormat,
  ExportQualityTier,
  ExportResolution,
  ExportSettings,
} from "@/features/story/types";

export type ExportSessionStatus =
  | "idle"
  | "configuring"
  | "exporting"
  | "completed"
  | "failed"
  | "cancelled";

export type ExportSessionView = "configuration" | "result";

export type ExportSessionRenderer = "browser" | "server" | "blocked";

/** User-facing export options — not a frozen manifest. */
export interface ExportSessionOptions {
  readonly format: ExportFormat;
  readonly resolution: ExportResolution;
  readonly quality: ExportQualityTier;
  readonly fileName: string;
  readonly includeNarration: boolean;
  readonly includeBackgroundMusic: boolean;
  readonly exportProfileId?: string;
}

export interface ExportSessionArtifact {
  readonly blob: Blob;
  readonly fileName: string;
  readonly mimeType?: string;
}

export interface ExportSession {
  readonly currentOptions: ExportSessionOptions;
  readonly lastSuccessfulOptions: ExportSessionOptions | null;
  readonly lastArtifact: ExportSessionArtifact | null;
  readonly lastManifestFingerprint: string | null;
  readonly lastRenderer: ExportSessionRenderer | null;
  readonly status: ExportSessionStatus;
  readonly view: ExportSessionView;
}

export function exportSettingsToSessionOptions(
  settings: ExportSettings,
  audio: {
    readonly includeNarration: boolean;
    readonly includeBackgroundMusic: boolean;
  },
): ExportSessionOptions {
  return {
    format: settings.format,
    resolution: settings.resolution,
    quality: settings.quality,
    fileName: settings.fileName,
    includeNarration: audio.includeNarration,
    includeBackgroundMusic: audio.includeBackgroundMusic,
    ...(settings.exportProfileId
      ? { exportProfileId: settings.exportProfileId }
      : {}),
  };
}

export function sessionOptionsToExportSettings(
  options: ExportSessionOptions,
): ExportSettings {
  return {
    format: options.format,
    resolution: options.resolution,
    quality: options.quality,
    fileName: options.fileName,
    ...(options.exportProfileId
      ? { exportProfileId: options.exportProfileId as ExportSettings["exportProfileId"] }
      : {}),
  };
}

export function createExportSession(
  options: ExportSessionOptions,
): ExportSession {
  return {
    currentOptions: options,
    lastSuccessfulOptions: null,
    lastArtifact: null,
    lastManifestFingerprint: null,
    lastRenderer: null,
    status: "idle",
    view: "configuration",
  };
}

export function updateExportSessionOptions(
  session: ExportSession,
  options: ExportSessionOptions,
): ExportSession {
  return {
    ...session,
    currentOptions: options,
    status: session.status === "exporting" ? session.status : "configuring",
  };
}

export function beginExportSessionAttempt(
  session: ExportSession,
): ExportSession {
  return {
    ...session,
    status: "exporting",
    view: "configuration",
  };
}

export function completeExportSession(
  session: ExportSession,
  input: {
    readonly options: ExportSessionOptions;
    readonly artifact: ExportSessionArtifact;
    readonly manifestFingerprint: string;
    readonly renderer: ExportSessionRenderer;
  },
): ExportSession {
  return {
    ...session,
    currentOptions: input.options,
    lastSuccessfulOptions: input.options,
    lastArtifact: input.artifact,
    lastManifestFingerprint: input.manifestFingerprint,
    lastRenderer: input.renderer,
    status: "completed",
    view: "result",
  };
}

export function failExportSession(session: ExportSession): ExportSession {
  return {
    ...session,
    status: "failed",
    view: "result",
  };
}

export function cancelExportSession(session: ExportSession): ExportSession {
  return {
    ...session,
    status: "cancelled",
    view: "result",
  };
}

/** Return to configuration without clearing lastSuccessfulOptions / defaults. */
export function openExportSessionConfiguration(
  session: ExportSession,
): ExportSession {
  return {
    ...session,
    view: "configuration",
    status:
      session.status === "completed" ||
      session.status === "failed" ||
      session.status === "cancelled"
        ? "configuring"
        : session.status,
  };
}

/** Close result screen — keep options as defaults. */
export function closeExportSessionResult(session: ExportSession): ExportSession {
  return {
    ...session,
    view: "configuration",
    status: "idle",
  };
}

/**
 * Options for "Export Again" — prefer last successful, else current.
 * Caller must still build a fresh ExportManifest.
 */
export function resolveExportAgainOptions(
  session: ExportSession,
): ExportSessionOptions {
  return session.lastSuccessfulOptions ?? session.currentOptions;
}
