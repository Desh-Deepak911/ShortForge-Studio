export type InspectorTabId = "scene" | "audio" | "project";

export type SceneInspectorGroupId =
  "general" | "image" | "caption" | "transition" | "assets";
export type SceneInspectorWorkspaceId =
  "media" | "adjust" | "caption" | "timing" | "transition" | "assets";

export const INSPECTOR_TAB_LABELS: Record<InspectorTabId, string> = {
  scene: "Scene",
  audio: "Audio",
  project: "Project",
};

export const SCENE_INSPECTOR_GROUP_LABELS: Record<
  SceneInspectorGroupId,
  { title: string; description: string }
> = {
  general: {
    title: "General",
    description: "",
  },
  image: {
    title: "Media",
    description: "",
  },
  caption: {
    title: "Caption",
    description: "",
  },
  transition: {
    title: "Transition",
    description: "",
  },
  assets: {
    title: "Assets",
    description: "",
  },
};

export const SCENE_INSPECTOR_GROUP_DEFAULT_OPEN: Record<
  SceneInspectorGroupId,
  boolean
> = {
  general: true,
  image: true,
  caption: false,
  transition: false,
  assets: false,
};
