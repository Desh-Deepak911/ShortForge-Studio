/**
 * Dev-only mixed-media scenes browser QA harness.
 * Not linked from production navigation. Unavailable outside local development.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { MixedMediaScenesQaHarness } from "./MixedMediaScenesQaHarness";

export const dynamic = "force-dynamic";

export default function MixedMediaScenesQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <MixedMediaScenesQaHarness />;
}
