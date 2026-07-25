/**
 * Pre-write workspace / frame / artifact byte ceilings with reservation semantics.
 * Overflow-safe finite integer arithmetic only.
 */

import type { HeadlessWorkerLimits } from "../runtime/worker-types";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";

export type WorkspaceQuotaBucket =
  | "frame"
  | "aggregate_frames"
  | "workspace"
  | "artifact"
  | "bundle"
  | "html"
  | "manifest";

export type WorkspaceReservationId = string;

interface Reservation {
  readonly bytes: number;
  readonly bucket: WorkspaceQuotaBucket;
  readonly released: boolean;
  readonly committed: boolean;
}

function asSafeNonNegInt(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function safeAdd(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
    return null;
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < a) return null;
  return sum;
}

export class WorkspaceByteBudget {
  private committedWorkspace = 0;
  private reservedWorkspace = 0;
  private committedFrames = 0;
  private reservedFrames = 0;
  private peakCommittedWorkspace = 0;
  private peakReservedPlusCommittedWorkspace = 0;
  private peakFrameBytes = 0;
  private seq = 0;
  private readonly reservations = new Map<WorkspaceReservationId, Reservation>();

  constructor(private readonly limits: HeadlessWorkerLimits) {}

  peakWorkspaceCommittedBytes(): number {
    return this.peakCommittedWorkspace;
  }

  peakWorkspaceReservedPlusCommittedBytes(): number {
    return this.peakReservedPlusCommittedWorkspace;
  }

  peakSingleFrameBytes(): number {
    return this.peakFrameBytes;
  }

  aggregateFrameBytesCommitted(): number {
    return this.committedFrames;
  }

  private notePeaks(): void {
    if (this.committedWorkspace > this.peakCommittedWorkspace) {
      this.peakCommittedWorkspace = this.committedWorkspace;
    }
    const reservedPlus = this.committedWorkspace + this.reservedWorkspace;
    if (reservedPlus > this.peakReservedPlusCommittedWorkspace) {
      this.peakReservedPlusCommittedWorkspace = reservedPlus;
    }
  }

  remainingWorkspaceCapacity(): number {
    const used = safeAdd(this.committedWorkspace, this.reservedWorkspace);
    if (used == null) return 0;
    const rem = this.limits.maxWorkspaceBytes - used;
    return rem > 0 ? rem : 0;
  }

  remainingFrameAggregateCapacity(): number {
    const used = safeAdd(this.committedFrames, this.reservedFrames);
    if (used == null) return 0;
    const rem = this.limits.maxAggregateFrameBytes - used;
    return rem > 0 ? rem : 0;
  }

  /**
   * Reserve capacity before a write. Caller must commit(actual) or release().
   */
  reserve(
    byteLength: number,
    bucket: WorkspaceQuotaBucket,
  ):
    | { readonly ok: true; readonly reservationId: WorkspaceReservationId }
    | { readonly ok: false; readonly message: string } {
    const bytes = asSafeNonNegInt(byteLength);
    if (bytes == null) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }
    if (bytes === 0) {
      const id = this.nextId();
      this.reservations.set(id, {
        bytes: 0,
        bucket,
        released: false,
        committed: false,
      });
      return { ok: true, reservationId: id };
    }

    if (bucket === "frame" && bytes > this.limits.maxSingleFrameBytes) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }
    if (bucket === "bundle" && bytes > this.limits.maxGeneratedBundleBytes) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }
    if (bucket === "artifact" && bytes > this.limits.maxArtifactBytes) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }
    if (bucket === "frame") {
      const nextFrames = safeAdd(this.committedFrames + this.reservedFrames, bytes);
      if (nextFrames == null || nextFrames > this.limits.maxAggregateFrameBytes) {
        return { ok: false, message: scrubWorkerMessage("quota") };
      }
    }

    const nextWorkspace = safeAdd(
      this.committedWorkspace + this.reservedWorkspace,
      bytes,
    );
    if (nextWorkspace == null || nextWorkspace > this.limits.maxWorkspaceBytes) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }

    this.reservedWorkspace += bytes;
    if (bucket === "frame") {
      this.reservedFrames += bytes;
      // Peak single-frame is measured even for transient streaming reserves.
      if (bytes > this.peakFrameBytes) {
        this.peakFrameBytes = bytes;
      }
    }
    this.notePeaks();

    const id = this.nextId();
    this.reservations.set(id, {
      bytes,
      bucket,
      released: false,
      committed: false,
    });
    return { ok: true, reservationId: id };
  }

  /**
   * Commit a reservation after a successful write.
   * `actualBytes` may be ≤ reserved; unused reserved capacity is released.
   */
  commit(
    reservationId: WorkspaceReservationId,
    actualBytes?: number,
  ): { ok: true } | { ok: false; message: string } {
    const res = this.reservations.get(reservationId);
    if (!res || res.released || res.committed) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }
    const actual =
      actualBytes == null ? res.bytes : asSafeNonNegInt(actualBytes);
    if (actual == null || actual > res.bytes) {
      return { ok: false, message: scrubWorkerMessage("quota") };
    }

    this.reservedWorkspace -= res.bytes;
    if (res.bucket === "frame") this.reservedFrames -= res.bytes;

    this.committedWorkspace += actual;
    if (res.bucket === "frame") {
      this.committedFrames += actual;
      if (actual > this.peakFrameBytes) {
        this.peakFrameBytes = actual;
      }
    }
    this.notePeaks();

    this.reservations.set(reservationId, {
      ...res,
      committed: true,
      bytes: actual,
    });
    return { ok: true };
  }

  /** Release an unused reservation (cancel/fail before or after failed write). */
  release(reservationId: WorkspaceReservationId): void {
    const res = this.reservations.get(reservationId);
    if (!res || res.released || res.committed) return;
    this.reservedWorkspace -= res.bytes;
    if (res.bucket === "frame") this.reservedFrames -= res.bytes;
    this.reservations.set(reservationId, { ...res, released: true });
  }

  /** Convenience: reserve → write → commit, or release on failure. */
  assertCanWrite(
    byteLength: number,
    bucket: WorkspaceQuotaBucket,
  ): { ok: true } | { ok: false; message: string } {
    const reserved = this.reserve(byteLength, bucket);
    if (!reserved.ok) return reserved;
    // Peek-only: release immediately; caller should use reserve/commit for real writes.
    this.release(reserved.reservationId);
    return { ok: true };
  }

  recordWrite(byteLength: number, bucket: WorkspaceQuotaBucket): void {
    const reserved = this.reserve(byteLength, bucket);
    if (!reserved.ok) {
      throw new Error(reserved.message);
    }
    const committed = this.commit(reserved.reservationId, byteLength);
    if (!committed.ok) {
      this.release(reserved.reservationId);
      throw new Error(committed.message);
    }
  }

  /** Authorized FFmpeg output ceiling: min(maxArtifact, remaining workspace). */
  authorizedArtifactCeilingBytes(): number {
    return Math.min(
      this.limits.maxArtifactBytes,
      this.remainingWorkspaceCapacity(),
    );
  }

  private nextId(): WorkspaceReservationId {
    this.seq += 1;
    return `res_${this.seq}`;
  }
}
