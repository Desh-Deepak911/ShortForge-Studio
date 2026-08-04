/**
 * Dev-only Visual Retention Presets browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { VisualRetentionPresetsQaHarness } from "./VisualRetentionPresetsQaHarness";

export const dynamic = "force-dynamic";

export default function VisualRetentionPresetsQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <VisualRetentionPresetsQaHarness />;
}
