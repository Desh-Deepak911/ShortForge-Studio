/**
 * Dev-only Visual pacing browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { VisualPacingQaHarness } from "./VisualPacingQaHarness";

export const dynamic = "force-dynamic";

export default function VisualPacingQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <VisualPacingQaHarness />;
}
