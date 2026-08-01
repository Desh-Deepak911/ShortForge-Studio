"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  parseVisualRetentionCapabilitiesResponse,
  VISUAL_RETENTION_CAPABILITIES_DISABLED,
  type VisualRetentionCapabilitiesSnapshot,
} from "./parse-visual-retention-capabilities";

const VisualRetentionCapabilitiesContext =
  createContext<VisualRetentionCapabilitiesSnapshot>(
    VISUAL_RETENTION_CAPABILITIES_DISABLED,
  );

/**
 * Single workspace fetch for staging visual-retention capabilities.
 * Fail-closed before fetch, on network/HTTP failure, and on malformed JSON.
 */
export function VisualRetentionCapabilitiesProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<VisualRetentionCapabilitiesSnapshot>(
    VISUAL_RETENTION_CAPABILITIES_DISABLED,
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/visual-retention/capabilities", { method: "GET" })
      .then(async (response) => {
        if (!response.ok) {
          return parseVisualRetentionCapabilitiesResponse(null);
        }
        return parseVisualRetentionCapabilitiesResponse(await response.json());
      })
      .then((parsed) => {
        if (cancelled) return;
        setSnapshot({
          mixedMediaScenesEnabled: parsed.mixedMediaScenesEnabled,
          visualBeatDensityEnabled: parsed.visualBeatDensityEnabled,
          ready: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshot({
          mixedMediaScenesEnabled: false,
          visualBeatDensityEnabled: false,
          ready: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => snapshot, [snapshot]);

  return (
    <VisualRetentionCapabilitiesContext.Provider value={value}>
      {children}
    </VisualRetentionCapabilitiesContext.Provider>
  );
}

/** Extensible snapshot for current and later visual-retention creator capabilities. */
export function useVisualRetentionCapabilities(): VisualRetentionCapabilitiesSnapshot {
  return useContext(VisualRetentionCapabilitiesContext);
}

export function useMixedMediaScenesEnabled(): boolean {
  return useVisualRetentionCapabilities().mixedMediaScenesEnabled;
}

export function useVisualBeatDensityEnabled(): boolean {
  return useVisualRetentionCapabilities().visualBeatDensityEnabled;
}

export function useVisualRetentionCapabilitiesReady(): boolean {
  return useVisualRetentionCapabilities().ready;
}
