import type { FootieScript } from "@/features/story/types";

import type { Draft, DraftStatus, DraftStoreV1, StoryCreationBrief, StoryDraft } from "../types";
import {
  coerceLegacyDraft,
  createDraftFromScript,
  createDraftId,
  normalizeDraft,
  toDraftSummary,
  touchDraft,
} from "../utils";

/** Single localStorage bucket for all drafts (MVP). */
export const DRAFT_STORAGE_KEY = "footiebitz:drafts:v1";

/** Pluggable key/value adapter — swap for Supabase or another backend later. */
export interface DraftStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DraftStorageOptions {
  adapter?: DraftStorageAdapter | null;
}

/** Input for creating a new draft record. */
export interface CreateDraftData {
  script: FootieScript;
  creationBrief?: StoryCreationBrief;
  prompt?: string;
  status?: DraftStatus;
  id?: string;
}

/** Partial draft fields accepted by {@link updateDraft}. */
export type UpdateDraftData = Partial<Omit<Draft, "id" | "createdAt">>;

/**
 * Persistence contract for draft storage implementations.
 * The localStorage MVP implements this shape so it can be replaced later.
 */
export interface DraftStorageBackend {
  createDraft(data: CreateDraftData, options?: DraftStorageOptions): Draft;
  getDraft(id: string, options?: DraftStorageOptions): Draft | null;
  updateDraft(id: string, updates: UpdateDraftData, options?: DraftStorageOptions): Draft | null;
  deleteDraft(id: string, options?: DraftStorageOptions): boolean;
  listDrafts(options?: DraftStorageOptions): Draft[];
  saveDraft(draft: Draft, options?: DraftStorageOptions): Draft;
}

function emptyStore(): DraftStoreV1 {
  return { version: 1, drafts: [] };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function safeStringifyJson(value: DraftStoreV1): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isDraftStoreV1(value: unknown): value is DraftStoreV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DraftStoreV1>;
  return candidate.version === 1 && Array.isArray(candidate.drafts);
}

/** Parses persisted JSON; returns an empty store when data is missing or corrupt. */
function safeParseStore(raw: string | null): DraftStoreV1 {
  if (!raw) {
    return emptyStore();
  }

  const parsed = safeParseJson(raw);
  if (!isDraftStoreV1(parsed)) {
    return emptyStore();
  }

  return {
    version: 1,
    drafts: parsed.drafts.map((draft) =>
      coerceLegacyDraft(draft as Partial<Draft> & Pick<Draft, "id" | "script">),
    ),
  };
}

function readStore(adapter: DraftStorageAdapter): DraftStoreV1 {
  return safeParseStore(adapter.getItem(DRAFT_STORAGE_KEY));
}

function writeStore(adapter: DraftStorageAdapter, store: DraftStoreV1): boolean {
  const serialized = safeStringifyJson(store);
  if (!serialized) {
    return false;
  }

  try {
    adapter.setItem(DRAFT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function getBrowserStorageAdapter(): DraftStorageAdapter | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveAdapter(options?: DraftStorageOptions): DraftStorageAdapter | null {
  if (options?.adapter === null) {
    return null;
  }

  return options?.adapter ?? getBrowserStorageAdapter();
}

function requireAdapter(options?: DraftStorageOptions): DraftStorageAdapter {
  const adapter = resolveAdapter(options);
  if (!adapter) {
    throw new Error("Draft storage is unavailable in this environment.");
  }

  return adapter;
}

function sortDraftsNewestFirst(drafts: Draft[]): Draft[] {
  return [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

class LocalDraftStorageService implements DraftStorageBackend {
  createDraft(data: CreateDraftData, options?: DraftStorageOptions): Draft {
    const draft = createDraftFromScript(
      data.script,
      data.creationBrief,
      data.id ?? createDraftId(),
    );

    return this.saveDraft(
      normalizeDraft({
        ...draft,
        prompt: data.prompt ?? data.creationBrief?.topic ?? draft.prompt,
        status: data.status ?? "draft",
      }),
      options,
    );
  }

  getDraft(id: string, options?: DraftStorageOptions): Draft | null {
    const adapter = resolveAdapter(options);
    if (!adapter) {
      return null;
    }

    return readStore(adapter).drafts.find((draft) => draft.id === id) ?? null;
  }

  saveDraft(draft: Draft, options?: DraftStorageOptions): Draft {
    const adapter = requireAdapter(options);
    const normalizedDraft = normalizeDraft(draft);
    const store = readStore(adapter);
    const index = store.drafts.findIndex((item) => item.id === normalizedDraft.id);

    if (index >= 0) {
      store.drafts[index] = normalizedDraft;
    } else {
      store.drafts.unshift(normalizedDraft);
    }

    if (!writeStore(adapter, store)) {
      throw new Error("Failed to persist draft.");
    }

    return normalizedDraft;
  }

  updateDraft(id: string, updates: UpdateDraftData, options?: DraftStorageOptions): Draft | null {
    const adapter = resolveAdapter(options);
    if (!adapter) {
      return null;
    }

    const store = readStore(adapter);
    const index = store.drafts.findIndex((draft) => draft.id === id);

    if (index < 0) {
      return null;
    }

    const current = store.drafts[index]!;
    const nextScript = updates.script ?? current.script;
    const touched = updates.script
      ? touchDraft({ ...current, ...updates, script: nextScript }, nextScript)
      : normalizeDraft({
          ...current,
          ...updates,
          id: current.id,
          createdAt: current.createdAt,
          script: nextScript,
          updatedAt: new Date().toISOString(),
        });

    store.drafts[index] = touched;

    if (!writeStore(adapter, store)) {
      return null;
    }

    return touched;
  }

  deleteDraft(id: string, options?: DraftStorageOptions): boolean {
    const adapter = resolveAdapter(options);
    if (!adapter) {
      return false;
    }

    const store = readStore(adapter);
    const nextDrafts = store.drafts.filter((draft) => draft.id !== id);

    if (nextDrafts.length === store.drafts.length) {
      return false;
    }

    return writeStore(adapter, { version: 1, drafts: nextDrafts });
  }

  listDrafts(options?: DraftStorageOptions): Draft[] {
    const adapter = resolveAdapter(options);
    if (!adapter) {
      return [];
    }

    return sortDraftsNewestFirst(readStore(adapter).drafts);
  }
}

/** Default MVP backend — localStorage. Replace this export when moving to Supabase. */
export const localDraftStorage: DraftStorageBackend = new LocalDraftStorageService();

export function isDraftStorageAvailable(): boolean {
  return getBrowserStorageAdapter() != null;
}

export function createDraft(data: CreateDraftData, options?: DraftStorageOptions): Draft {
  return localDraftStorage.createDraft(data, options);
}

export function getDraft(id: string, options?: DraftStorageOptions): Draft | null {
  return localDraftStorage.getDraft(id, options);
}

export function updateDraft(
  id: string,
  updates: UpdateDraftData,
  options?: DraftStorageOptions,
): Draft | null {
  return localDraftStorage.updateDraft(id, updates, options);
}

export function deleteDraft(id: string, options?: DraftStorageOptions): boolean {
  return localDraftStorage.deleteDraft(id, options);
}

export function listDrafts(options?: DraftStorageOptions): Draft[] {
  return localDraftStorage.listDrafts(options);
}

export function saveDraft(draft: Draft, options?: DraftStorageOptions): Draft {
  return localDraftStorage.saveDraft(draft, options);
}

/** @deprecated Prefer {@link listDrafts} — kept for dashboard summaries. */
export function listDraftSummaries(options?: DraftStorageOptions) {
  return listDrafts(options).map(toDraftSummary);
}

/** @deprecated Prefer {@link createDraft}. */
export function createAndSaveDraft(
  script: FootieScript,
  creationBrief?: StoryCreationBrief,
  adapter?: DraftStorageAdapter | null,
): StoryDraft {
  return createDraft({ script, creationBrief }, { adapter });
}

/** @deprecated Prefer {@link updateDraft} with `{ script }`. */
export function updateDraftScript(
  draftId: string,
  script: FootieScript,
  adapter?: DraftStorageAdapter | null,
): StoryDraft | null {
  return updateDraft(draftId, { script }, { adapter });
}

/** In-memory adapter for tests and future non-browser backends. */
export function createMemoryDraftStorageAdapter(initialStore?: DraftStoreV1): DraftStorageAdapter {
  const memory = new Map<string, string>();

  if (initialStore) {
    const serialized = safeStringifyJson(initialStore);
    if (serialized) {
      memory.set(DRAFT_STORAGE_KEY, serialized);
    }
  }

  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
  };
}
