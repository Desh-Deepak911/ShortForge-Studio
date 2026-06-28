"use client";

import { useMemo } from "react";

import { useEditorSelection } from "@/features/editor/selection";

import { useInspectorContext } from "./InspectorContext";
import InspectorPanel from "./InspectorPanel";

/**
 * Selection-driven inspector stack — resolves panels via InspectorRegistry.
 */
export default function InspectorResolver() {
  const selection = useEditorSelection();
  const { registry } = useInspectorContext();

  const panelIds = useMemo(() => registry.resolve(selection), [registry, selection]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {panelIds.map((panelId) => (
        <InspectorPanel key={panelId} panelId={panelId} />
      ))}
    </div>
  );
}
