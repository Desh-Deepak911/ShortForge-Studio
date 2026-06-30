"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { FootieScript } from "@/features/story/types";
import type { CreatorAssetStudioPlanningData } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";

import { InspectorRegistry } from "./InspectorRegistry";
import { createEditorInspectorRegistry } from "./registerEditorInspectors";

export interface InspectorContextValue {
  registry: InspectorRegistry;
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  /** Optional Asset Intelligence planning snapshot — shell only, not persisted by default. */
  assetPlanning?: CreatorAssetStudioPlanningData | null;
  /** Whether the Creator Asset Studio shell should render in the inspector. */
  creatorAssetStudioVisible?: boolean;
}

export const InspectorContext = createContext<InspectorContextValue | null>(null);

export interface InspectorContextProviderProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  registry?: InspectorRegistry;
  assetPlanning?: CreatorAssetStudioPlanningData | null;
  creatorAssetStudioVisible?: boolean;
  children: ReactNode;
}

export function InspectorContextProvider({
  script,
  onScriptChange,
  registry,
  assetPlanning = null,
  creatorAssetStudioVisible = false,
  children,
}: InspectorContextProviderProps) {
  const resolvedRegistry = useMemo(() => registry ?? createEditorInspectorRegistry(), [registry]);

  const value = useMemo(
    (): InspectorContextValue => ({
      registry: resolvedRegistry,
      script,
      onScriptChange,
      assetPlanning,
      creatorAssetStudioVisible,
    }),
    [assetPlanning, creatorAssetStudioVisible, onScriptChange, resolvedRegistry, script],
  );

  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useInspectorContext(): InspectorContextValue {
  const context = useContext(InspectorContext);

  if (!context) {
    throw new Error("useInspectorContext must be used within InspectorContextProvider");
  }

  return context;
}
