/**
 * Preview-owned blob URL retirement order:
 * 1. Story state changes
 * 2. Preview authority drops the removed media
 * 3. The old element unregisters its mounted source
 * 4. The owned blob URL is revoked on the next paint
 *
 * Non-owned URLs are never revoked. Repeated cleanup does not double-revoke.
 */

import { revokeOwnedBlobUrlIfPresent } from "@/features/timeline-editor/scene-media/blob-url-ownership";

const mountedPreviewSources = new Set<string>();
const pendingRevocations = new Map<string, () => void>();

export function registerMountedPreviewMediaSource(
  url: string | null | undefined,
): () => void {
  const source = typeof url === "string" ? url.trim() : "";
  if (!source) {
    return () => {};
  }
  mountedPreviewSources.add(source);
  return () => {
    mountedPreviewSources.delete(source);
  };
}

export function isPreviewMediaSourceMounted(url: string): boolean {
  return mountedPreviewSources.has(url);
}

export type PreviewBlobRevocationScheduler = (task: () => void) => () => void;

export function scheduleAfterNextPaint(
  task: () => void,
  raf: (cb: FrameRequestCallback) => number = globalThis.requestAnimationFrame,
  cancel: (id: number) => void = globalThis.cancelAnimationFrame,
): () => void {
  if (typeof raf !== "function") {
    task();
    return () => {};
  }
  let innerId: number | null = null;
  const outerId = raf(() => {
    innerId = raf(() => {
      innerId = null;
      task();
    });
  });
  return () => {
    if (typeof cancel === "function") {
      cancel(outerId);
      if (innerId != null) {
        cancel(innerId);
      }
    }
  };
}

export function scheduleOwnedPreviewBlobRevocation(input: {
  readonly url: string | undefined;
  readonly owned: Set<string>;
  readonly schedule?: PreviewBlobRevocationScheduler;
  readonly isSourceStillMounted?: (url: string) => boolean;
}): { readonly scheduled: boolean; readonly cancel: () => void } {
  const url = input.url?.trim();
  if (!url || !url.startsWith("blob:") || !input.owned.has(url)) {
    return { scheduled: false, cancel: () => {} };
  }

  pendingRevocations.get(url)?.();

  const schedule = input.schedule ?? scheduleAfterNextPaint;
  const isMounted = input.isSourceStillMounted ?? isPreviewMediaSourceMounted;
  const cancel = schedule(() => {
    pendingRevocations.delete(url);
    if (isMounted(url)) {
      return;
    }
    revokeOwnedBlobUrlIfPresent(url, input.owned);
  });
  pendingRevocations.set(url, cancel);
  return { scheduled: true, cancel };
}

export function revokeOwnedPreviewBlobUrlsAbsentFromReferences(input: {
  readonly owned: Set<string>;
  readonly referencedUrls: ReadonlySet<string>;
}): readonly string[] {
  const revoked: string[] = [];
  for (const url of [...input.owned]) {
    if (input.referencedUrls.has(url)) {
      continue;
    }
    pendingRevocations.get(url)?.();
    pendingRevocations.delete(url);
    if (revokeOwnedBlobUrlIfPresent(url, input.owned)) {
      revoked.push(url);
    }
  }
  return revoked;
}

export function collectScriptMediaUrls(script: {
  readonly scenes: ReadonlyArray<{
    readonly media?: { readonly url?: string };
    readonly mediaTimeline?: { readonly items: ReadonlyArray<{ readonly media: { readonly url?: string } }> };
    readonly visualSequence?: { readonly items: ReadonlyArray<{ readonly media?: { readonly url?: string } }> };
  }>;
}): Set<string> {
  const urls = new Set<string>();
  for (const scene of script.scenes) {
    if (scene.media?.url) urls.add(scene.media.url);
    for (const item of scene.mediaTimeline?.items ?? []) {
      if (item.media.url) urls.add(item.media.url);
    }
    for (const item of scene.visualSequence?.items ?? []) {
      if (item.media?.url) urls.add(item.media.url);
    }
  }
  return urls;
}
