/**
 * Sprint 11D Phase 3.1B — provider/profile worker-limit authority.
 *
 * Ownership:
 * - Profile-bounded resources: maxFrames, maxSingleFrameBytes,
 *   maxAggregateFrameBytes, maxWorkspaceBytes, maxArtifactBytes
 * - Provider/operator-owned: jobTimeoutMs, maxStderrBytes, claimLeaseMs,
 *   processGraceMs, evaluateTimeoutMs, asset/audio/bundle limits
 *
 * Effective resource ceiling = min(canonical profile, configured provider).
 * A profile may narrow capacity; it must never widen explicit provider capacity.
 * Provider capacity below the selected profile’s operational contract → reject
 * before Chromium (UNSUPPORTED_CAPABILITY). No silent reduced-capacity profile.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import type { HeadlessOutputProfile } from "./output-profiles";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "./worker-types";

/** Resource fields governed by both profile and provider (intersected via min). */
export const HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS = [
  "maxFrames",
  "maxSingleFrameBytes",
  "maxAggregateFrameBytes",
  "maxWorkspaceBytes",
  "maxArtifactBytes",
] as const;

export type HeadlessProfileBoundedLimitKey =
  (typeof HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS)[number];

/** Runtime/operator fields — never overwritten by profile maxima. */
export const HEADLESS_PROVIDER_OWNED_LIMIT_KEYS = [
  "jobTimeoutMs",
  "maxStderrBytes",
  "claimLeaseMs",
  "processGraceMs",
  "evaluateTimeoutMs",
  "maxTotalAssetBytes",
  "maxGeneratedBundleBytes",
  "maxSingleAudioAssetBytes",
  "maxAggregateAudioBytes",
  "maxIntermediateAudioBytes",
] as const;

export type HeadlessProviderOwnedLimitKey =
  (typeof HEADLESS_PROVIDER_OWNED_LIMIT_KEYS)[number];

const ALL_LIMIT_KEYS = [
  ...HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS,
  ...HEADLESS_PROVIDER_OWNED_LIMIT_KEYS,
] as const satisfies readonly (keyof HeadlessWorkerLimits)[];

function isSafePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function asSafePositiveInt(
  value: unknown,
  label: string,
):
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string } {
  if (!isSafePositiveInt(value)) {
    return {
      ok: false,
      message: `Invalid worker limit ${label}: require safe positive integer.`,
    };
  }
  return { ok: true, value };
}

function minPositiveSafe(a: number, b: number): number | null {
  if (!isSafePositiveInt(a) || !isSafePositiveInt(b)) return null;
  return a < b ? a : b;
}

/**
 * Provider defaults large enough to host every canonical local profile
 * (including 60s 720p/1080p/4K streamed operational contracts).
 * Alias of DEFAULT_HEADLESS_WORKER_LIMITS after Phase 3.2 capacity sizing.
 */
export const HEADLESS_PROVIDER_CAPACITY_DEFAULTS: HeadlessWorkerLimits =
  DEFAULT_HEADLESS_WORKER_LIMITS;

export function mergeValidatedDefaultsAndOverrides(input: {
  readonly defaults?: HeadlessWorkerLimits;
  readonly overrides?: Partial<HeadlessWorkerLimits> | null;
}):
  | { readonly ok: true; readonly capacity: HeadlessWorkerLimits }
  | { readonly ok: false; readonly message: string } {
  const defaults = input.defaults ?? HEADLESS_PROVIDER_CAPACITY_DEFAULTS;
  const overrides = input.overrides ?? {};

  const merged: Record<string, number> = {};
  for (const key of ALL_LIMIT_KEYS) {
    const raw =
      overrides[key] !== undefined ? overrides[key] : defaults[key];
    const parsed = asSafePositiveInt(raw, key);
    if (!parsed.ok) return parsed;
    merged[key] = parsed.value;
  }

  return {
    ok: true,
    capacity: deepFreezeHeadlessValue(merged as unknown as HeadlessWorkerLimits),
  };
}

/**
 * Intersect profile resource ceilings with provider capacity.
 * Does not mutate inputs. Returns a detached frozen object.
 * Does not assert provider can host the profile — use assertProviderCapacityForProfile.
 */
export function intersectProfileAndProviderLimits(
  profile: HeadlessOutputProfile,
  providerCapacity: HeadlessWorkerLimits,
):
  | { readonly ok: true; readonly limits: HeadlessWorkerLimits }
  | { readonly ok: false; readonly message: string } {
  const effective: Record<string, number> = {};

  for (const key of HEADLESS_PROVIDER_OWNED_LIMIT_KEYS) {
    const parsed = asSafePositiveInt(providerCapacity[key], key);
    if (!parsed.ok) return parsed;
    effective[key] = parsed.value;
  }

  for (const key of HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS) {
    const profileValue = profile[key];
    const providerValue = providerCapacity[key];
    const profileParsed = asSafePositiveInt(profileValue, `profile.${key}`);
    if (!profileParsed.ok) return profileParsed;
    const providerParsed = asSafePositiveInt(providerValue, `provider.${key}`);
    if (!providerParsed.ok) return providerParsed;
    const next = minPositiveSafe(profileParsed.value, providerParsed.value);
    if (next == null) {
      return { ok: false, message: `Invalid intersected worker limit ${key}.` };
    }
    effective[key] = next;
  }

  return {
    ok: true,
    limits: deepFreezeHeadlessValue(effective as unknown as HeadlessWorkerLimits),
  };
}

/**
 * Provider must meet or exceed every profile-bounded operational ceiling.
 * Prefer rejecting the canonical profile over silent reduced-capacity claims.
 */
export function assertProviderCapacityForProfile(input: {
  readonly profile: HeadlessOutputProfile;
  readonly providerCapacity: HeadlessWorkerLimits;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string } {
  for (const key of HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS) {
    const profileValue = input.profile[key];
    const providerValue = input.providerCapacity[key];
    if (!isSafePositiveInt(profileValue) || !isSafePositiveInt(providerValue)) {
      return {
        ok: false,
        message: `Invalid capacity comparison for ${key}.`,
      };
    }
    if (providerValue < profileValue) {
      return {
        ok: false,
        message: `Provider ${key} below canonical profile requirement.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Full resolve: merge provider defaults/overrides → capacity check → intersect.
 */
export function resolveEffectiveWorkerLimits(input: {
  readonly profile: HeadlessOutputProfile;
  readonly overrides?: Partial<HeadlessWorkerLimits> | null;
  readonly defaults?: HeadlessWorkerLimits;
}):
  | {
      readonly ok: true;
      readonly providerCapacity: HeadlessWorkerLimits;
      readonly limits: HeadlessWorkerLimits;
    }
  | { readonly ok: false; readonly message: string } {
  const merged = mergeValidatedDefaultsAndOverrides({
    defaults: input.defaults ?? HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
    overrides: input.overrides,
  });
  if (!merged.ok) return merged;

  const capacity = assertProviderCapacityForProfile({
    profile: input.profile,
    providerCapacity: merged.capacity,
  });
  if (!capacity.ok) return capacity;

  const intersected = intersectProfileAndProviderLimits(
    input.profile,
    merged.capacity,
  );
  if (!intersected.ok) return intersected;

  return {
    ok: true,
    providerCapacity: merged.capacity,
    limits: intersected.limits,
  };
}
