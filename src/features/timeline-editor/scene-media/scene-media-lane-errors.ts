/**
 * Safe, user-facing lane error codes — no URLs, paths, stacks, or payloads.
 */

export type SceneMediaLaneErrorCode =
  | "unsupported_image"
  | "scene_too_short"
  | "rejected_edit";

export const SCENE_MEDIA_LANE_ERROR_MESSAGES: Record<SceneMediaLaneErrorCode, string> = {
  unsupported_image: "Only image files can be added.",
  scene_too_short:
    "This scene cannot fit another media item at the current timing.",
  rejected_edit: "That media edit could not be applied.",
};

export function resolveSceneMediaLaneErrorCode(error: unknown): SceneMediaLaneErrorCode {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/only image|image files|image media/i.test(message)) {
    return "unsupported_image";
  }
  if (/too short|minimum|500\s*ms|min item/i.test(message)) {
    return "scene_too_short";
  }
  return "rejected_edit";
}

export function resolveSceneMediaLaneErrorMessage(error: unknown): string {
  return SCENE_MEDIA_LANE_ERROR_MESSAGES[resolveSceneMediaLaneErrorCode(error)];
}

/** True when a message is safe to show (no URL/path/stack leakage). */
export function isSafeSceneMediaLaneErrorMessage(message: string): boolean {
  if (!message || message.length > 200) {
    return false;
  }
  if (/https?:\/\//i.test(message)) {
    return false;
  }
  if (/blob:/i.test(message)) {
    return false;
  }
  if (/\/Users\/|\/home\/|\\\\/.test(message)) {
    return false;
  }
  if (/at\s+\S+\s+\(/i.test(message) || /stack/i.test(message)) {
    return false;
  }
  return Object.values(SCENE_MEDIA_LANE_ERROR_MESSAGES).includes(message);
}
