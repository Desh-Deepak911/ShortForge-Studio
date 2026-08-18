/**
 * Idempotent Preview video retirement.
 * Cleanup errors are swallowed — they must never become terminal.
 */

export interface PreviewVideoRuntimeLike {
  paused: boolean;
  src: string;
  pause: () => void;
  removeAttribute: (name: string) => void;
  load?: () => void;
}

export interface RetirePreviewVideoRuntimeInput {
  readonly video: PreviewVideoRuntimeLike | null;
  readonly seekRafId: number | null;
  readonly paintRafId: number | null;
  readonly cancelAnimationFrame?: (handle: number) => void;
  readonly removeVisibilityListener?: () => void;
  readonly clearSource: boolean;
}

export interface RetirePreviewVideoRuntimeResult {
  readonly seekRafId: null;
  readonly paintRafId: null;
  readonly sourceCleared: boolean;
  readonly paused: boolean;
}

function safe(run: () => void): void {
  try {
    run();
  } catch {
    // Retirement must stay non-terminal during rapid add/remove/reorder.
  }
}

export function retirePreviewVideoRuntime(
  input: RetirePreviewVideoRuntimeInput,
): RetirePreviewVideoRuntimeResult {
  const cancel = input.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
  if (input.seekRafId != null && typeof cancel === "function") {
    safe(() => cancel(input.seekRafId as number));
  }
  if (input.paintRafId != null && typeof cancel === "function") {
    safe(() => cancel(input.paintRafId as number));
  }
  if (input.removeVisibilityListener) {
    safe(input.removeVisibilityListener);
  }

  let paused = false;
  const video = input.video;
  if (video) {
    safe(() => {
      if (!video.paused) {
        video.pause();
      }
    });
    paused = true;
    if (input.clearSource) {
      safe(() => {
        video.removeAttribute("src");
        if (typeof video.load === "function") {
          video.load();
        } else {
          video.src = "";
        }
      });
    }
  }

  return {
    seekRafId: null,
    paintRafId: null,
    sourceCleared: Boolean(input.clearSource && video),
    paused,
  };
}
