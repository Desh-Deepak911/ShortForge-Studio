import { NextResponse } from "next/server";

import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";
import { resolveVisualRetentionGatesFromEnvironment } from "@/features/visual-retention";

export const dynamic = "force-dynamic";

/**
 * Staging-only visual-retention capability snapshot for creator UI.
 * Fail-closed: defaults every capability off when gates reject.
 * Never returns secrets or raw environment values.
 */
export async function GET() {
  const gates = resolveVisualRetentionGatesFromEnvironment(process.env);
  const mixedMediaScenesEnabled =
    resolveMixedMediaScenesEnabledFromEnvironment(process.env);

  return NextResponse.json(
    {
      version: 1 as const,
      mixedMediaScenesEnabled,
      phasesValid: gates.valid === true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
