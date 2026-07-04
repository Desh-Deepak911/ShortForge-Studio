"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { StorySyncEditKind, StorySynchronizationState } from "./story-sync.types";

export interface StorySyncContextValue {
  state: StorySynchronizationState;
  applySyncEdit: (kind: StorySyncEditKind, at?: string | null) => void;
  dismissBanner: () => void;
  isBannerDismissed: boolean;
}

const StorySyncContext = createContext<StorySyncContextValue | null>(null);

/** Provides editor-owned synchronization state to banner, card, and lifecycle hooks. */
export function StorySyncProvider({
  value,
  children,
}: {
  value: StorySyncContextValue;
  children: ReactNode;
}) {
  return <StorySyncContext.Provider value={value}>{children}</StorySyncContext.Provider>;
}

export function useStorySync(): StorySyncContextValue {
  const context = useContext(StorySyncContext);
  if (!context) {
    throw new Error("useStorySync must be used within StorySyncProvider");
  }
  return context;
}

/** Optional access when provider may be absent (e.g. isolated panels). */
export function useOptionalStorySync(): StorySyncContextValue | null {
  return useContext(StorySyncContext);
}
