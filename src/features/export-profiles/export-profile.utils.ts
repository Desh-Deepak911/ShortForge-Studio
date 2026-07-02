import type { FootieScript } from "@/features/story/types";
import {
  normalizeExportSettings,
  slugifyStoryTitle,
  type ExportSettings,
} from "@/features/export/utils/export-settings.utils";

import {
  DEFAULT_EXPORT_PROFILE_ID,
  getExportProfileFromRegistry,
  getExportProfileRegistry,
} from "./export-profile.registry";
import type {
  PlatformExportNotice,
  PlatformExportPreset,
  PlatformExportPresetId,
} from "./export-profile.types";

function cloneExportProfile(profile: PlatformExportPreset): PlatformExportPreset {
  return structuredClone(profile);
}

/** Returns a built-in export profile for a known id, otherwise null. */
export function getExportProfile(id: unknown): PlatformExportPreset | null {
  if (typeof id !== "string") {
    return null;
  }

  const profile = getExportProfileFromRegistry(id);
  return profile ? cloneExportProfile(profile) : null;
}

/** Returns copies of all built-in export profiles. */
export function getExportProfiles(): PlatformExportPreset[] {
  return getExportProfileRegistry().map((profile) => cloneExportProfile(profile));
}

/** Type guard for known export profile ids. */
export function isExportProfileId(value: unknown): value is PlatformExportPresetId {
  return getExportProfile(value) !== null;
}

/** Resolves the active profile id — defaults to generic when omitted. */
export function resolveExportProfileId(
  settings: Pick<ExportSettings, "exportProfileId"> | undefined,
): PlatformExportPresetId {
  const id = settings?.exportProfileId;
  if (id && isExportProfileId(id)) {
    return id;
  }
  return DEFAULT_EXPORT_PROFILE_ID;
}

function applyFileNamingPattern(pattern: string, slug: string): string {
  return pattern.replace(/\{slug\}/g, slug);
}

/** Builds a suggested base file name (no extension) from a profile naming pattern. */
export function buildExportFileName(
  profile: PlatformExportPreset,
  script: Pick<FootieScript, "title">,
): string {
  const slug = slugifyStoryTitle(script.title);
  return applyFileNamingPattern(profile.fileNamingPattern, slug);
}

/** Applies profile recommended settings while preserving user-overridable fields safely. */
export function applyExportProfileToSettings(
  settings: ExportSettings,
  profile: PlatformExportPreset,
  script?: Pick<FootieScript, "title">,
): ExportSettings {
  const nextFileName = script ? buildExportFileName(profile, script) : settings.fileName;

  return normalizeExportSettings(
    {
      ...settings,
      ...profile.recommendedSettings,
      exportProfileId: profile.id,
      fileName: nextFileName,
    },
    script?.title,
  );
}

/** Returns non-blocking notices for the export panel. */
export function getExportProfileNotices(
  profile: PlatformExportPreset | null | undefined,
  script?: Pick<FootieScript, "totalDuration">,
): PlatformExportNotice[] {
  if (!profile) {
    return [];
  }

  const notices: PlatformExportNotice[] = [];

  notices.push({
    id: `${profile.id}-format`,
    kind: "format",
    message: `${profile.label}: ${profile.aspectRatio} · ${profile.resolution} · ${profile.fps} fps · ~${profile.bitrateHintMbps} Mbps (high tier).`,
  });

  for (const [index, message] of profile.safeAreaNotices.entries()) {
    notices.push({
      id: `${profile.id}-safe-area-${index}`,
      kind: "safe_area",
      message,
    });
  }

  if (script && script.totalDuration > profile.maxDurationSec) {
    notices.push({
      id: `${profile.id}-duration`,
      kind: "duration",
      message: `This story is ~${Math.round(script.totalDuration)}s — ${profile.label} recommends ${profile.maxDurationSec}s or less for best platform treatment.`,
    });
  }

  for (const [index, message] of profile.manualUploadNotes.entries()) {
    notices.push({
      id: `${profile.id}-upload-${index}`,
      kind: "upload",
      message,
    });
  }

  return notices;
}

/** Settings that match legacy generic defaults (no profile id required). */
export function getGenericExportProfileDefaults(): ExportSettings {
  const generic = getExportProfile(DEFAULT_EXPORT_PROFILE_ID);
  if (!generic) {
    return normalizeExportSettings(undefined);
  }

  return normalizeExportSettings({
    ...generic.recommendedSettings,
    exportProfileId: generic.id,
  });
}
