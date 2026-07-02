import type { PublishingPackage, PublishingPackageId } from "../publishing.types";

export const PUBLISHING_QUEUE_STORAGE_KEY = "footiebitz:publishing-queue:v1";

export const PUBLISHING_QUEUE_STORE_VERSION = 1 as const;

/** Persisted local queue bucket — metadata and asset references only. */
export interface PublishingQueueStoreV1 {
  version: typeof PUBLISHING_QUEUE_STORE_VERSION;
  packages: PublishingPackage[];
}

/** Pluggable key/value adapter — mirrors draft storage for future backends. */
export interface PublishingQueueStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PublishingQueueStorageOptions {
  adapter?: PublishingQueueStorageAdapter | null;
}

export interface PublishingQueueMutationResult {
  ok: boolean;
  package?: PublishingPackage;
  error?: string;
}

export type PublishingQueueItem = PublishingPackage;

export type { PublishingPackageId };
