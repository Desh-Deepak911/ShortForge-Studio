/**
 * Testing/dev-only HeadlessRenderClient.
 * Must never be imported from production routes or production Export leaves.
 */

import type { HeadlessAvailabilityV1 } from "../availability/availability.types";
import {
  PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
  isExplicitTestAuthorityFingerprint,
  isExplicitTestAuthorityOwner,
  isForbiddenProductionFingerprint,
  isForbiddenProductionOwnerId,
  isFoundationPlaceholderBuildId,
} from "../authority/placeholder-production-guard";
import type {
  HeadlessCreateJobClientBody,
  HeadlessRenderClient,
} from "../client/headless-render-client.port";
import { creatorMessageForClientError } from "../client/creator-messages";
import type {
  HeadlessClientResult,
  HeadlessDownloadCapabilityV1,
  HeadlessPublicJobState,
  HeadlessPublicJobView,
} from "../client/public-job.types";

export interface FakeHeadlessRenderClientOptions {
  readonly availability?: HeadlessAvailabilityV1;
  readonly autoAdvance?: boolean;
  /** Delay between auto-advance stages (ms). Default 30. */
  readonly advanceStepMs?: number;
  /** When true, createJob returns invalid JSON shape via getJob after create. */
  readonly malformedViews?: boolean;
  readonly failCreate?: boolean;
}

function view(
  jobId: string,
  state: HeadlessPublicJobState,
  extra?: Partial<HeadlessPublicJobView>,
): HeadlessPublicJobView {
  const now = Date.now();
  const terminal =
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "expired";
  return Object.freeze({
    version: 1 as const,
    jobId,
    state,
    createdAtMs: now,
    updatedAtMs: now,
    progress: terminal
      ? null
      : Object.freeze({
          percent:
            state === "queued"
              ? 5
              : state === "rendering"
                ? 40
                : state === "encoding"
                  ? 70
                  : state === "validating"
                    ? 90
                    : 50,
          stage: state,
        }),
    terminalReason:
      state === "failed"
        ? Object.freeze({ reasonId: "RENDER_FAILED", retryable: true })
        : state === "cancelled"
          ? Object.freeze({ reasonId: "CANCELLED_BY_USER", retryable: false })
          : state === "expired"
            ? Object.freeze({ reasonId: "EXPIRED", retryable: true })
            : null,
    artifactAvailable: state === "succeeded",
    cancelAccepted: !terminal,
    ...extra,
  });
}

const DEFAULT_AVAILABLE: HeadlessAvailabilityV1 = Object.freeze({
  version: 1 as const,
  state: "available" as const,
  message: "Server export is available in this test harness.",
  headlessSelectable: true,
  canCreateJob: true,
});

export class FakeHeadlessRenderClient implements HeadlessRenderClient {
  private availability: HeadlessAvailabilityV1;
  private readonly jobs = new Map<string, HeadlessPublicJobView>();
  private readonly idempotency = new Map<string, string>();
  private readonly advanceTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private seq = 0;
  /** Ordered createJob bodies (including idempotent replays). */
  readonly createJobCalls: HeadlessCreateJobClientBody[] = [];
  readonly autoAdvance: boolean;
  readonly advanceStepMs: number;
  readonly malformedViews: boolean;
  readonly failCreate: boolean;

  constructor(options: FakeHeadlessRenderClientOptions = {}) {
    this.availability = options.availability ?? DEFAULT_AVAILABLE;
    this.autoAdvance = options.autoAdvance !== false;
    this.advanceStepMs = Math.max(1, options.advanceStepMs ?? 30);
    this.malformedViews = options.malformedViews === true;
    this.failCreate = options.failCreate === true;
  }

  get createJobCallCount(): number {
    return this.createJobCalls.length;
  }

  latestJobId(): string | null {
    if (this.seq < 1) return null;
    return `fake-job-${this.seq.toString().padStart(4, "0")}`;
  }

  setAvailability(next: HeadlessAvailabilityV1): void {
    this.availability = next;
  }

  /** Deterministic advance for verification / harness (stops auto-advance). */
  forceState(jobId: string, state: HeadlessPublicJobState): void {
    const existing = this.jobs.get(jobId);
    if (!existing) return;
    this.clearAdvance(jobId);
    this.jobs.set(jobId, view(jobId, state, { createdAtMs: existing.createdAtMs }));
  }

  async getAvailability(): Promise<HeadlessClientResult<HeadlessAvailabilityV1>> {
    return { ok: true, value: this.availability };
  }

  async createJob(
    body: HeadlessCreateJobClientBody,
    _signal?: AbortSignal,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>> {
    void _signal;
    this.createJobCalls.push(
      Object.freeze({
        ...body,
        ownership: Object.freeze({ ...body.ownership }),
        rendererProfile: Object.freeze({ ...body.rendererProfile }),
      }),
    );

    // Testing client still rejects production foundation placeholders.
    if (
      isForbiddenProductionFingerprint(body.manifestFingerprint) ||
      isForbiddenProductionFingerprint(body.assetBundleFingerprint) ||
      isForbiddenProductionOwnerId(body.ownership.ownerId) ||
      isFoundationPlaceholderBuildId(body.rendererBuildId)
    ) {
      return {
        ok: false,
        code: "CREATE_REJECTED",
        message: PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
      };
    }
    if (
      !isExplicitTestAuthorityFingerprint(body.manifestFingerprint) ||
      !isExplicitTestAuthorityFingerprint(body.assetBundleFingerprint) ||
      !isExplicitTestAuthorityOwner(body.ownership.ownerId)
    ) {
      return {
        ok: false,
        code: "CREATE_REJECTED",
        message: PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
      };
    }

    if (this.failCreate) {
      return {
        ok: false,
        code: "CREATE_REJECTED",
        message: creatorMessageForClientError("CREATE_REJECTED"),
      };
    }
    if (!this.availability.canCreateJob) {
      return {
        ok: false,
        code: "CONFIGURATION_UNAVAILABLE",
        message: creatorMessageForClientError("CONFIGURATION_UNAVAILABLE"),
      };
    }
    const existingId = this.idempotency.get(body.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      return { ok: true, value: { jobId: existingId, view: existing } };
    }
    this.seq += 1;
    const jobId = `fake-job-${this.seq.toString().padStart(4, "0")}`;
    const initial = view(jobId, "queued");
    this.jobs.set(jobId, initial);
    this.idempotency.set(body.idempotencyKey, jobId);
    if (this.autoAdvance) {
      this.scheduleAdvance(jobId);
    }
    return { ok: true, value: { jobId, view: initial } };
  }

  async getJob(jobId: string): Promise<HeadlessClientResult<HeadlessPublicJobView>> {
    if (this.malformedViews) {
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        message: creatorMessageForClientError("INVALID_RESPONSE"),
      };
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: creatorMessageForClientError("JOB_NOT_FOUND"),
      };
    }
    return { ok: true, value: job };
  }

  async cancelJob(jobId: string): Promise<HeadlessClientResult<HeadlessPublicJobView>> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: creatorMessageForClientError("JOB_NOT_FOUND"),
      };
    }
    this.clearAdvance(jobId);
    if (
      job.state === "succeeded" ||
      job.state === "failed" ||
      job.state === "cancelled" ||
      job.state === "expired"
    ) {
      return { ok: true, value: job };
    }
    const cancelled = view(jobId, "cancelled", { createdAtMs: job.createdAtMs });
    this.jobs.set(jobId, cancelled);
    return { ok: true, value: cancelled };
  }

  async retryJob(
    jobId: string,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: creatorMessageForClientError("JOB_NOT_FOUND"),
      };
    }
    if (job.state !== "failed" && job.state !== "expired") {
      return {
        ok: false,
        code: "NOT_RETRYABLE",
        message: creatorMessageForClientError("NOT_RETRYABLE"),
      };
    }
    this.seq += 1;
    const nextId = `fake-job-${this.seq.toString().padStart(4, "0")}`;
    const next = view(nextId, "queued");
    this.jobs.set(nextId, next);
    if (this.autoAdvance) this.scheduleAdvance(nextId);
    return { ok: true, value: { jobId: nextId, view: next } };
  }

  async createDownloadCapability(
    jobId: string,
  ): Promise<HeadlessClientResult<HeadlessDownloadCapabilityV1>> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "succeeded" || !job.artifactAvailable) {
      return {
        ok: false,
        code: "NOT_DOWNLOADABLE",
        message: creatorMessageForClientError("NOT_DOWNLOADABLE"),
      };
    }
    // Tiny valid WebM-ish placeholder bytes for harness download only.
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x01]);
    const blob = new Blob([bytes], { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    return {
      ok: true,
      value: Object.freeze({
        version: 1 as const,
        jobId,
        url,
        expiresAtMs: Date.now() + 60_000,
        filename: `headless-export-${jobId}.webm`,
      }),
    };
  }

  private scheduleAdvance(jobId: string): void {
    const steps: HeadlessPublicJobState[] = [
      "rendering",
      "encoding",
      "validating",
      "succeeded",
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((state, i) => {
      timers.push(
        setTimeout(() => {
          const existing = this.jobs.get(jobId);
          if (!existing) return;
          if (
            existing.state === "cancelled" ||
            existing.state === "failed" ||
            existing.state === "expired"
          ) {
            return;
          }
          this.jobs.set(
            jobId,
            view(jobId, state, { createdAtMs: existing.createdAtMs }),
          );
        }, (i + 1) * this.advanceStepMs),
      );
    });
    this.advanceTimers.set(jobId, timers);
  }

  private clearAdvance(jobId: string): void {
    const timers = this.advanceTimers.get(jobId);
    if (!timers) return;
    for (const t of timers) clearTimeout(t);
    this.advanceTimers.delete(jobId);
  }
}
