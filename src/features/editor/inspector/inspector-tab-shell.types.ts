export type InspectorTabId = "scene" | "project";

export type SceneInspectorGroupId = "general" | "image" | "caption" | "transition" | "assets";

export const INSPECTOR_TAB_LABELS: Record<InspectorTabId, string> = {
  scene: "Scene",
  project: "Project",
};

export const SCENE_INSPECTOR_GROUP_LABELS: Record<
  SceneInspectorGroupId,
  { title: string; description: string }
> = {
  general: {
    title: "General",
    description: "Timing and narration for this scene.",
  },
  image: {
    title: "Image",
    description: "Upload, frame, zoom, motion, and position.",
  },
  caption: {
    title: "Caption",
    description: "Layout, style, and animation.",
  },
  transition: {
    title: "Transition",
    description: "Effect to the next scene.",
  },
  assets: {
    title: "Assets",
    description: "Creator Asset Studio recommendations.",
  },
};

export const SCENE_INSPECTOR_GROUP_DEFAULT_OPEN: Record<SceneInspectorGroupId, boolean> = {
  general: true,
  image: true,
  caption: false,
  transition: false,
  assets: false,
};
