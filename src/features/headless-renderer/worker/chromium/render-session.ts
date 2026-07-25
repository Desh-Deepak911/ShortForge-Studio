/**
 * Chromium render session — frame API + PNG capture + exact origin isolation.
 * Production path streams one validated PNG at a time (no duration-proportional disk sequence).
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

import type { StagedWorkerAsset } from "../assets/materialize-owned-assets";
import { rewriteManifestMediaToLocalAssets } from "../assets/rewrite-manifest-urls";
import type { HeadlessWorkerWorkspace } from "../assets/workspace";
import type { WorkspaceByteBudget } from "../assets/workspace-quota";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";
import type { HeadlessFramePlan } from "../runtime/frame-plan";
import type { HeadlessWorkerLimits } from "../runtime/worker-types";
import { readPngIhdrSize } from "../stream/png-frame-validator";
import { startHeadlessAssetServer, type HeadlessAssetServer } from "./asset-server";
import { buildHeadlessChromeLaunchArgs } from "./chrome-launch-args";
import {
  HEADLESS_PAGE_WORKSPACE_HTML_NAME,
  materializeHeadlessPageWorkspace,
} from "./materialize-headless-page-workspace";
import { isAllowedHeadlessPageRequest } from "./network-policy";
import {
  classifyScrubbedPageFailureMessage,
  pageSubstageToExecutionSubstage,
  type PageExecutionAttribution,
} from "./page-execution-attribution";
import {
  isHeadlessPageBootstrapRejectionReasonId,
  type HeadlessPageBootstrapRejectionReasonId,
} from "./page-bootstrap-rejection";
import {
  createInitialPageWorkspaceAttribution,
  pageWorkspaceAttributionToTelemetryFacts,
  type PageWorkspaceAttribution,
} from "./page-workspace-attribution";
import { resolveTerminalPageFailureAttribution } from "./page-workspace-attribution-invariant";
import {
  HEADLESS_PAGE_CONTRACT_VERSION,
} from "./page-contract";
import type { ClaimedRenderExecutionSubstageId } from "../runtime/claimed-render-execution-attribution";
import type { ClaimedRenderExecutionReasonId } from "../runtime/claimed-render-execution-attribution";
import {
  createNoOpProviderBackedBoundaryTelemetry,
  type ProviderBackedBoundaryTelemetryPort,
  type ProviderContextClassifications,
} from "../runtime/provider-backed-boundary-telemetry";

export interface ChromiumRenderSessionResult {
  readonly frameCount: number;
  readonly elapsedMs: number;
}

export type ChromiumRenderSessionFailure = {
  readonly message: string;
  readonly cancelled: boolean;
  readonly timedOut?: boolean;
  readonly quota?: boolean;
  readonly executionSubstage: ClaimedRenderExecutionSubstageId;
  readonly pageFailureReason: ClaimedRenderExecutionReasonId;
  readonly pageResponseClass: PageExecutionAttribution["pageResponseClass"];
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
};

function pageFailure(
  attribution: PageExecutionAttribution,
  input: {
    readonly message: string;
    readonly cancelled?: boolean;
    readonly timedOut?: boolean;
    readonly quota?: boolean;
    readonly workspacePrepared?: boolean;
    readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
  },
): { readonly ok: false } & ChromiumRenderSessionFailure {
  const executionSubstage = pageSubstageToExecutionSubstage(
    attribution.executionSubstage,
  );
  const resolved = resolveTerminalPageFailureAttribution({
    workspacePrepared: input.workspacePrepared === true,
    executionSubstage,
    pageFailureReason: attribution.pageFailureReason,
    pageWorkspaceAttribution: input.pageWorkspaceAttribution,
  });
  return {
    ok: false,
    message: input.message,
    cancelled: input.cancelled === true,
    timedOut: input.timedOut,
    quota: input.quota,
    executionSubstage,
    pageFailureReason: resolved.pageFailureReason,
    pageResponseClass: attribution.pageResponseClass,
    ...(resolved.pageWorkspaceAttribution != null
      ? { pageWorkspaceAttribution: resolved.pageWorkspaceAttribution }
      : {}),
  };
}

export { pageWorkspaceAttributionToTelemetryFacts };

export type ChromiumPngFrameSink = (frame: {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly pngBytes: Buffer;
}) => Promise<
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: string;
      readonly cancelled?: boolean;
      readonly quota?: boolean;
    }
>;

async function closeChromiumResources(input: {
  page: Page | null;
  browser: Browser | null;
  server: HeadlessAssetServer | null;
}): Promise<"ok" | "failed"> {
  let failed = false;
  try {
    await input.page?.close({ runBeforeUnload: false });
  } catch {
    failed = true;
  }
  try {
    await input.browser?.close();
  } catch {
    failed = true;
  }
  try {
    await input.server?.close();
  } catch {
    failed = true;
  }
  return failed ? "failed" : "ok";
}

export async function renderFramesWithChromium(input: {
  chromeExecutable: string;
  workspace: HeadlessWorkerWorkspace;
  manifest: ExportManifest;
  stagedAssets: readonly StagedWorkerAsset[];
  framePlan: HeadlessFramePlan;
  signal?: AbortSignal;
  budget: WorkspaceByteBudget;
  limits: HeadlessWorkerLimits;
  remainingMs: () => number;
  /**
   * Production streaming sink — one ordered PNG at a time.
   * Required for Phase 3.2; disk PNG sequence is not written.
   */
  onPngFrame: ChromiumPngFrameSink;
  boundaryTelemetry?: ProviderBackedBoundaryTelemetryPort;
  providerContext?: ProviderContextClassifications;
}): Promise<
  | { readonly ok: true; readonly result: ChromiumRenderSessionResult }
  | ({ readonly ok: false } & ChromiumRenderSessionFailure)
> {
  const started = Date.now();
  const boundaryTelemetry =
    input.boundaryTelemetry ?? createNoOpProviderBackedBoundaryTelemetry();
  let server: HeadlessAssetServer | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let pageWorkspaceAttribution: PageWorkspaceAttribution | undefined;
  let workspacePrepared = false;

  const mergePageWorkspaceAttribution = (
    patch: Partial<PageWorkspaceAttribution>,
  ): PageWorkspaceAttribution => {
    pageWorkspaceAttribution = Object.freeze({
      ...(pageWorkspaceAttribution ?? createInitialPageWorkspaceAttribution()),
      ...patch,
    });
    return pageWorkspaceAttribution;
  };

  const failureWithWorkspace = (
    attribution: PageExecutionAttribution,
    failureInput: Parameters<typeof pageFailure>[1],
  ) =>
    pageFailure(attribution, {
      ...failureInput,
      workspacePrepared,
      pageWorkspaceAttribution:
        failureInput.pageWorkspaceAttribution ?? pageWorkspaceAttribution,
    });

  const throwIfAborted = () => {
    if (input.signal?.aborted) {
      throw new Error("cancelled");
    }
  };

  const evaluateTimeout = () =>
    Math.max(
      1,
      Math.min(input.limits.evaluateTimeoutMs, input.remainingMs()),
    );

  const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
    const ms = evaluateTimeout();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("worker_timeout")),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    throwIfAborted();
    const htmlName = HEADLESS_PAGE_WORKSPACE_HTML_NAME;

    const materialized = await materializeHeadlessPageWorkspace({
      workspace: input.workspace,
      budget: input.budget,
      maxBytes: input.limits.maxGeneratedBundleBytes,
      boundaryTelemetry,
    });
    pageWorkspaceAttribution = materialized.attribution;
    workspacePrepared = true;
    if (!materialized.ok) {
      const quota =
        materialized.reasonId === "page_bundle_quota_exceeded" ||
        materialized.reasonId === "page_bundle_write_failed" ||
        materialized.reasonId === "index_write_failed";
      return failureWithWorkspace(
        classifyScrubbedPageFailureMessage({
          substage: "page_bundle_injection",
          quota,
        }),
        {
          message: scrubWorkerMessage(quota ? "quota" : "chromium"),
          quota,
          pageWorkspaceAttribution,
        },
      );
    }

    server = await startHeadlessAssetServer({
      rootDir: input.workspace.rootDir,
    });

    const rewritten = rewriteManifestMediaToLocalAssets({
      manifest: input.manifest,
      staged: input.stagedAssets,
      origin: server.origin,
    });
    if (!rewritten.ok) {
      return failureWithWorkspace(
        classifyScrubbedPageFailureMessage({
          substage: "page_navigation_or_content_load",
        }),
        {
          message: scrubWorkerMessage("chromium"),
          pageWorkspaceAttribution: mergePageWorkspaceAttribution({
            ...materialized.attribution,
            fileNavigationLoadClass: "failed",
          }),
        },
      );
    }

    const launchArgs = buildHeadlessChromeLaunchArgs();
    try {
      browser = await puppeteer.launch({
        executablePath: input.chromeExecutable,
        headless: true,
        args: [...launchArgs],
      });
      boundaryTelemetry.emit("browser_context_created", {
        providerContext: input.providerContext,
      });
    } catch {
      return failureWithWorkspace(
        classifyScrubbedPageFailureMessage({
          substage: "browser_context_create",
        }),
        {
          message: scrubWorkerMessage("chromium"),
          pageWorkspaceAttribution: materialized.attribution,
        },
      );
    }

    try {
      page = await browser.newPage();
      boundaryTelemetry.emit("page_created", {
        providerContext: input.providerContext,
      });
    } catch {
      return failureWithWorkspace(
        classifyScrubbedPageFailureMessage({ substage: "page_create" }),
        {
          message: scrubWorkerMessage("chromium"),
          pageWorkspaceAttribution: materialized.attribution,
        },
      );
    }
    await page.setViewport({
      width: input.framePlan.width,
      height: input.framePlan.height,
      deviceScaleFactor: 1,
    });

    await page.setRequestInterception(true);
    const allowedOrigin = server.origin;
    page.on("request", (req) => {
      if (
        isAllowedHeadlessPageRequest({
          requestUrl: req.url(),
          allowedOrigin,
        })
      ) {
        void req.continue();
        return;
      }
      void req.abort("blockedbyclient");
    });

    const onAbortClose = () => {
      void closeChromiumResources({ page, browser, server });
    };
    input.signal?.addEventListener("abort", onAbortClose, { once: true });

    try {
      throwIfAborted();
      boundaryTelemetry.emit("page_navigation_started");
      try {
        await withTimeout(
          page.goto(`${allowedOrigin}/${htmlName}`, {
            waitUntil: "domcontentloaded",
            timeout: evaluateTimeout(),
          }),
        );
        boundaryTelemetry.emit("page_navigation_complete");
        boundaryTelemetry.emit("page_script_execution_started");
        boundaryTelemetry.emit("page_script_execution_complete");
        pageWorkspaceAttribution = mergePageWorkspaceAttribution({
          ...materialized.attribution,
          fileNavigationLoadClass: "loaded",
          scriptLoadClass: "loaded",
        });
      } catch (error) {
        const timedOut =
          error instanceof Error && error.message === "worker_timeout";
        return failureWithWorkspace(
          classifyScrubbedPageFailureMessage({
            substage: "page_navigation_or_content_load",
            timedOut,
          }),
          {
            message: scrubWorkerMessage(timedOut ? "timeout" : "chromium"),
            timedOut,
            pageWorkspaceAttribution: mergePageWorkspaceAttribution({
              ...materialized.attribution,
              fileNavigationLoadClass: "failed",
              scriptLoadClass: "load_failed",
              pageErrorClass: timedOut ? "timeout" : "runtime_exception",
            }),
          },
        );
      }

      boundaryTelemetry.emit("page_contract_observation_started");
      const contractCheck = await withTimeout(
        page.evaluate((expectedContractVersion: string) => {
          const w = window as unknown as Window & Record<string, unknown>;
          const contractVersion = w.__SHORTFORGE_HEADLESS_PAGE_CONTRACT_VERSION__;
          if (typeof contractVersion !== "string") {
            return { ok: false as const, reason: "contract_missing" as const };
          }
          if (contractVersion !== expectedContractVersion) {
            return {
              ok: false as const,
              reason: "contract_version_mismatch" as const,
            };
          }
          if (typeof w.__SHORTFORGE_HEADLESS_BOOTSTRAP__ !== "function") {
            return { ok: false as const, reason: "bootstrap_missing" as const };
          }
          return { ok: true as const };
        }, HEADLESS_PAGE_CONTRACT_VERSION),
      );

      const contractReason =
        contractCheck != null && "reason" in contractCheck
          ? (contractCheck as { reason?: string }).reason
          : undefined;
      const contractMissing =
        contractReason === "contract_missing" ||
        contractReason === "bootstrap_missing";
      const contractVersionMismatch =
        contractReason === "contract_version_mismatch";
      const contractObservationOutcome = contractVersionMismatch
        ? ("version_mismatch" as const)
        : contractMissing
          ? ("missing_contract" as const)
          : ("accepted" as const);

      boundaryTelemetry.emit("page_contract_observation_complete", {
        bootstrapOutcomeClass: contractObservationOutcome,
      });

      if (!contractCheck?.ok) {
        boundaryTelemetry.emit("page_bootstrap_started");
        boundaryTelemetry.emit("page_bootstrap_terminal", {
          bootstrapOutcomeClass: contractObservationOutcome,
        });
        const bootstrapResponseClass =
          contractReason === "contract_version_mismatch"
            ? ("version_mismatch" as const)
            : contractMissing
              ? ("missing_contract" as const)
              : ("missing_contract" as const);
        return failureWithWorkspace(
          classifyScrubbedPageFailureMessage({
            substage: "page_contract_ready",
            contractMissing,
            contractVersionMismatch,
          }),
          {
            message: scrubWorkerMessage("chromium"),
            pageWorkspaceAttribution: mergePageWorkspaceAttribution({
              scriptExecutionClass: contractMissing
                ? "evaluation_error"
                : "executed",
              contractGlobalPresence: contractMissing ? "missing" : "present",
              contractVersionMatch: contractVersionMismatch
                ? "mismatch"
                : contractMissing
                  ? "not_applicable"
                  : "match",
              bootstrapResponseClass,
              pageErrorClass: "runtime_exception",
            }),
          },
        );
      }

      boundaryTelemetry.emit("page_bootstrap_started");
      const boot = await withTimeout(
        page.evaluate(
          async (args: {
            manifest: unknown;
            targetWidth: number;
            targetHeight: number;
          }) => {
            const w = window as unknown as Window & Record<string, unknown>;
            const bootstrap = w.__SHORTFORGE_HEADLESS_BOOTSTRAP__;
            if (typeof bootstrap !== "function") {
              return {
                ok: false as const,
                reasonId: "bootstrap_runtime_exception" as const,
              };
            }
            return (
              bootstrap as (c: {
                manifest: unknown;
                targetWidth: number;
                targetHeight: number;
              }) => Promise<
                | { ok: true }
                | { ok: false; reasonId: string }
              >
            )(args);
          },
          {
            manifest: rewritten.manifest,
            targetWidth: input.framePlan.width,
            targetHeight: input.framePlan.height,
          },
        ),
      );

      if (!boot || !boot.ok) {
        const bootstrapReasonId =
          boot != null &&
          "reasonId" in boot &&
          isHeadlessPageBootstrapRejectionReasonId(
            (boot as { reasonId?: string }).reasonId,
          )
            ? ((boot as { reasonId: HeadlessPageBootstrapRejectionReasonId })
                .reasonId)
            : ("unknown_rejected" as const);
        boundaryTelemetry.emit("page_bootstrap_terminal", {
          bootstrapOutcomeClass: "rejected",
        });
        return failureWithWorkspace(
          classifyScrubbedPageFailureMessage({
            substage: "page_contract_ready",
            bootstrapRejected: true,
            bootstrapReasonId,
          }),
          {
            message: scrubWorkerMessage("chromium"),
            pageWorkspaceAttribution: mergePageWorkspaceAttribution({
              scriptExecutionClass: "executed",
              contractGlobalPresence: "present",
              contractVersionMatch: "match",
              bootstrapResponseClass: "rejected",
              pageErrorClass: "bootstrap_rejected",
            }),
          },
        );
      }

      boundaryTelemetry.emit("page_bootstrap_terminal", {
        bootstrapOutcomeClass: "accepted",
      });
      pageWorkspaceAttribution = mergePageWorkspaceAttribution({
        scriptExecutionClass: "executed",
        contractGlobalPresence: "present",
        contractVersionMatch: "match",
        bootstrapResponseClass: "accepted",
        pageErrorClass: "none",
      });

      boundaryTelemetry.emit("frame_request_started");
      let frameOutcomeClass: "succeeded" | "failed" = "succeeded";
      for (const frame of input.framePlan.frames) {
        throwIfAborted();
        const rendered = await withTimeout(
          page.evaluate(
            async (args) => {
              const w = window as Window & {
                __SHORTFORGE_HEADLESS_RENDER_FRAME__?: (a: {
                  frameIndex: number;
                  timestampMs: number;
                }) => Promise<{ ok: true } | { ok: false; message: string }>;
              };
              if (!w.__SHORTFORGE_HEADLESS_RENDER_FRAME__) {
                return { ok: false as const, message: "Frame API missing." };
              }
              return w.__SHORTFORGE_HEADLESS_RENDER_FRAME__(args);
            },
            { frameIndex: frame.frameIndex, timestampMs: frame.timestampMs },
          ),
        );
        if (!rendered.ok) {
          frameOutcomeClass = "failed";
          boundaryTelemetry.emit("frame_request_terminal", { frameOutcomeClass });
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_request_submit",
            }),
            { message: scrubWorkerMessage("chromium") },
          );
        }

        const dataUrl = await withTimeout(
          page.evaluate(() => {
            const w = window as Window & {
              __SHORTFORGE_HEADLESS_GET_PNG__?: () => string;
            };
            return w.__SHORTFORGE_HEADLESS_GET_PNG__?.() ?? "";
          }),
        );
        if (!dataUrl.startsWith("data:image/png;base64,")) {
          frameOutcomeClass = "failed";
          boundaryTelemetry.emit("frame_request_terminal", { frameOutcomeClass });
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_response_wait",
              responseMissing: true,
            }),
            { message: scrubWorkerMessage("chromium") },
          );
        }
        const b64 = dataUrl.slice("data:image/png;base64,".length);
        const bytes = Buffer.from(b64, "base64");
        const pngSize = readPngIhdrSize(bytes);
        if (
          !pngSize ||
          pngSize.width !== input.framePlan.width ||
          pngSize.height !== input.framePlan.height
        ) {
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_response_validate",
              responseInvalid: true,
            }),
            { message: scrubWorkerMessage("chromium") },
          );
        }
        if (bytes.byteLength > input.limits.maxSingleFrameBytes) {
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_response_validate",
              quota: true,
            }),
            { message: scrubWorkerMessage("quota"), quota: true },
          );
        }
        // Transient single-frame check only — no duration-proportional disk commit.
        const frameReserve = input.budget.reserve(bytes.byteLength, "frame");
        if (!frameReserve.ok) {
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_response_validate",
              quota: true,
            }),
            { message: frameReserve.message, quota: true },
          );
        }
        try {
          const sunk = await input.onPngFrame({
            frameIndex: frame.frameIndex,
            timestampMs: frame.timestampMs,
            pngBytes: bytes,
          });
          // Release immediately — streamed frames are not workspace-resident.
          input.budget.release(frameReserve.reservationId);
          if (!sunk.ok) {
            return failureWithWorkspace(
              classifyScrubbedPageFailureMessage({
                substage: "page_response_validate",
                quota: sunk.quota,
                cancelled: sunk.cancelled,
              }),
              {
                message: sunk.message,
                cancelled: sunk.cancelled === true,
                quota: sunk.quota === true,
              },
            );
          }
        } catch {
          input.budget.release(frameReserve.reservationId);
          return failureWithWorkspace(
            classifyScrubbedPageFailureMessage({
              substage: "page_request_submit",
            }),
            { message: scrubWorkerMessage("chromium") },
          );
        }
      }

      boundaryTelemetry.emit("frame_request_terminal", {
        frameOutcomeClass: "succeeded",
      });
      return {
        ok: true,
        result: {
          frameCount: input.framePlan.totalFrames,
          elapsedMs: Date.now() - started,
        },
      };
    } finally {
      input.signal?.removeEventListener("abort", onAbortClose);
    }
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "worker_timeout";
    const cancelled =
      !timedOut &&
      (input.signal?.aborted === true ||
        (error instanceof Error && error.message === "cancelled"));
    return failureWithWorkspace(
      classifyScrubbedPageFailureMessage({
        substage: timedOut
          ? "page_response_wait"
          : cancelled
            ? "page_cleanup"
            : "page_contract_ready",
        timedOut,
        cancelled,
      }),
      {
        message: scrubWorkerMessage(
          timedOut ? "timeout" : cancelled ? "cancelled" : "chromium",
        ),
        cancelled,
        timedOut,
      },
    );
  } finally {
    const cleanupOutcomeClass = await closeChromiumResources({
      page,
      browser,
      server,
    });
    boundaryTelemetry.emit("chromium_session_cleanup", {
      cleanupOutcomeClass,
    });
  }
}
