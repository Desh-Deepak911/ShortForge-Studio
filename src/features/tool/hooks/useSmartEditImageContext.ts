"use client";

import { useParams, usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

import { useEditorSelectionOptional } from "@/features/editor/selection";
import type { SmartEditImageToolUrlInput } from "@/lib/utils/smart-image-tool.utils";

import {
  resolveClientSmartEditReturnTo,
  resolveInitialSmartEditReturnTo,
} from "./smart-edit-return-to";

function resolveDraftIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/editor\/([^/]+)/);
  return match?.[1];
}

function subscribeToBrowserLocation(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("hashchange", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("hashchange", onStoreChange);
  };
}

/**
 * Resolves Smart Edit URL context from the current editor route and selection.
 *
 * `returnTo` uses `useSyncExternalStore` so the server snapshot and the first
 * client render share the deterministic pathname, then the store reads the full
 * `window.location.href` after hydration — no browser location access during
 * the initial render.
 */
export function useSmartEditImageContext(
  sceneIdOverride?: string,
): SmartEditImageToolUrlInput {
  const pathname = usePathname();
  const params = useParams<{ draftId?: string }>();
  const selection = useEditorSelectionOptional();

  const draftId = params.draftId ?? resolveDraftIdFromPathname(pathname);
  const sceneId = sceneIdOverride ?? selection?.selectedSceneId ?? undefined;

  const initialReturnTo = resolveInitialSmartEditReturnTo(pathname);
  const returnTo = useSyncExternalStore(
    subscribeToBrowserLocation,
    () => resolveClientSmartEditReturnTo(initialReturnTo),
    () => initialReturnTo,
  );

  return useMemo(
    () => ({
      returnTo,
      ...(draftId ? { draftId } : {}),
      ...(sceneId ? { sceneId } : {}),
    }),
    [draftId, returnTo, sceneId],
  );
}
