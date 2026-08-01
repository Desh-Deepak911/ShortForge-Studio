"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface MixedMediaScenesCapabilityContextValue {
  readonly mixedMediaScenesEnabled: boolean;
  readonly ready: boolean;
}

const MixedMediaScenesCapabilityContext =
  createContext<MixedMediaScenesCapabilityContextValue>({
    mixedMediaScenesEnabled: false,
    ready: false,
  });

/**
 * Fetches staging-only mixed-media capability from the server gate.
 * Defaults disabled until the response arrives (fail-closed).
 */
export function MixedMediaScenesCapabilityProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [mixedMediaScenesEnabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/visual-retention/capabilities", { method: "GET" })
      .then(async (response) => {
        if (!response.ok) {
          return { mixedMediaScenesEnabled: false };
        }
        return (await response.json()) as {
          mixedMediaScenesEnabled?: unknown;
        };
      })
      .then((body) => {
        if (cancelled) return;
        setEnabled(body.mixedMediaScenesEnabled === true);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEnabled(false);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ mixedMediaScenesEnabled, ready }),
    [mixedMediaScenesEnabled, ready],
  );

  return (
    <MixedMediaScenesCapabilityContext.Provider value={value}>
      {children}
    </MixedMediaScenesCapabilityContext.Provider>
  );
}

export function useMixedMediaScenesEnabled(): boolean {
  return useContext(MixedMediaScenesCapabilityContext).mixedMediaScenesEnabled;
}

export function useMixedMediaScenesCapabilityReady(): boolean {
  return useContext(MixedMediaScenesCapabilityContext).ready;
}
