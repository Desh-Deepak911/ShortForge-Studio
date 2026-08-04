/**
 * Dev-only visual-motion browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { VisualMotionQaHarness } from "./VisualMotionQaHarness";

export const dynamic = "force-dynamic";

export default function VisualMotionQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <VisualMotionQaHarness />;
}
