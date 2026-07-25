/**
 * Detached deep-freeze for canonical headless contracts.
 */

export function deepFreezeHeadlessValue<T>(value: T): T {
  return deepFreezeInternal(detachClone(value), new WeakSet<object>());
}

/**
 * In-place recursive freeze for registry constants (no clone / identity preserved).
 * Caller must not pass caller-owned mutable graphs intended for later mutation.
 */
export function deepFreezeInPlace<T>(value: T): T {
  return deepFreezeInternal(value, new WeakSet<object>());
}

/** Structured clone when possible; JSON round-trip fallback for plain data. */
function detachClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreezeInternal<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezeInternal(item, seen);
    }
    return Object.freeze(value);
  }

  for (const key of Object.keys(value as object)) {
    deepFreezeInternal((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}
