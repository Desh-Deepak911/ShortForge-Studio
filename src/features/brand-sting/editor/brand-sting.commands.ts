/**
 * Immutable project-level brand-sting authoring commands.
 * Never invents a FootieScene and never mutates narration/media timing.
 */

import type { FootieScript } from "@/features/story/types";
import type {
  ShortForgeBrandStingV1,
  VisualRetentionProjectExtensionsV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";
import { normalizeVisualRetentionProjectExtensions } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";

import {
  BRAND_STING_DEFAULT_DURATION_MS,
  type BrandStingDurationMs,
  isBrandStingDurationMs,
} from "../domain/brand-sting.presets";
import {
  createDefaultShortForgeBrandSting,
  getShortForgeBrandSting,
  normalizeShortForgeBrandSting,
} from "../domain/normalize-brand-sting";

export type BrandStingCommandStatus = "ok" | "recoverable" | "terminal";

export interface BrandStingCommandOptions {
  readonly shortForgeBrandStingEnabled?: boolean;
}

export interface BrandStingCommandResult {
  readonly status: BrandStingCommandStatus;
  readonly script: FootieScript;
  readonly brandSting: ShortForgeBrandStingV1 | undefined;
  readonly warnings: readonly string[];
  readonly message?: string;
  readonly focusTarget?: "add" | "duration" | "remove";
}

export const BRAND_STING_CAPABILITY_OFF_MESSAGE =
  "ShortForge Studio outro is turned off for this project.";

export const BRAND_STING_DURATION_INVALID_MESSAGE =
  "Choose 2s, 2.5s, or 3s for the ShortForge Studio outro.";

function cloneScript(script: FootieScript): FootieScript {
  const normalized = normalizeVisualRetentionProjectExtensions(
    script.visualRetentionExtensions,
    script.scenes.map((scene) => scene.id),
  );
  // Re-normalize sting with the dedicated fail-closed normalizer so malformed
  // sting never blocks open, while overlays stay byte-stable when valid.
  let extensions = normalized;
  if (normalized?.shortForgeBrandSting) {
    const sting = normalizeShortForgeBrandSting(normalized.shortForgeBrandSting);
    if (sting) {
      extensions = { ...normalized, shortForgeBrandSting: sting };
    } else {
      const next = { ...normalized };
      delete next.shortForgeBrandSting;
      extensions =
        next.engagementOverlaysBySceneId != null ? next : undefined;
    }
  }
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({ ...scene })),
    ...(extensions ? { visualRetentionExtensions: extensions } : {}),
  };
}

function refuseCapability(
  script: FootieScript,
  options?: BrandStingCommandOptions,
): BrandStingCommandResult | null {
  if (options?.shortForgeBrandStingEnabled !== true) {
    return {
      status: "terminal",
      script: cloneScript(script),
      brandSting: undefined,
      warnings: [],
      message: BRAND_STING_CAPABILITY_OFF_MESSAGE,
      focusTarget: "add",
    };
  }
  return null;
}

function withBrandSting(
  script: FootieScript,
  brandSting: ShortForgeBrandStingV1 | undefined,
): FootieScript {
  const base = cloneScript(script);
  const overlays = base.visualRetentionExtensions?.engagementOverlaysBySceneId;
  const extensions: VisualRetentionProjectExtensionsV1 | undefined =
    brandSting || overlays
      ? {
          version: 1,
          ...(overlays ? { engagementOverlaysBySceneId: overlays } : {}),
          ...(brandSting ? { shortForgeBrandSting: brandSting } : {}),
        }
      : undefined;
  const next = { ...base };
  if (extensions) {
    next.visualRetentionExtensions = extensions;
  } else {
    delete next.visualRetentionExtensions;
  }
  return next;
}

export function enableBrandSting(
  script: FootieScript,
  options?: BrandStingCommandOptions,
): BrandStingCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;

  const existing = getShortForgeBrandSting(script.visualRetentionExtensions);
  const brandSting =
    existing && existing.enabled
      ? existing
      : createDefaultShortForgeBrandSting(BRAND_STING_DEFAULT_DURATION_MS);
  const enabled = existing?.enabled
    ? brandSting
    : { ...brandSting, enabled: true as const };
  const next = withBrandSting(script, enabled);
  return {
    status: "ok",
    script: next,
    brandSting: getShortForgeBrandSting(next.visualRetentionExtensions),
    warnings: [],
    focusTarget: "duration",
  };
}

export function setBrandStingDurationMs(
  script: FootieScript,
  durationMs: number,
  options?: BrandStingCommandOptions,
): BrandStingCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;

  if (!isBrandStingDurationMs(durationMs)) {
    return {
      status: "recoverable",
      script: cloneScript(script),
      brandSting: getShortForgeBrandSting(script.visualRetentionExtensions),
      warnings: [],
      message: BRAND_STING_DURATION_INVALID_MESSAGE,
      focusTarget: "duration",
    };
  }

  const existing = getShortForgeBrandSting(script.visualRetentionExtensions);
  if (!existing || !existing.enabled) {
    const created = createDefaultShortForgeBrandSting(
      durationMs as BrandStingDurationMs,
    );
    const next = withBrandSting(script, created);
    return {
      status: "ok",
      script: next,
      brandSting: getShortForgeBrandSting(next.visualRetentionExtensions),
      warnings: [],
      focusTarget: "duration",
    };
  }

  const updated: ShortForgeBrandStingV1 = {
    ...existing,
    durationMs: durationMs as BrandStingDurationMs,
  };
  const next = withBrandSting(script, updated);
  return {
    status: "ok",
    script: next,
    brandSting: getShortForgeBrandSting(next.visualRetentionExtensions),
    warnings: [],
    focusTarget: "duration",
  };
}

export function disableBrandSting(
  script: FootieScript,
  options?: BrandStingCommandOptions,
): BrandStingCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;

  const next = withBrandSting(script, undefined);
  return {
    status: "ok",
    script: next,
    brandSting: undefined,
    warnings: [],
    focusTarget: "add",
  };
}
