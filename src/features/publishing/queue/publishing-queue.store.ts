import type {
  PublishingQueueStorageAdapter,
  PublishingQueueStoreV1,
} from "./publishing-queue.types";
import { PUBLISHING_QUEUE_STORAGE_KEY, PUBLISHING_QUEUE_STORE_VERSION } from "./publishing-queue.types";

export function emptyPublishingQueueStore(): PublishingQueueStoreV1 {
  return { version: PUBLISHING_QUEUE_STORE_VERSION, packages: [] };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function safeStringifyJson(value: PublishingQueueStoreV1): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isPublishingQueueStoreV1(value: unknown): value is PublishingQueueStoreV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PublishingQueueStoreV1>;
  return candidate.version === PUBLISHING_QUEUE_STORE_VERSION && Array.isArray(candidate.packages);
}

/** Parses persisted JSON; returns an empty store when data is missing or corrupt. */
export function safeParsePublishingQueueStore(raw: string | null): PublishingQueueStoreV1 {
  if (!raw) {
    return emptyPublishingQueueStore();
  }

  const parsed = safeParseJson(raw);
  if (!isPublishingQueueStoreV1(parsed)) {
    return emptyPublishingQueueStore();
  }

  return {
    version: PUBLISHING_QUEUE_STORE_VERSION,
    packages: parsed.packages,
  };
}

export function readPublishingQueueStore(adapter: PublishingQueueStorageAdapter): PublishingQueueStoreV1 {
  return safeParsePublishingQueueStore(adapter.getItem(PUBLISHING_QUEUE_STORAGE_KEY));
}

export function writePublishingQueueStore(
  adapter: PublishingQueueStorageAdapter,
  store: PublishingQueueStoreV1,
): boolean {
  const serialized = safeStringifyJson(store);
  if (!serialized) {
    return false;
  }

  try {
    adapter.setItem(PUBLISHING_QUEUE_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function getBrowserPublishingQueueAdapter(): PublishingQueueStorageAdapter | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function resolvePublishingQueueAdapter(
  options?: { adapter?: PublishingQueueStorageAdapter | null },
): PublishingQueueStorageAdapter | null {
  if (options?.adapter === null) {
    return null;
  }

  return options?.adapter ?? getBrowserPublishingQueueAdapter();
}

export function requirePublishingQueueAdapter(
  options?: { adapter?: PublishingQueueStorageAdapter | null },
): PublishingQueueStorageAdapter {
  const adapter = resolvePublishingQueueAdapter(options);
  if (!adapter) {
    throw new Error("Publishing queue storage is unavailable in this environment.");
  }

  return adapter;
}

/** In-memory adapter for tests and non-browser environments. */
export function createMemoryPublishingQueueStorageAdapter(
  initialStore?: PublishingQueueStoreV1,
): PublishingQueueStorageAdapter {
  const memory = new Map<string, string>();

  if (initialStore) {
    const serialized = safeStringifyJson(initialStore);
    if (serialized) {
      memory.set(PUBLISHING_QUEUE_STORAGE_KEY, serialized);
    }
  }

  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
  };
}
