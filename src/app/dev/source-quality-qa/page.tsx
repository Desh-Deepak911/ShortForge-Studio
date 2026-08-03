/**
 * Dev-only source-quality browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { SourceQualityQaHarness } from "./SourceQualityQaHarness";

export const dynamic = "force-dynamic";

export default function SourceQualityQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <SourceQualityQaHarness />;
}
