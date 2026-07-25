/**
 * Materialize verified owned asset bytes into the worker workspace.
 * No HTTP(S)/data:/blob:/local-path fetch authority.
 * Cancellation-aware: shared AbortSignal checked around each open/write.
 */

import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { existsSync } from "node:fs";

import type { HeadlessAssetBundleV1, HeadlessSourceIdentity } from "../../domain";
import { headlessSourceSlotKey } from "../../domain";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import type { JobDeadlineAbortKind } from "../runtime/job-deadline";
import type { ProviderBackedBoundaryTelemetryPort } from "../runtime/provider-backed-boundary-telemetry";
import type { SourceBindingAttributionSnapshot } from "../runtime/source-binding-resolution";
import {
  buildAggregateSourceBindingSuccessSnapshot,
  consumeSourceBindingAttributionFromStorage,
} from "../runtime/source-binding-resolution";
import type { HeadlessWorkerWorkspace } from "./workspace";
import type { WorkspaceByteBudget } from "./workspace-quota";

export interface StagedWorkerAsset {
  readonly assetId: string;
  readonly sourceIdentity: HeadlessSourceIdentity;
  readonly sourceDigest: string;
  readonly slotKey: string;
  readonly mimeType: string;
  readonly absolutePath: string;
  readonly relativeUrlPath: string;
  readonly byteLength: number;
}

export type MaterializeFailureReasonId =
  | "WORKSPACE_QUOTA_EXCEEDED"
  | "CANCELLED_BY_USER"
  | "WORKER_TIMEOUT"
  | "WORKER_FAILED";

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
      return ".m4a";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    case "audio/webm":
      return ".weba";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    default:
      return ".bin";
  }
}

function safeAssetFileName(
  assetId: string,
  sourceDigest: string,
  mime: string,
): string {
  const digestTail = sourceDigest.replace(/^[^:]+:/, "").slice(0, 16);
  const id = assetId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `${id}_${digestTail}${extensionForMime(mime)}`;
}

function abortReasonId(
  kind: JobDeadlineAbortKind | null | undefined,
  signal?: AbortSignal,
): "CANCELLED_BY_USER" | "WORKER_TIMEOUT" | null {
  if (kind === "timeout") return "WORKER_TIMEOUT";
  if (kind === "cancelled") return "CANCELLED_BY_USER";
  if (signal?.aborted) return "CANCELLED_BY_USER";
  return null;
}

export async function materializeOwnedAssets(input: {
  storage: HeadlessStoragePort;
  ownerId: string;
  bundle: HeadlessAssetBundleV1;
  workspace: HeadlessWorkerWorkspace;
  nowMs: number;
  maxTotalAssetBytes: number;
  budget?: WorkspaceByteBudget;
  signal?: AbortSignal;
  /** Shared deadline abort kind resolver (timeout vs cancel). */
  abortKind?: () => JobDeadlineAbortKind;
  boundaryTelemetry?: ProviderBackedBoundaryTelemetryPort;
  /** Reserved page artifact paths — collision detection only. */
  reservedPagePaths?: readonly string[];
}): Promise<
  | {
      readonly ok: true;
      readonly assets: readonly StagedWorkerAsset[];
      readonly sourceBindingAttribution: SourceBindingAttributionSnapshot;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly reasonId: MaterializeFailureReasonId;
      readonly sourceBindingAttribution?: SourceBindingAttributionSnapshot;
    }
> {
  const staged: StagedWorkerAsset[] = [];
  let total = 0;
  const reserved = input.reservedPagePaths ?? [];
  const reservedPathsIntact = (): boolean => {
    for (const name of reserved) {
      try {
        const path = input.workspace.resolveSafePath(name);
        if (existsSync(path)) return false;
      } catch {
        return false;
      }
    }
    return true;
  };
  if (!reservedPathsIntact()) {
    return {
      ok: false,
      message: "Reserved page path collision before materialization.",
      reasonId: "WORKER_FAILED",
    };
  }

  const checkAbort = (): MaterializeFailureReasonId | null =>
    abortReasonId(input.abortKind?.() ?? null, input.signal);

  const early = checkAbort();
  if (early) {
    return { ok: false, message: "Materialization aborted.", reasonId: early };
  }

  for (const asset of input.bundle.assets) {
    const beforeOpen = checkAbort();
    if (beforeOpen) {
      return {
        ok: false,
        message: "Materialization aborted before open.",
        reasonId: beforeOpen,
      };
    }

    const opened = await input.storage.openOwnedObject(
      asset.storageLocator,
      input.ownerId,
      input.nowMs,
      { signal: input.signal },
    );

    const afterOpen = checkAbort();
    if (afterOpen) {
      return {
        ok: false,
        message: "Materialization aborted after open.",
        reasonId: afterOpen,
      };
    }

    if (!opened.ok) {
      const aborted = opened.issues.some((i) => i.code === "OPERATION_ABORTED");
      if (aborted) {
        return {
          ok: false,
          message: "Materialization aborted during open.",
          reasonId: abortReasonId(input.abortKind?.() ?? null, input.signal) ??
            "CANCELLED_BY_USER",
        };
      }
      const sourceBindingAttribution =
        consumeSourceBindingAttributionFromStorage(input.storage) ?? undefined;
      return {
        ok: false,
        message: "Owned asset missing.",
        reasonId: "WORKER_FAILED",
        ...(sourceBindingAttribution != null
          ? { sourceBindingAttribution }
          : {}),
      };
    }

    const actualDigest = `sha256:${createHash("sha256")
      .update(opened.value.bytes)
      .digest("hex")}`;
    if (actualDigest !== asset.contentDigest) {
      return {
        ok: false,
        message: "Asset digest mismatch.",
        reasonId: "WORKER_FAILED",
      };
    }

    const afterDigest = checkAbort();
    if (afterDigest) {
      return {
        ok: false,
        message: "Materialization aborted after digest.",
        reasonId: afterDigest,
      };
    }

    total += opened.value.bytes.byteLength;
    if (total > input.maxTotalAssetBytes) {
      return {
        ok: false,
        message: "Staged asset bytes exceed worker limit.",
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
      };
    }

    let reservationId: string | null = null;
    if (input.budget) {
      const quota = input.budget.reserve(
        opened.value.bytes.byteLength,
        "workspace",
      );
      if (!quota.ok) {
        return {
          ok: false,
          message: quota.message,
          reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        };
      }
      reservationId = quota.reservationId;
    }

    const afterReserve = checkAbort();
    if (afterReserve) {
      if (reservationId && input.budget) input.budget.release(reservationId);
      return {
        ok: false,
        message: "Materialization aborted after reserve.",
        reasonId: afterReserve,
      };
    }

    const fileName = safeAssetFileName(
      asset.assetId,
      asset.sourceIdentity.sourceDigest,
      asset.mimeType,
    );
    if (fileName.includes("..") || basename(fileName) !== fileName) {
      if (reservationId && input.budget) input.budget.release(reservationId);
      return {
        ok: false,
        message: "Unsafe staged asset filename.",
        reasonId: "WORKER_FAILED",
      };
    }
    if (
      reserved.some(
        (r) => r === fileName || r === `assets/${fileName}`,
      )
    ) {
      if (reservationId && input.budget) input.budget.release(reservationId);
      return {
        ok: false,
        message: "Reserved page path collision.",
        reasonId: "WORKER_FAILED",
      };
    }
    void extname(fileName);

    const slotKey = headlessSourceSlotKey(asset.sourceIdentity);
    try {
      const abs = input.workspace.writeFileSafe(
        `assets/${fileName}`,
        opened.value.bytes,
      );
      const afterWrite = checkAbort();
      if (afterWrite) {
        if (reservationId && input.budget) input.budget.release(reservationId);
        return {
          ok: false,
          message: "Materialization aborted after write.",
          reasonId: afterWrite,
        };
      }
      if (reservationId && input.budget) {
        input.budget.commit(reservationId, opened.value.bytes.byteLength);
      }
      staged.push({
        assetId: asset.assetId,
        sourceIdentity: asset.sourceIdentity,
        sourceDigest: asset.sourceIdentity.sourceDigest,
        slotKey,
        mimeType: asset.mimeType,
        absolutePath: abs,
        relativeUrlPath: `assets/${fileName}`,
        byteLength: opened.value.bytes.byteLength,
      });
      if (!reservedPathsIntact()) {
        if (reservationId && input.budget) input.budget.release(reservationId);
        return {
          ok: false,
          message: "Reserved page path overwritten during materialization.",
          reasonId: "WORKER_FAILED",
        };
      }
    } catch {
      if (reservationId && input.budget) input.budget.release(reservationId);
      return {
        ok: false,
        message: "Failed to stage owned asset.",
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
      };
    }
  }

  const finalAbort = checkAbort();
  if (finalAbort) {
    return {
      ok: false,
      message: "Materialization aborted before complete.",
      reasonId: finalAbort,
    };
  }

  return {
    ok: true,
    assets: staged,
    sourceBindingAttribution: buildAggregateSourceBindingSuccessSnapshot({
      resolvedAssetCount: staged.length,
      allowlistedCount: input.bundle.assets.length,
    }),
  };
}
