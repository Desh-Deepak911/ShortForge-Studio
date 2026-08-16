/**
 * Classify Fly on-demand wake env. Never opens a network connection.
 * Never logs or returns token values.
 */

export type HeadlessFlyWakeEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

export type HeadlessConfiguredFlyWakeConfig = {
  readonly apiBaseUrl: string;
  readonly appName: string;
  readonly machineId: string;
  readonly apiToken: string;
};

const TOKEN_MAX = 4096;
const NAME_MAX = 256;

function readEnvString(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
):
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly value: string }
  | { readonly kind: "hostile" } {
  try {
    if (env == null || typeof env !== "object") return { kind: "hostile" };
    const raw = (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) return { kind: "absent" };
    if (typeof raw !== "string") return { kind: "hostile" };
    return { kind: "present", value: raw };
  } catch {
    return { kind: "hostile" };
  }
}

function isBoundedName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= NAME_MAX &&
    value === value.trim() &&
    !/\s/.test(value)
  );
}

export function classifyHeadlessFlyWakeEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessFlyWakeEnvironmentStatus {
  const token = readEnvString(env, "FLY_API_TOKEN");
  const app = readEnvString(env, "HEADLESS_FLY_WAKE_APP_NAME");
  const machine = readEnvString(env, "HEADLESS_FLY_WAKE_MACHINE_ID");
  if (
    token.kind === "hostile" ||
    app.kind === "hostile" ||
    machine.kind === "hostile"
  ) {
    return "invalid";
  }
  const present =
    (token.kind === "present" ? 1 : 0) +
    (app.kind === "present" ? 1 : 0) +
    (machine.kind === "present" ? 1 : 0);
  if (present === 0) return "unconfigured";
  if (present !== 3) return "invalid";
  if (
    token.kind !== "present" ||
    app.kind !== "present" ||
    machine.kind !== "present"
  ) {
    return "invalid";
  }
  if (
    token.value.length === 0 ||
    token.value.length > TOKEN_MAX ||
    token.value !== token.value.trim()
  ) {
    return "invalid";
  }
  if (!isBoundedName(app.value) || !isBoundedName(machine.value)) {
    return "invalid";
  }
  return "configured";
}

export function readConfiguredHeadlessFlyWakeConfig(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredFlyWakeConfig | null {
  return readFlyWakeConfig(env, "HEADLESS_FLY_WAKE_MACHINE_ID");
}

/** Verify Machine id. Falls back to the render machine when unset. */
export function readConfiguredHeadlessFlyVerifyWakeConfig(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredFlyWakeConfig | null {
  const verify = readEnvString(env, "HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID");
  if (verify.kind === "present") {
    return readFlyWakeConfig(env, "HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID");
  }
  return readConfiguredHeadlessFlyWakeConfig(env);
}

function readFlyWakeConfig(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  machineKey: string,
): HeadlessConfiguredFlyWakeConfig | null {
  const token = readEnvString(env, "FLY_API_TOKEN");
  const app = readEnvString(env, "HEADLESS_FLY_WAKE_APP_NAME");
  const machine = readEnvString(env, machineKey);
  if (
    token.kind !== "present" ||
    app.kind !== "present" ||
    machine.kind !== "present"
  ) {
    return null;
  }
  if (
    token.value.length === 0 ||
    token.value.length > TOKEN_MAX ||
    token.value !== token.value.trim() ||
    !isBoundedName(app.value) ||
    !isBoundedName(machine.value)
  ) {
    return null;
  }
  return {
    apiBaseUrl: "https://api.machines.dev/v1",
    appName: app.value,
    machineId: machine.value,
    apiToken: token.value,
  };
}
