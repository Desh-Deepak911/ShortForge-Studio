"use client";

import { useCallback, useEffect, useState } from "react";

import {
  studioInspectorTabBodyScrollHost,
  studioWorkspaceTabActive,
  studioWorkspaceTabInactive,
  studioWorkspaceTabTrack,
} from "@/lib/utils/studioUi";

import InspectorPanel from "./InspectorPanel";
import { useEditorSelection } from "@/features/editor/selection";
import {
  readActiveInspectorTab,
  registerInspectorProjectTabFocus,
  writeActiveInspectorTab,
} from "./inspector-tab-shell.session";
import { INSPECTOR_TAB_LABELS, type InspectorTabId } from "./inspector-tab-shell.types";

const INSPECTOR_TABS: InspectorTabId[] = ["scene", "project"];

export default function InspectorTabShell() {
  const { inspectorImageEditing } = useEditorSelection();
  const [activeTab, setActiveTab] = useState<InspectorTabId>(() => readActiveInspectorTab());

  const selectTab = useCallback((tabId: InspectorTabId) => {
    writeActiveInspectorTab(tabId);
    setActiveTab(tabId);
  }, []);

  const displayedTab = inspectorImageEditing ? "scene" : activeTab;

  useEffect(() => {
    return registerInspectorProjectTabFocus(() => {
      selectTab("project");
    });
  }, [selectTab]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-inspector-tab-shell
    >
      <div
        className={`${studioWorkspaceTabTrack} mb-3 shrink-0`}
        role="tablist"
        aria-label="Inspector sections"
      >
        {INSPECTOR_TABS.map((tabId) => {
          const isActive = displayedTab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              id={`inspector-tab-${tabId}`}
              aria-selected={isActive}
              aria-controls={`inspector-tabpanel-${tabId}`}
              className={isActive ? studioWorkspaceTabActive : studioWorkspaceTabInactive}
              onClick={() => selectTab(tabId)}
            >
              {INSPECTOR_TAB_LABELS[tabId]}
            </button>
          );
        })}
      </div>

      <div className={studioInspectorTabBodyScrollHost}>
        <div
          id="inspector-tabpanel-scene"
          role="tabpanel"
          aria-labelledby="inspector-tab-scene"
          hidden={displayedTab !== "scene"}
          className={displayedTab === "scene" ? "min-w-0" : "pointer-events-none min-w-0"}
        >
          <InspectorPanel panelId="scene" />
        </div>

        <div
          id="inspector-tabpanel-project"
          role="tabpanel"
          aria-labelledby="inspector-tab-project"
          hidden={displayedTab !== "project"}
          className={displayedTab === "project" ? "min-w-0" : "pointer-events-none min-w-0"}
        >
          <InspectorPanel panelId="project" />
        </div>
      </div>
    </div>
  );
}
