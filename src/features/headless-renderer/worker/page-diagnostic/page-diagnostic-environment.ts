/**
 * Sprint 11E Phase 2E.2D.8F.3 — no-provider page diagnostic environment gate.
 */

export const HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE =
  "HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC" as const;

const FORBIDDEN_EXACT_KEYS = Object.freeze([
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
] as const);

const FORBIDDEN_PREFIXES = Object.freeze([
  "R2_",
  "UPSTASH_",
  "NEXT_PUBLIC_",
] as const);

const FORBIDDEN_WORKER_MODES = Object.freeze(["verify", "render"] as const);

export type PageDiagnosticEnvironmentVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId:
        | "gate_off"
        | "forbidden_secret_present"
        | "forbidden_worker_mode";
      readonly forbiddenKeyClass: string | null;
    };

export function isPageDiagnosticGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return (
    (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE] ===
    "1"
  );
}

function envHasNonEmptyValue(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
): boolean {
  const raw = (env as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

export function validatePageDiagnosticEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): PageDiagnosticEnvironmentVerdict {
  if (!isPageDiagnosticGateOn(env)) {
    return { ok: false, reasonId: "gate_off", forbiddenKeyClass: null };
  }

  const modeRaw = (env as Record<string, unknown>).HEADLESS_WORKER_MODE;
  if (
    typeof modeRaw === "string" &&
    (FORBIDDEN_WORKER_MODES as readonly string[]).includes(modeRaw)
  ) {
    return {
      ok: false,
      reasonId: "forbidden_worker_mode",
      forbiddenKeyClass: "HEADLESS_WORKER_MODE",
    };
  }

  for (const key of FORBIDDEN_EXACT_KEYS) {
    if (envHasNonEmptyValue(env, key)) {
      return {
        ok: false,
        reasonId: "forbidden_secret_present",
        forbiddenKeyClass: key,
      };
    }
  }

  for (const key of Object.keys(env)) {
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (key.startsWith(prefix) && envHasNonEmptyValue(env, key)) {
        return {
          ok: false,
          reasonId: "forbidden_secret_present",
          forbiddenKeyClass: prefix.replace(/_$/, ""),
        };
      }
    }
  }

  return { ok: true };
}

export function listPageDiagnosticForbiddenEnvKeyClasses(): readonly string[] {
  return Object.freeze([
    ...FORBIDDEN_EXACT_KEYS,
    ...FORBIDDEN_PREFIXES.map((p) => p.replace(/_$/, "")),
    "HEADLESS_WORKER_MODE",
  ]);
}
