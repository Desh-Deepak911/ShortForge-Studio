/**
 * Dev-only caption background authority QA harness.
 * Not linked from production navigation.
 */

import { assertLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

import { CaptionBackgroundAuthorityQaHarness } from "./CaptionBackgroundAuthorityQaHarness";

export const dynamic = "force-dynamic";

export default function CaptionBackgroundAuthorityQaPage() {
  assertLocalDevQaHarnessAllowed();
  return <CaptionBackgroundAuthorityQaHarness />;
}
