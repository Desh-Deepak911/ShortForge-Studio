import type { FootieScene } from "@/features/story/types";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline";

/** True when from/to form a currently adjacent ordered pair on the projected timeline. */
export function isSelectableSceneMediaTransitionPair(
  scene: FootieScene,
  fromItemId: string,
  toItemId: string,
): boolean {
  const from = typeof fromItemId === "string" ? fromItemId.trim() : "";
  const to = typeof toItemId === "string" ? toItemId.trim() : "";
  if (!from || !to || from === to) {
    return false;
  }
  const ids = projectSceneMediaTimeline(scene).items.map((item) => item.id);
  const fromIndex = ids.indexOf(from);
  return fromIndex >= 0 && ids[fromIndex + 1] === to;
}
