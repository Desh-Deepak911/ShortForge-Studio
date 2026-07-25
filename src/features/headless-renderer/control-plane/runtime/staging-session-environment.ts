export const HEADLESS_STAGING_SESSION_COOKIE =
  "__Host-shortforge_staging_session";
export const HEADLESS_STAGING_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type StagingSessionEnvironmentStatus =
  | "configured"
  | "absent"
  | "invalid";

export type StagingSessionTester = {
  readonly ownerId: string;
  readonly accessCodeHash: string;
};

export type StagingSessionConfiguration = {
  readonly signingSecret: string;
  readonly testers: readonly StagingSessionTester[];
};

const OWNER_ID = /^[a-z][a-z0-9_-]{2,63}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function readConfiguration(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): StagingSessionConfiguration | null {
  const signingSecret = env.HEADLESS_STAGING_SESSION_SECRET;
  const testerHashes = env.HEADLESS_STAGING_TESTER_HASHES;
  if (
    typeof signingSecret !== "string" ||
    !SHA256_HEX.test(signingSecret) ||
    typeof testerHashes !== "string" ||
    testerHashes.length < 64 ||
    testerHashes.length > 2048
  ) {
    return null;
  }

  const seen = new Set<string>();
  const testers: StagingSessionTester[] = [];
  for (const entry of testerHashes.split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 1 || separator !== entry.lastIndexOf("=")) return null;
    const ownerId = entry.slice(0, separator);
    const accessCodeHash = entry.slice(separator + 1);
    if (
      !OWNER_ID.test(ownerId) ||
      !SHA256_HEX.test(accessCodeHash) ||
      seen.has(ownerId)
    ) {
      return null;
    }
    seen.add(ownerId);
    testers.push(Object.freeze({ ownerId, accessCodeHash }));
  }
  if (testers.length !== 2) return null;

  return Object.freeze({
    signingSecret,
    testers: Object.freeze(testers),
  });
}

export function classifyStagingSessionEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): StagingSessionEnvironmentStatus {
  try {
    const secret = env.HEADLESS_STAGING_SESSION_SECRET;
    const testers = env.HEADLESS_STAGING_TESTER_HASHES;
    if (secret == null && testers == null) return "absent";
    return readConfiguration(env) == null ? "invalid" : "configured";
  } catch {
    return "invalid";
  }
}

export function readStagingSessionConfiguration(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): StagingSessionConfiguration | null {
  try {
    return readConfiguration(env);
  } catch {
    return null;
  }
}
