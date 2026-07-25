/**
 * Chromium launch argv authority — sandbox stays enabled by default.
 */

export interface ChromeLaunchPolicy {
  /**
   * Explicit worker-isolation opt-in for containers that already provide
   * external sandboxing. Never inferred from ordinary app/env flags.
   */
  readonly allowNoSandboxWithExternalIsolation?: boolean;
}

export function buildHeadlessChromeLaunchArgs(
  policy: ChromeLaunchPolicy = {},
): readonly string[] {
  const args = [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    "--disable-translate",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
  ];

  if (policy.allowNoSandboxWithExternalIsolation === true) {
    // Documented escape hatch only — caller must prove external isolation.
    args.push("--no-sandbox");
  }

  return Object.freeze(args);
}

export function chromeLaunchArgsContainNoSandbox(
  args: readonly string[],
): boolean {
  return args.includes("--no-sandbox");
}
