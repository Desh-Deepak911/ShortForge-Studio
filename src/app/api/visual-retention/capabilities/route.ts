import { NextResponse } from "next/server";

import { resolveVisualRetentionCreatorCapabilitiesFromEnvironment } from "@/features/visual-retention/server/resolve-visual-retention-creator-capabilities";

export const dynamic = "force-dynamic";

/**
 * Staging-only visual-retention capability snapshot for creator UI.
 * Fail-closed: defaults every capability off when gates reject.
 * Never returns secrets, raw environment values, or branch-policy internals.
 */
export async function GET() {
  const snapshot = resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
    process.env,
  );

  return NextResponse.json(
    {
      version: snapshot.version,
      mixedMediaScenesEnabled: snapshot.mixedMediaScenesEnabled,
      visualBeatDensityEnabled: snapshot.visualBeatDensityEnabled,
      sourceQualityIntelligenceEnabled:
        snapshot.sourceQualityIntelligenceEnabled,
      phasesValid: snapshot.phasesValid,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
