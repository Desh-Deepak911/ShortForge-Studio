/**
 * Immutable project-level brand-sting authoring commands.
 * Never invents a FootieScene and never mutates narration/media timing.
 */

import type { FootieScript } from "@/features/story/types";
import type {
  ShortForgeBrandStingV1,
  VisualRetentionProjectExtensionsV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  BRAND_STING_DEFAULT_DURATION_MS,
  type BrandStingDurationMs,
  isBrandStingDurationMs,
} from "../domain/brand-sting.presets";
import {
  createDefaultShortForgeBrandSting,
  getShortForgeBrandSting,
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Structural clone only. Brand Sting commands must not run the engagement
 * overlay normalizer — that would inject size/scale onto legacy overlays.
 */
function cloneScript(script: FootieScript): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({ ...scene })),
    ...(script.visualRetentionExtensions
      ? {
          visualRetentionExtensions: cloneJson(script.visualRetentionExtensions),
        }
      : {}),
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

function hasNonBrandStingExtensionData(
  extensions: VisualRetentionProjectExtensionsV1,
): boolean {
  return Object.entries(extensions).some(
    ([key, value]) =>
      key !== "version" && key !== "shortForgeBrandSting" && value != null,
  );
}

function withBrandSting(
  script: FootieScript,
  brandSting: ShortForgeBrandStingV1 | undefined,
): FootieScript {
  const base = cloneScript(script);
  const current: {
    version: 1;
    engagementOverlaysBySceneId?: VisualRetentionProjectExtensionsV1["engagementOverlaysBySceneId"];
    shortForgeBrandSting?: ShortForgeBrandStingV1;
  } = base.visualRetentionExtensions
    ? { ...base.visualRetentionExtensions }
    : { version: 1 };

  if (brandSting) {
    current.shortForgeBrandSting = brandSting;
  } else {
    delete current.shortForgeBrandSting;
  }

  if (!brandSting && !hasNonBrandStingExtensionData(current)) {
    const next = { ...base };
    delete next.visualRetentionExtensions;
    return next;
  }
  return { ...base, visualRetentionExtensions: current };
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
