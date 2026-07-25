import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { NextResponse } from "next/server";

import {
  HEADLESS_STAGING_SESSION_COOKIE,
  HEADLESS_STAGING_SESSION_TTL_SECONDS,
  readStagingSessionConfiguration,
} from "@/features/headless-renderer/control-plane/runtime/staging-session-environment";
import {
  mintStagingSessionToken,
  readCookieValue,
  verifyStagingSessionToken,
} from "@/features/headless-renderer/control-plane/runtime/staging-session-token";
import { classifyStagingHeadlessControlPlaneActivation } from "@/features/headless-renderer/control-plane/runtime/staging-control-plane-activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuration() {
  if (classifyStagingHeadlessControlPlaneActivation() !== "active") return null;
  return readStagingSessionConfiguration();
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin == null || origin.length > 512) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function safeResponse(authenticated: boolean, status = 200) {
  return NextResponse.json(
    { version: 1, authenticated },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request) {
  const configured = configuration();
  if (configured == null) return safeResponse(false, 404);
  const token = readCookieValue(request, HEADLESS_STAGING_SESSION_COOKIE);
  return safeResponse(
    token != null &&
      verifyStagingSessionToken({ configuration: configured, token }) != null,
  );
}

export async function POST(request: Request) {
  const configured = configuration();
  if (configured == null) return safeResponse(false, 404);
  if (!sameOrigin(request)) return safeResponse(false, 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return safeResponse(false, 401);
  }
  if (
    body == null ||
    typeof body !== "object" ||
    Object.keys(body).join(",") !== "accessCode" ||
    typeof (body as { accessCode?: unknown }).accessCode !== "string"
  ) {
    return safeResponse(false, 401);
  }
  const accessCode = (body as { accessCode: string }).accessCode;
  if (accessCode.length < 32 || accessCode.length > 256) {
    return safeResponse(false, 401);
  }
  const digest = createHash("sha256").update(accessCode, "utf8").digest();
  let ownerId: string | null = null;
  for (const tester of configured.testers) {
    const candidate = Buffer.from(tester.accessCodeHash, "hex");
    if (candidate.length === digest.length && timingSafeEqual(candidate, digest)) {
      ownerId = tester.ownerId;
    }
  }
  if (ownerId == null) return safeResponse(false, 401);
  const token = mintStagingSessionToken({
    configuration: configured,
    ownerId,
  });
  if (token == null) return safeResponse(false, 503);
  const response = safeResponse(true);
  response.cookies.set(HEADLESS_STAGING_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: HEADLESS_STAGING_SESSION_TTL_SECONDS,
  });
  return response;
}

export async function DELETE(request: Request) {
  const configured = configuration();
  if (configured == null) return safeResponse(false, 404);
  if (!sameOrigin(request)) return safeResponse(false, 403);
  const response = safeResponse(false);
  response.cookies.set(HEADLESS_STAGING_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
