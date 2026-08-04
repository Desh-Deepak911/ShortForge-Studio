/**
 * Feature-local deterministic fingerprints for Visual Retention Preset plans.
 * Sorted-key JSON + FNV-1a base36. No clocks, locale, crypto, or network.
 *
 * Canonicalization:
 * - object keys sorted recursively
 * - array order preserved
 * - `null` retained; `undefined` object values omitted (not encoded)
 * - non-finite numbers normalized to `null`
 * - hash payload is lowercase base36 after the `vrp1:` prefix
 */

export const VISUAL_RETENTION_PRESET_FINGERPRINT_PREFIX = "vrp1:" as const;
export const VISUAL_RETENTION_PRESET_PLANNER_VERSION = 1 as const;

function canonicalizePrimitive(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function stableStringifyVisualRetentionPresetValue(
  value: unknown,
): string {
  const canonical = canonicalizePrimitive(value);
  if (canonical === null || typeof canonical !== "object") {
    return JSON.stringify(canonical);
  }
  if (Array.isArray(canonical)) {
    return `[${canonical
      .map((item) => stableStringifyVisualRetentionPresetValue(item))
      .join(",")}]`;
  }
  const record = canonical as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringifyVisualRetentionPresetValue(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

/** FNV-1a 32-bit → lowercase base36 — feature-local; client-safe. */
export function visualRetentionPresetStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function digestVisualRetentionPresetCanonicalPayload(
  value: unknown,
): string {
  return visualRetentionPresetStableHash(
    stableStringifyVisualRetentionPresetValue(value),
  );
}

export function fingerprintVisualRetentionPresetCanonicalPayload(
  value: unknown,
): string {
  return `${VISUAL_RETENTION_PRESET_FINGERPRINT_PREFIX}${digestVisualRetentionPresetCanonicalPayload(
    value,
  )}`;
}
