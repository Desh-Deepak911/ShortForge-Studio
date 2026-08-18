/**
 * Dev-only Prompt 2B visual-bundle QA harness.
 * Not linked from production navigation.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { CurrentVisualFeatureBundleQaHarness } from "./CurrentVisualFeatureBundleQaHarness";

export const dynamic = "force-dynamic";

export default function CurrentVisualFeatureBundleQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <CurrentVisualFeatureBundleQaHarness />;
}
