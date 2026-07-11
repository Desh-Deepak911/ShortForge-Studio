/**
 * Golden project definitions A–G (Sprint 6F).
 * Stable fixture descriptors — build manifests via buildExportGoldenManifest().
 */

import type { ExportGoldenId } from "./export-device-qa.types";

export interface ExportGoldenProjectDefinition {
  readonly id: ExportGoldenId;
  readonly title: string;
  readonly format: "webm" | "mp4" | "both";
  readonly resolution: "720p";
  readonly audioMode: "silent" | "voice" | "voice-with-music";
  readonly scenePlan: readonly {
    readonly id: string;
    readonly kind: "image" | "video";
    readonly durationMs: number;
    readonly subtitle: string;
  }[];
  readonly features: readonly string[];
  readonly primaryRegression: boolean;
}

export const EXPORT_GOLDEN_PROJECTS: readonly ExportGoldenProjectDefinition[] = [
  {
    id: "golden-a",
    title: "Image-Only Silent WebM",
    format: "webm",
    resolution: "720p",
    audioMode: "silent",
    scenePlan: [
      { id: "img-fit", kind: "image", durationMs: 3000, subtitle: "Fit framing caption" },
      { id: "img-fill", kind: "image", durationMs: 3000, subtitle: "Fill framing caption" },
      { id: "img-crop", kind: "image", durationMs: 4000, subtitle: "Final caption hold" },
    ],
    features: ["fit", "fill", "crop/position", "final caption", "silent"],
    primaryRegression: false,
  },
  {
    id: "golden-b",
    title: "Mixed Media + Voice WebM",
    format: "webm",
    resolution: "720p",
    audioMode: "voice",
    scenePlan: [
      { id: "img-1", kind: "image", durationMs: 3500, subtitle: "Opening image" },
      { id: "vid-1", kind: "video", durationMs: 4500, subtitle: "Trimmed video narrated" },
      { id: "img-2", kind: "image", durationMs: 3500, subtitle: "Image after video" },
    ],
    features: ["trimmed video", "fit image", "captions", "voiceover"],
    primaryRegression: false,
  },
  {
    id: "golden-c",
    title: "Mixed Media + Voice + Music WebM",
    format: "webm",
    resolution: "720p",
    audioMode: "voice-with-music",
    scenePlan: [
      { id: "img-1", kind: "image", durationMs: 4000, subtitle: "Motion open" },
      { id: "vid-1", kind: "video", durationMs: 5000, subtitle: "Video one" },
      { id: "img-2", kind: "image", durationMs: 4000, subtitle: "Transition mid" },
      { id: "vid-2", kind: "video", durationMs: 5000, subtitle: "Video two" },
      { id: "img-3", kind: "image", durationMs: 4000, subtitle: "Typewriter caption" },
      { id: "img-4", kind: "image", durationMs: 5000, subtitle: "Final caption near end" },
    ],
    features: [
      "motion",
      "transition",
      "captions",
      "ducking",
      "music fade",
      "final caption near end",
    ],
    primaryRegression: true,
  },
  {
    id: "golden-d",
    title: "Silent MP4",
    format: "mp4",
    resolution: "720p",
    audioMode: "silent",
    scenePlan: [
      { id: "img-1", kind: "image", durationMs: 3500, subtitle: "Silent fit" },
      { id: "vid-1", kind: "video", durationMs: 4000, subtitle: "Silent video" },
      { id: "img-2", kind: "image", durationMs: 3500, subtitle: "Silent motion" },
    ],
    features: ["fit/fill", "motion", "mp4 visual"],
    primaryRegression: false,
  },
  {
    id: "golden-e",
    title: "Voice MP4",
    format: "mp4",
    resolution: "720p",
    audioMode: "voice",
    scenePlan: [
      { id: "img-1", kind: "image", durationMs: 4000, subtitle: "Voice image" },
      { id: "vid-1", kind: "video", durationMs: 4500, subtitle: "Voice video" },
      { id: "img-2", kind: "image", durationMs: 4000, subtitle: "Final narration" },
    ],
    features: ["captions", "final narration", "aac mux"],
    primaryRegression: false,
  },
  {
    id: "golden-f",
    title: "Voice + Music MP4",
    format: "mp4",
    resolution: "720p",
    audioMode: "voice-with-music",
    scenePlan: [
      { id: "img-1", kind: "image", durationMs: 4000, subtitle: "Ducking start" },
      { id: "vid-1", kind: "video", durationMs: 5000, subtitle: "Music under video" },
      { id: "img-2", kind: "image", durationMs: 5000, subtitle: "Fade out close" },
    ],
    features: ["ducking", "fade", "motion", "transition", "mp4 full"],
    primaryRegression: false,
  },
  {
    id: "golden-g",
    title: "Full Stress Project",
    format: "both",
    resolution: "720p",
    audioMode: "voice-with-music",
    scenePlan: [
      { id: "g-img-1", kind: "image", durationMs: 3500, subtitle: "Stress open" },
      { id: "g-vid-1", kind: "video", durationMs: 4000, subtitle: "Stress video one" },
      { id: "g-img-2", kind: "image", durationMs: 3500, subtitle: "Highlight caption" },
      { id: "g-vid-2", kind: "video", durationMs: 4000, subtitle: "Stress video two" },
      { id: "g-img-3", kind: "image", durationMs: 3500, subtitle: "Fade caption" },
      { id: "g-img-4", kind: "image", durationMs: 3500, subtitle: "Typewriter mid" },
      { id: "g-vid-3", kind: "video", durationMs: 4000, subtitle: "Stress video three" },
      { id: "g-img-5", kind: "image", durationMs: 3500, subtitle: "Crop scene" },
      { id: "g-img-6", kind: "image", durationMs: 3500, subtitle: "Motion pan" },
      { id: "g-vid-4", kind: "video", durationMs: 4000, subtitle: "Stress video four" },
      { id: "g-img-7", kind: "image", durationMs: 4000, subtitle: "Transition dense" },
      { id: "g-img-8", kind: "image", durationMs: 4500, subtitle: "Final word near buffer" },
    ],
    features: [
      "long-run",
      "10–15 scenes",
      "3–5 videos",
      "motion",
      "transitions",
      "caption variants",
      "voice+music",
    ],
    primaryRegression: false,
  },
] as const;

export function getExportGoldenProject(
  id: ExportGoldenId,
): ExportGoldenProjectDefinition {
  const found = EXPORT_GOLDEN_PROJECTS.find((g) => g.id === id);
  if (!found) {
    throw new Error(`Unknown golden project: ${id}`);
  }
  return found;
}
