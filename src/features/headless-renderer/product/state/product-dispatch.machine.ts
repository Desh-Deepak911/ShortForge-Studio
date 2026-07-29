import {
  HEADLESS_TERMINAL_PUBLIC_STATES,
  type HeadlessPublicJobState,
  type HeadlessPublicJobView,
} from "../client/public-job.types";
import {
  createInitialProductModel,
  type HeadlessProductEvent,
  type HeadlessProductModel,
  type HeadlessProductState,
} from "./product-dispatch.types";

const TERMINAL = new Set<string>(HEADLESS_TERMINAL_PUBLIC_STATES);

function isStale(model: HeadlessProductModel, runId: number): boolean {
  return runId !== model.ctx.runId;
}

function mapJobStateToProduct(state: HeadlessPublicJobState): HeadlessProductState {
  switch (state) {
    case "created":
    case "materializing":
      return "materializing";
    case "queued":
      return "queued";
    case "rendering":
      return "rendering";
    case "encoding":
      return "encoding";
    case "validating":
      return "validating";
    case "uploading":
      return "uploading_artifact";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "failed";
  }
}

function applyJobView(
  model: HeadlessProductModel,
  view: HeadlessPublicJobView,
  extra?: Partial<HeadlessProductModel["ctx"]>,
): HeadlessProductModel {
  const nextState = mapJobStateToProduct(view.state);
  const busy = !TERMINAL.has(view.state) && nextState !== "cancelling";
  const incomingPercent = view.progress?.percent ?? null;
  const nextPercent =
    incomingPercent != null && model.ctx.advisoryPercent != null
      ? Math.max(incomingPercent, model.ctx.advisoryPercent)
      : incomingPercent ?? model.ctx.advisoryPercent;
  const completedFrames =
    view.progress?.completedFrames ?? model.ctx.advisoryCompletedFrames;
  const totalFrames =
    view.progress?.totalFrames ?? model.ctx.advisoryTotalFrames;
  return {
    state: nextState,
    ctx: {
      ...model.ctx,
      jobId: view.jobId,
      jobView: view,
      advisoryPercent: nextPercent,
      advisoryCompletedFrames: completedFrames,
      advisoryTotalFrames: totalFrames,
      busy: nextState === "cancelling" ? true : busy,
      safeMessage: null,
      clientErrorCode: null,
      ...extra,
    },
  };
}

/**
 * Pure, deterministic headless product dispatch reducer.
 * Late events from older runs are ignored (stale-safe).
 */
export function reduceHeadlessProduct(
  model: HeadlessProductModel,
  event: HeadlessProductEvent,
): HeadlessProductModel {
  switch (event.type) {
    case "RESET":
      return createInitialProductModel(model.ctx.renderer);

    case "SELECT_RENDERER": {
      // Policy (1A.1): lock renderer for the full busy Headless lifecycle.
      // Accepted/active jobs must not be silently abandoned via Browser switch.
      if (
        model.ctx.renderer === "headless" &&
        event.renderer === "browser" &&
        (model.ctx.busy ||
          (model.ctx.jobId != null &&
            model.state !== "succeeded" &&
            model.state !== "failed" &&
            model.state !== "cancelled" &&
            model.state !== "expired"))
      ) {
        return model;
      }
      if (model.ctx.busy && model.state !== "unavailable" && model.state !== "idle") {
        return model;
      }
      return {
        ...model,
        state: event.renderer === "browser" ? "idle" : model.state,
        ctx: { ...model.ctx, renderer: event.renderer },
      };
    }

    case "CHECK_AVAILABILITY": {
      if (isStale(model, event.runId) && event.runId < model.ctx.runId) {
        return model;
      }
      // Never interrupt an active/restored job with a capability probe.
      if (model.ctx.jobId) {
        return model;
      }
      return {
        state: "checking_availability",
        ctx: {
          ...model.ctx,
          runId: event.runId,
          busy: true,
          safeMessage: null,
          clientErrorCode: null,
        },
      };
    }

    case "AVAILABILITY_RESULT": {
      if (isStale(model, event.runId)) return model;
      const can = event.availability.canCreateJob === true;
      return {
        state: can ? "idle" : "unavailable",
        ctx: {
          ...model.ctx,
          availability: event.availability,
          busy: false,
          safeMessage: can ? null : event.availability.message,
          clientErrorCode: can ? null : "CONFIGURATION_UNAVAILABLE",
        },
      };
    }

    case "AVAILABILITY_FAILED": {
      if (isStale(model, event.runId)) return model;
      return {
        state: "unavailable",
        ctx: {
          ...model.ctx,
          availability: null,
          busy: false,
          safeMessage: event.message,
          clientErrorCode: event.code,
        },
      };
    }

    case "START_EXPORT": {
      if (isStale(model, event.runId) && event.runId < model.ctx.runId) {
        return model;
      }
      return {
        state: "preparing",
        ctx: {
          ...model.ctx,
          runId: event.runId,
          snapshot: event.snapshot,
          jobId: null,
          jobView: null,
          advisoryPercent: null,
          busy: true,
          safeMessage: null,
          clientErrorCode: null,
        },
      };
    }

    case "PREPARE_OK": {
      if (isStale(model, event.runId)) return model;
      if (model.state !== "preparing") return model;
      return {
        state: "materializing",
        ctx: {
          ...model.ctx,
          busy: true,
          advisoryPercent: 10,
          safeMessage: "Verifying the frozen story and media package…",
        },
      };
    }

    case "MATERIALIZE_PROGRESS": {
      if (isStale(model, event.runId)) return model;
      if (model.state === "cancelling") return model;
      return {
        state: event.phase,
        ctx: {
          ...model.ctx,
          busy: true,
          advisoryPercent: event.percent ?? model.ctx.advisoryPercent,
          safeMessage: event.message ?? model.ctx.safeMessage,
        },
      };
    }

    case "UPLOAD_OK": {
      if (isStale(model, event.runId)) return model;
      if (model.state === "cancelling") return model;
      if (TERMINAL.has(model.state)) return model;
      if (model.ctx.renderer !== "headless") return model;
      return { state: "creating_job", ctx: { ...model.ctx, busy: true } };
    }

    case "UPLOAD_FAILED": {
      if (isStale(model, event.runId)) return model;
      if (TERMINAL.has(model.state)) return model;
      if (model.ctx.renderer !== "headless") return model;
      return {
        state: "failed",
        ctx: {
          ...model.ctx,
          busy: false,
          safeMessage: event.message,
          clientErrorCode: "CREATE_REJECTED",
        },
      };
    }

    case "CREATE_OK": {
      if (isStale(model, event.runId)) return model;
      // Late create after cancel/terminal must not resurrect an operation.
      if (TERMINAL.has(model.state)) return model;
      if (model.ctx.renderer !== "headless") return model;
      return applyJobView(model, event.view, {
        jobId: event.jobId,
        busy: !TERMINAL.has(event.view.state),
      });
    }

    case "CREATE_FAILED": {
      if (isStale(model, event.runId)) return model;
      if (TERMINAL.has(model.state)) return model;
      if (model.ctx.renderer !== "headless") return model;
      return {
        state: "failed",
        ctx: {
          ...model.ctx,
          busy: false,
          safeMessage: event.message,
          clientErrorCode: event.code,
        },
      };
    }

    case "JOB_VIEW": {
      if (isStale(model, event.runId)) return model;
      // Terminal authority: never regress from terminal to active on late views.
      if (TERMINAL.has(model.state) && !TERMINAL.has(event.view.state)) {
        return model;
      }
      if (model.state === "cancelling" && event.view.state !== "cancelled") {
        // Keep cancelling until cancel confirms or server reports terminal cancel/success race.
        if (TERMINAL.has(event.view.state)) {
          return applyJobView(model, event.view, { busy: false });
        }
        return model;
      }
      // Unknown server states already rejected by validator; map unknown → failed closed.
      if (!(HEADLESS_TERMINAL_PUBLIC_STATES as readonly string[]).includes(event.view.state)) {
        const mapped = mapJobStateToProduct(event.view.state);
        if (
          mapped === "failed" &&
          event.view.state !== "failed" &&
          !["queued", "rendering", "encoding", "validating", "uploading_artifact", "created", "materializing"].includes(
            event.view.state,
          )
        ) {
          return {
            state: "failed",
            ctx: {
              ...model.ctx,
              busy: false,
              safeMessage: "Server export returned an unexpected status.",
              clientErrorCode: "INVALID_RESPONSE",
              jobView: event.view,
              jobId: event.view.jobId,
            },
          };
        }
      }
      return applyJobView(model, event.view);
    }

    case "POLL_TRANSIENT_FAILURE": {
      if (isStale(model, event.runId)) return model;
      // Keep current state; advisory message only while active.
      if (TERMINAL.has(model.state)) return model;
      return {
        ...model,
        ctx: { ...model.ctx, safeMessage: event.message },
      };
    }

    case "REQUEST_CANCEL": {
      if (isStale(model, event.runId)) return model;
      if (TERMINAL.has(model.state)) return model;
      if (!model.ctx.jobId) {
        return {
          state: "cancelled",
          ctx: {
            ...model.ctx,
            busy: false,
            safeMessage: "Export cancelled.",
          },
        };
      }
      return {
        state: "cancelling",
        ctx: { ...model.ctx, busy: true },
      };
    }

    case "CANCEL_OK": {
      if (isStale(model, event.runId)) return model;
      return applyJobView(model, event.view, { busy: false });
    }

    case "CANCEL_FAILED": {
      if (isStale(model, event.runId)) return model;
      if (TERMINAL.has(model.state)) return model;
      return {
        ...model,
        state: model.ctx.jobView
          ? mapJobStateToProduct(model.ctx.jobView.state)
          : model.state === "cancelling"
            ? "queued"
            : model.state,
        ctx: {
          ...model.ctx,
          busy: Boolean(model.ctx.jobId) && !TERMINAL.has(model.state),
          safeMessage: event.message,
        },
      };
    }

    case "REQUEST_RETRY": {
      if (isStale(model, event.runId)) return model;
      if (model.state !== "failed" && model.state !== "expired") return model;
      return {
        state: "retrying",
        ctx: { ...model.ctx, busy: true, safeMessage: null },
      };
    }

    case "RETRY_OK": {
      if (isStale(model, event.runId)) return model;
      return applyJobView(model, event.view, {
        jobId: event.jobId,
        busy: !TERMINAL.has(event.view.state),
      });
    }

    case "RETRY_FAILED": {
      if (isStale(model, event.runId)) return model;
      return {
        state: "failed",
        ctx: {
          ...model.ctx,
          busy: false,
          safeMessage: event.message,
          clientErrorCode: "NOT_RETRYABLE",
        },
      };
    }

    case "RESTORE_JOB": {
      return {
        state: "materializing",
        ctx: {
          ...model.ctx,
          runId: event.runId,
          jobId: event.jobId,
          snapshot: event.snapshot,
          busy: true,
          safeMessage: null,
          clientErrorCode: null,
          renderer: "headless",
        },
      };
    }

    default:
      return model;
  }
}

export function isHeadlessProductTerminal(state: HeadlessProductState): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "expired" ||
    state === "unavailable" ||
    state === "idle"
  );
}

export function statusLabelForProductState(state: HeadlessProductState): string {
  switch (state) {
    case "checking_availability":
      return "Checking availability";
    case "unavailable":
      return "Unavailable";
    case "preparing":
      return "Preparing project";
    case "materializing":
      return "Verifying media";
    case "uploading":
      return "Uploading source media";
    case "creating_job":
      return "Starting secure render";
    case "queued":
      return "Waiting for render worker";
    case "rendering":
      return "Rendering video";
    case "encoding":
      return "Encoding video";
    case "validating":
      return "Checking finished video";
    case "uploading_artifact":
      return "Finalizing download";
    case "succeeded":
      return "Ready to download";
    case "failed":
      return "Failed";
    case "cancelling":
      return "Cancelling";
    case "cancelled":
      return "Cancelled";
    case "retrying":
      return "Retrying";
    case "expired":
      return "Expired";
    default:
      return "Ready";
  }
}

export function statusDescriptionForProductState(
  state: HeadlessProductState,
): string | null {
  switch (state) {
    case "preparing":
      return "Freezing the latest project settings for this export.";
    case "materializing":
      return "Checking narration, captions, and source media before upload.";
    case "uploading":
      return "Securely uploading the project assets needed by the render worker.";
    case "creating_job":
      return "Finalizing asset verification and creating the render job.";
    case "queued":
      return "Assets are ready. Waiting for the dedicated worker to accept the job.";
    case "rendering":
      return "The dedicated worker is capturing the video frames.";
    case "encoding":
      return "Frames are complete. Encoding video and audio.";
    case "validating":
      return "Checking the encoded file before it is published for download.";
    case "uploading_artifact":
      return "Saving the finished video and preparing the secure download.";
    case "succeeded":
      return "Server export complete. Download when ready.";
    case "cancelling":
      return "Stopping this export and cleaning its temporary assets.";
    case "retrying":
      return "Starting a fresh attempt with the same frozen project.";
    default:
      return null;
  }
}
