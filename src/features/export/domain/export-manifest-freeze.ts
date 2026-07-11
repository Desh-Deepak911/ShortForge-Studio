/**
 * Deep-freeze serializable ExportManifest trees.
 */

export function deepFreezeExportManifest<T>(value: T): T {
  return deepFreezeInternal(value, new WeakSet<object>());
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
    const child = (value as Record<string, unknown>)[key];
    deepFreezeInternal(child, seen);
  }

  return Object.freeze(value);
}
