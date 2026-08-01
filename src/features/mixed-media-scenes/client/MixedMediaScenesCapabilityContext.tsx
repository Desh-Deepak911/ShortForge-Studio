"use client";

/**
 * Compatibility surface for the shared visual-retention capability provider.
 * Prefer `VisualRetentionCapabilitiesProvider` / `useVisualRetentionCapabilities` for new code.
 */

export {
  VisualRetentionCapabilitiesProvider as MixedMediaScenesCapabilityProvider,
  useMixedMediaScenesEnabled,
  useVisualRetentionCapabilitiesReady as useMixedMediaScenesCapabilityReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
