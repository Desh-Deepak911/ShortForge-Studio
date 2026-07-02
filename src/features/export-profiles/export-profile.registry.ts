import type { PlatformExportPreset, PlatformExportPresetId } from "./export-profile.types";

export const EXPORT_PROFILE_IDS: readonly PlatformExportPresetId[] = [
  "generic_mp4",
  "youtube_shorts",
  "instagram_reels",
  "x_video",
] as const;

export const DEFAULT_EXPORT_PROFILE_ID: PlatformExportPresetId = "generic_mp4";

const PLATFORM_MP4_SETTINGS = {
  format: "mp4" as const,
  quality: "high" as const,
  resolution: "1080x1920" as const,
};

const BUILT_IN_EXPORT_PROFILES: readonly PlatformExportPreset[] = [
  {
    id: "generic_mp4",
    platform: "generic",
    label: "Generic MP4",
    description: "Default export — same behavior as before platform presets.",
    recommendedSettings: {
      format: "webm",
      quality: "high",
      resolution: "1080x1920",
    },
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    bitrateHintMbps: 8,
    maxDurationSec: 180,
    safeAreaNotices: [],
    fileNamingPattern: "{slug}",
    manualUploadNotes: ["Download the file and upload to any platform manually."],
  },
  {
    id: "youtube_shorts",
    platform: "youtube_shorts",
    label: "YouTube Shorts",
    description: "Vertical MP4 tuned for Shorts upload — add #Shorts in YouTube Studio.",
    recommendedSettings: PLATFORM_MP4_SETTINGS,
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    bitrateHintMbps: 8,
    maxDurationSec: 180,
    safeAreaNotices: [
      "Keep key text and faces in the central 4:5 safe area — Shorts UI overlays the bottom edge.",
      "Include #Shorts in the YouTube title or description when uploading.",
    ],
    fileNamingPattern: "youtube-{slug}",
    manualUploadNotes: [
      "Upload the MP4 in YouTube Studio or the mobile app as a Short.",
      "Paste your title and add #Shorts in the description if needed.",
    ],
  },
  {
    id: "instagram_reels",
    platform: "instagram_reels",
    label: "Instagram Reels",
    description: "Vertical MP4 for Reels — caption and hashtags are added in Instagram.",
    recommendedSettings: PLATFORM_MP4_SETTINGS,
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    bitrateHintMbps: 8,
    maxDurationSec: 90,
    safeAreaNotices: [
      "Keep captions and faces above the bottom 20% — Reels UI covers the lower edge.",
      "Username and audio pill appear at the top — avoid critical text in the top 10%.",
    ],
    fileNamingPattern: "reels-{slug}",
    manualUploadNotes: [
      "Upload from the Instagram app as a Reel.",
      "Paste your caption and hashtags in Instagram — not in the video file.",
    ],
  },
  {
    id: "x_video",
    platform: "x_video",
    label: "X Video",
    description: "Vertical MP4 for an X video post — write a short hook in the post text.",
    recommendedSettings: PLATFORM_MP4_SETTINGS,
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    bitrateHintMbps: 8,
    maxDurationSec: 140,
    safeAreaNotices: [
      "X crops aggressively in timeline — keep hooks in the center third.",
      "Post text is limited to 280 characters — use a short hook, not the full script.",
    ],
    fileNamingPattern: "x-{slug}",
    manualUploadNotes: [
      "Create a new post on X and attach this MP4.",
      "Write a short hook in the post — full narration is too long for a tweet.",
    ],
  },
];

const PROFILE_BY_ID = new Map<string, PlatformExportPreset>(
  BUILT_IN_EXPORT_PROFILES.map((profile) => [profile.id, profile]),
);

/** Returns all built-in export profiles in registry order. */
export function getExportProfileRegistry(): readonly PlatformExportPreset[] {
  return BUILT_IN_EXPORT_PROFILES;
}

/** Returns a built-in profile when the id is known. */
export function getExportProfileFromRegistry(id: string): PlatformExportPreset | undefined {
  return PROFILE_BY_ID.get(id.trim().toLowerCase() as PlatformExportPresetId);
}
