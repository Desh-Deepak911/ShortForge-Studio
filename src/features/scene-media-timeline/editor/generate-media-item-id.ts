/**
 * Stable media-item ID generation — mutation boundary only.
 * Never call during read normalization, render, reload, or selection.
 */

export type GenerateMediaItemId = () => string;

/** Default client ID factory — prefers crypto.randomUUID(). */
export function createDefaultMediaItemIdGenerator(): GenerateMediaItemId {
  return () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `media-${timestamp}-${random}`;
  };
}

/** Deterministic generator for verification fixtures. */
export function createSequentialMediaItemIdGenerator(
  prefix = "media-item",
): GenerateMediaItemId {
  let index = 0;
  return () => {
    index += 1;
    return `${prefix}-${index}`;
  };
}
