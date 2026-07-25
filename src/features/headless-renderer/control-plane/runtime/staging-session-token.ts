import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  HEADLESS_STAGING_SESSION_TTL_SECONDS,
  type StagingSessionConfiguration,
} from "./staging-session-environment";

type StagingSessionPayload = {
  readonly v: 1;
  readonly sub: string;
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
};

const SESSION_ID = /^[a-f0-9]{32}$/;
const OWNER_ID = /^[a-z][a-z0-9_-]{2,63}$/;

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(encodedPayload)
    .digest();
}

export function mintStagingSessionToken(input: {
  readonly configuration: StagingSessionConfiguration;
  readonly ownerId: string;
  readonly nowMs?: number;
  readonly sessionId?: string;
}): string | null {
  if (
    !input.configuration.testers.some(
      (tester) => tester.ownerId === input.ownerId,
    ) ||
    !OWNER_ID.test(input.ownerId)
  ) {
    return null;
  }
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const sessionId = input.sessionId ?? randomBytes(16).toString("hex");
  if (!SESSION_ID.test(sessionId)) return null;
  const payload: StagingSessionPayload = {
    v: 1,
    sub: input.ownerId,
    sid: sessionId,
    iat: nowSeconds,
    exp: nowSeconds + HEADLESS_STAGING_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, input.configuration.signingSecret).toString("base64url")}`;
}

export function verifyStagingSessionToken(input: {
  readonly configuration: StagingSessionConfiguration;
  readonly token: string;
  readonly nowMs?: number;
}): { readonly ownerId: string; readonly sessionId: string } | null {
  try {
    if (input.token.length < 80 || input.token.length > 1024) return null;
    const pieces = input.token.split(".");
    if (pieces.length !== 2) return null;
    const [encoded, suppliedSignature] = pieces;
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (
      supplied.toString("base64url") !== suppliedSignature ||
      Buffer.from(encoded, "base64url").toString("base64url") !== encoded
    ) {
      return null;
    }
    const expected = signature(encoded, input.configuration.signingSecret);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      Object.keys(payload).sort().join(",") !== "exp,iat,sid,sub,v" ||
      payload.v !== 1 ||
      typeof payload.sub !== "string" ||
      !OWNER_ID.test(payload.sub) ||
      typeof payload.sid !== "string" ||
      !SESSION_ID.test(payload.sid) ||
      typeof payload.iat !== "number" ||
      !Number.isSafeInteger(payload.iat) ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp - payload.iat !== HEADLESS_STAGING_SESSION_TTL_SECONDS ||
      !input.configuration.testers.some(
        (tester) => tester.ownerId === payload.sub,
      )
    ) {
      return null;
    }
    const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
    if (payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds) return null;
    return Object.freeze({
      ownerId: payload.sub,
      sessionId: payload.sid,
    });
  } catch {
    return null;
  }
}

export function readCookieValue(
  request: Request,
  cookieName: string,
): string | null {
  const header = request.headers.get("cookie");
  if (header == null || header.length > 8192) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
