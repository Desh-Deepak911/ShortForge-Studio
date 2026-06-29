"use client";

import { useEditorSelectionOptional } from "@/features/editor/selection";
import { studioContextRibbon } from "@/lib/utils/studioUi";

import type { RibbonContextId, StudioContextRibbonProps } from "./ribbonContext.types";

function resolveRibbonContent(
  contextId: RibbonContextId,
  renderers: StudioContextRibbonProps["renderers"],
  children: StudioContextRibbonProps["children"],
) {
  switch (contextId) {
    case "image":
      return renderers?.image ?? children ?? null;
    case "scene":
      return renderers?.scene ?? null;
    case "caption":
      return renderers?.caption ?? null;
    case "transition":
      return renderers?.transition ?? null;
    case "audio":
      return renderers?.audio ?? null;
    case "project":
      return renderers?.project ?? null;
    case "unknown":
    default:
      return null;
  }
}

/**
 * Context-aware quick-action bar above the editor canvas.
 * Visibility and active context come from SelectionContext only.
 */
export default function StudioContextRibbon({
  renderers,
  children,
}: StudioContextRibbonProps) {
  const selection = useEditorSelectionOptional();

  if (!selection?.ribbonVisible || !selection.ribbonContextId) {
    return null;
  }

  const contextId = selection.ribbonContextId;
  const content = resolveRibbonContent(contextId, renderers, children);

  if (!content) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label="Canvas context actions"
      data-ribbon-context={contextId}
      className={studioContextRibbon}
    >
      {content}
    </div>
  );
}
