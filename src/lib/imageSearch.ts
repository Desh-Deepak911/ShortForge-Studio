import type { FootieScene } from "@/types/footiebitz";

export function getSceneImageSearchQuery(scene: FootieScene): string {
  return (scene.imageSearchQuery ?? scene.imagePrompt).trim();
}
