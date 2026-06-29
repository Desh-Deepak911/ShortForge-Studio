"use client";

import { Sparkles } from "lucide-react";

import { useSmartEditImageContext } from "@/features/tool/hooks/useSmartEditImageContext";
import {
  buildSmartEditImageToolUrl,
  openSmartEditImageTool,
  type SmartEditImageToolUrlInput,
} from "@/lib/utils/smart-image-tool.utils";
import { studioCompactButton, studioSubtleText } from "@/lib/utils/studioUi";

export const SMART_EDIT_HAS_IMAGE_COPY =
  "Edit the image in the tool, download it, then replace the image in this scene.";

export const SMART_EDIT_NO_IMAGE_COPY =
  "Create or edit an image in the tool, download it, then attach it to this scene.";

export function smartEditButtonLabel(hasImage: boolean): string {
  return hasImage ? "Smart Edit" : "Edit image first";
}

export interface SmartEditImageActionProps {
  /** When true, labels the action as editing an attached scene image. */
  hasImage?: boolean;
  /** Render only the button — for action rows and ribbon-adjacent layouts. */
  buttonOnly?: boolean;
  /** When set, scopes sceneId instead of the current editor selection. */
  sceneId?: string;
}

/**
 * Opens the external Smart Image Tool directly with editor context.
 * No automatic image handoff — users download and replace manually.
 */
export default function SmartEditImageAction({
  hasImage = false,
  buttonOnly = false,
  sceneId,
}: SmartEditImageActionProps) {
  const smartEditContext = useSmartEditImageContext(sceneId);
  const label = smartEditButtonLabel(hasImage);
  const helperCopy = hasImage ? SMART_EDIT_HAS_IMAGE_COPY : SMART_EDIT_NO_IMAGE_COPY;
  const toolUrl = buildSmartEditImageToolUrl(smartEditContext);

  const button = (
    <a
      href={toolUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={studioCompactButton}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
      {label}
    </a>
  );

  if (buttonOnly) {
    return button;
  }

  return (
    <div className="space-y-2">
      <p className={studioSubtleText}>{helperCopy}</p>
      {button}
    </div>
  );
}

export function openSmartEditImageToolFromContext(context: SmartEditImageToolUrlInput): void {
  openSmartEditImageTool(context);
}
