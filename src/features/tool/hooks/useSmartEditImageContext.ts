"use client";

import { useParams, usePathname } from "next/navigation";
import { useMemo } from "react";

import { useEditorSelectionOptional } from "@/features/editor/selection";
import type { SmartEditImageToolUrlInput } from "@/lib/utils/smart-image-tool.utils";

function resolveDraftIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/editor\/([^/]+)/);
  return match?.[1];
}

/**
 * Resolves Smart Edit URL context from the current editor route and selection.
 */
export function useSmartEditImageContext(sceneIdOverride?: string): SmartEditImageToolUrlInput {
  const pathname = usePathname();
  const params = useParams<{ draftId?: string }>();
  const selection = useEditorSelectionOptional();

  const draftId = params.draftId ?? resolveDraftIdFromPathname(pathname);
  const sceneId = sceneIdOverride ?? selection?.selectedSceneId ?? undefined;
  const returnTo = typeof window !== "undefined" ? window.location.href : "";

  return useMemo(
    () => ({
      returnTo,
      ...(draftId ? { draftId } : {}),
      ...(sceneId ? { sceneId } : {}),
    }),
    [draftId, returnTo, sceneId],
  );
}
