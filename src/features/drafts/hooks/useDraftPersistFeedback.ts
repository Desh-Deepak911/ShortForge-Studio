"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";

import {
  getDraftSessionSnapshot,
  subscribeDraftSessionStore,
} from "../session/draft-session-store";
import {
  DRAFT_AUTOSAVE_FAILED_MESSAGE,
  DRAFT_AUTOSAVE_SAVED_MESSAGE,
} from "../session/draft-persist-messages";

const SAVED_FLASH_MS = 2500;

export type UseDraftPersistFeedbackResult = {
  /** Non-blocking warning when a background autosave failed. */
  persistWarning: string | null;
  /** Brief success flash after a background autosave completes. */
  autosaveSavedMessage: string | null;
};

/**
 * Subscribes to draft session persist status for non-blocking autosave feedback.
 * Does not block navigation or editor rendering.
 */
export function useDraftPersistFeedback(draftId: string): UseDraftPersistFeedbackResult {
  const session = useSyncExternalStore(
    subscribeDraftSessionStore,
    () => getDraftSessionSnapshot(draftId),
    () => getDraftSessionSnapshot(draftId),
  );
  const [autosaveSavedMessage, setAutosaveSavedMessage] = useState<string | null>(null);
  const prevPersistStatusRef = useRef(session.persistStatus);
  const savedFlashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDraftSessionStore(() => {
      const nextStatus = getDraftSessionSnapshot(draftId).persistStatus;
      const prev = prevPersistStatusRef.current;
      prevPersistStatusRef.current = nextStatus;

      if (prev === "pending" && nextStatus === "saved") {
        setAutosaveSavedMessage(DRAFT_AUTOSAVE_SAVED_MESSAGE);

        if (savedFlashTimeoutRef.current != null) {
          window.clearTimeout(savedFlashTimeoutRef.current);
        }

        savedFlashTimeoutRef.current = window.setTimeout(() => {
          setAutosaveSavedMessage(null);
        }, SAVED_FLASH_MS);
      }

      if (nextStatus === "error") {
        setAutosaveSavedMessage(null);
      }
    });

    return () => {
      unsubscribe();
      if (savedFlashTimeoutRef.current != null) {
        window.clearTimeout(savedFlashTimeoutRef.current);
      }
    };
  }, [draftId]);

  const persistWarning =
    session.persistStatus === "error"
      ? (session.persistError ?? DRAFT_AUTOSAVE_FAILED_MESSAGE)
      : null;

  return {
    persistWarning,
    autosaveSavedMessage,
  };
}
