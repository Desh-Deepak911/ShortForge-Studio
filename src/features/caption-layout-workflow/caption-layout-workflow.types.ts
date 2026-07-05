import type { CaptionLayout } from "@/features/caption-layout";

/** Layout fields copied by caption layout workflow actions. */
export type CopyableCaptionLayout = Pick<
  CaptionLayout,
  | "version"
  | "anchor"
  | "textAlign"
  | "offsetX"
  | "offsetY"
  | "maxWidthPercent"
  | "backgroundOpacity"
  | "safeAreaEnabled"
>;

export interface CaptionLayoutWorkflowContext {
  hasClipboard: boolean;
  canCopyPrevious: boolean;
  previousSceneIndex: number | null;
}
