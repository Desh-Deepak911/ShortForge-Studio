import "server-only";

import { NextResponse } from "next/server";

import {
  buildHeadlessAssetBundleFingerprint,
  type HeadlessAssetDescriptorV1,
} from "@/features/headless-renderer/domain";
import { prepareStagingOwnedUpload } from "@/features/headless-renderer/control-plane/services/staging-owned-upload.service";
import {
  evaluateHeadlessRouteAuth,
  jsonFromHeadlessRouteGate,
} from "../_lib/respond-headless-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await evaluateHeadlessRouteAuth(request);
  if (gate.kind !== "authenticated") {
    return jsonFromHeadlessRouteGate(gate);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_TRANSPORT", error: "Request rejected." },
      { status: 400 },
    );
  }
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const result = await prepareStagingOwnedUpload({
    composition: gate.composition,
    principal: gate.principal,
    body,
    allowedOrigin: origin,
  });
  if (!result.ok) {
    const code = result.issues[0]?.code ?? "INTERNAL_ERROR";
    const rawBundle =
      body != null && typeof body === "object" && !Array.isArray(body)
        ? (body as { assetBundle?: unknown }).assetBundle
        : null;
    const rawFingerprintCoherent = (() => {
      if (
        code !== "BUNDLE_FINGERPRINT_MISMATCH" ||
        rawBundle == null ||
        typeof rawBundle !== "object" ||
        Array.isArray(rawBundle)
      ) {
        return null;
      }
      const candidate = rawBundle as {
        bundleId?: unknown;
        assets?: unknown;
        fingerprint?: unknown;
      };
      if (typeof candidate.bundleId !== "string" || !Array.isArray(candidate.assets)) {
        return false;
      }
      const rebuilt = buildHeadlessAssetBundleFingerprint(
        candidate.bundleId,
        candidate.assets as HeadlessAssetDescriptorV1[],
      );
      return rebuilt.ok && rebuilt.fingerprint === candidate.fingerprint;
    })();
    console.info(
      JSON.stringify({
        name: "headless.upload.prepare.rejected",
        code,
        rawFingerprintCoherent,
      }),
    );
    const status =
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "CONFIGURATION_UNAVAILABLE" || code === "DATABASE_UNAVAILABLE" ? 503 :
      code === "INTERNAL_ERROR" ? 500 : 400;
    return NextResponse.json(
      { success: false, code, error: "Could not prepare server export." },
      { status },
    );
  }
  return NextResponse.json(result.value, { status: 201 });
}
