export { InspectorRegistry } from "./InspectorRegistry";
export { InspectorContext, InspectorContextProvider, useInspectorContext } from "./InspectorContext";
export type { InspectorContextProviderProps, InspectorContextValue } from "./InspectorContext";
export { default as InspectorPanel } from "./InspectorPanel";
export type { ResolvedInspectorPanelProps } from "./InspectorPanel";
export { default as InspectorResolver } from "./InspectorResolver";
export { default as InspectorTabShell } from "./InspectorTabShell";
export { focusInspectorProjectTab } from "./inspector-tab-shell.session";
export { createEditorInspectorRegistry } from "./registerEditorInspectors";
export { resolveInspectorPanels } from "./inspector.resolve";
export type {
  InspectorPanelDefinition,
  InspectorPanelId,
  InspectorPanelProps,
} from "./inspector.types";
