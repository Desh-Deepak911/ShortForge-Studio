/**
 * Dev-only creator-export journey browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { CreatorExportQaHarness } from "./CreatorExportQaHarness";

export const dynamic = "force-dynamic";

export default function CreatorExportQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <CreatorExportQaHarness />;
}
