/**
 * Dev-only per-media video trim QA harness.
 * Not linked from production navigation.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { PerMediaVideoTrimQaHarness } from "./PerMediaVideoTrimQaHarness";

export const dynamic = "force-dynamic";

export default function PerMediaVideoTrimQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <PerMediaVideoTrimQaHarness />;
}
