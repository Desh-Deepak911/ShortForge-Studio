/**
 * Private Chromium page entry — bundled by esbuild for the worker only.
 * Exposes window.__SHORTFORGE_HEADLESS_RENDER_FRAME__ driven by frame time.
 */

import { prepareExportFrame } from "@/features/export/runtime/prepare-export-frame";
import { drawPreparedExportFrame } from "@/features/export/runtime/draw-prepared-export-frame";
import {
  prepareExportFromManifest,
  type ExportRenderPlan,
} from "@/features/export/runtime/prepare-export-from-manifest";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import { preloadExportManifestMedia } from "@/features/export/utils/export-media-cache.utils";
import { resolveExportFrameTimestampMs } from "@/features/export/timing";
import type { ExportManifest } from "@/features/export/domain/headless-safe";
import { validateExportManifest } from "@/features/export/domain/headless-safe";

import {
  HEADLESS_PAGE_CONTRACT_VERSION,
} from "./page-contract";
import {
  mapBootstrapInternalFailureToRejectionReason,
  mapExportManifestIssueCodeToBootstrapRejection,
  type HeadlessPageBootstrapRejectionReasonId,
} from "./page-bootstrap-rejection";
import { createHeadlessPageRenderContext } from "./create-page-render-context";
import { isExportManifestV3, isExportManifestV4 } from "@/features/export/domain/headless-safe";

export interface HeadlessPageBootstrapConfig {
  readonly manifest: ExportManifest;
  /** Canonical headless pixel target — may elevate above frozen manifest output. */
  readonly targetWidth: number;
  readonly targetHeight: number;
}

export type HeadlessPageBootstrapResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessPageBootstrapRejectionReasonId;
    };

interface HeadlessPageGlobals {
  __SHORTFORGE_HEADLESS_BOOTSTRAP__?: (
    config: HeadlessPageBootstrapConfig,
  ) => Promise<HeadlessPageBootstrapResult>;
  __SHORTFORGE_HEADLESS_RENDER_FRAME__?: (input: {
    frameIndex: number;
    timestampMs: number;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  __SHORTFORGE_HEADLESS_GET_PNG__?: () => string;
  __SHORTFORGE_HEADLESS_PAGE_CONTRACT_VERSION__?: string;
}

type PageWindow = Window & HeadlessPageGlobals;

let plan: ExportRenderPlan | null = null;
let context: ExportRenderContext | null = null;
let manifestRef: ExportManifest | null = null;

async function bootstrap(
  config: HeadlessPageBootstrapConfig,
): Promise<HeadlessPageBootstrapResult> {
  try {
    if (
      !Number.isSafeInteger(config.targetWidth) ||
      !Number.isSafeInteger(config.targetHeight) ||
      config.targetWidth < 2 ||
      config.targetHeight < 2
    ) {
      return {
        ok: false,
        reasonId: mapBootstrapInternalFailureToRejectionReason({
          invalidTarget: true,
        }),
      };
    }
    manifestRef = config.manifest;
    if (
      (isExportManifestV3(config.manifest) || isExportManifestV4(config.manifest)) &&
      config.manifest.rendererContractVersion !== HEADLESS_PAGE_CONTRACT_VERSION
    ) {
      return {
        ok: false,
        reasonId: mapBootstrapInternalFailureToRejectionReason({
          contractVersionMismatch: true,
        }),
      };
    }
    const manifestValidation = validateExportManifest(config.manifest);
    if (!manifestValidation.ok) {
      const code = manifestValidation.issues[0]?.code ?? "INVALID_MANIFEST";
      return {
        ok: false,
        reasonId: mapExportManifestIssueCodeToBootstrapRejection(code),
      };
    }
    plan = prepareExportFromManifest(config.manifest);
    context = createHeadlessPageRenderContext(config.manifest, {
      width: config.targetWidth,
      height: config.targetHeight,
    });
    await preloadExportManifestMedia(
      config.manifest.scenes,
      context.mediaCache,
    );
    const failed = context.mediaCache.diagnostics.filter((d) => d.status === "error");
    if (failed.length > 0) {
      return {
        ok: false,
        reasonId: mapBootstrapInternalFailureToRejectionReason({
          mediaPreloadFailed: true,
        }),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reasonId: "bootstrap_runtime_exception" };
  }
}

async function renderFrame(input: {
  frameIndex: number;
  timestampMs: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (!plan || !context || !manifestRef) {
      return { ok: false, message: "Page not bootstrapped." };
    }
    const expected = resolveExportFrameTimestampMs(
      input.frameIndex,
      manifestRef.output.fps,
    );
    if (expected !== input.timestampMs) {
      return {
        ok: false,
        message: "Frame timestamp does not match deterministic plan.",
      };
    }
    context.cancellation.throwIfCancelled();
    const prepared = await prepareExportFrame(
      manifestRef,
      plan,
      input.frameIndex,
      context,
    );
    drawPreparedExportFrame(
      prepared.frame,
      context,
      prepared.preparedBySceneId,
      prepared.preparedByMediaKey,
      plan.keyframedVisualEffectsEnabled,
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "render frame failed",
    };
  }
}

function getPngDataUrl(): string {
  if (!context) throw new Error("no context");
  return context.canvas.toDataURL("image/png");
}

const w = window as PageWindow;
w.__SHORTFORGE_HEADLESS_PAGE_CONTRACT_VERSION__ = HEADLESS_PAGE_CONTRACT_VERSION;
w.__SHORTFORGE_HEADLESS_BOOTSTRAP__ = bootstrap;
w.__SHORTFORGE_HEADLESS_RENDER_FRAME__ = renderFrame;
w.__SHORTFORGE_HEADLESS_GET_PNG__ = getPngDataUrl;
