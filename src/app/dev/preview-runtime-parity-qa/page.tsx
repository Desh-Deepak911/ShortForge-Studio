/**
 * Dev-only Preview runtime-parity browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { PreviewRuntimeParityQaHarness } from "./PreviewRuntimeParityQaHarness";

export const dynamic = "force-dynamic";

export default function PreviewRuntimeParityQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <PreviewRuntimeParityQaHarness />;
}
