/**
 * Detect stub runners / missing live-evidence wiring before provider contact.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const LIVE_MATRIX_RELATIVE =
  "src/verification/headless-renderer/upstash-live/live-matrix.ts";
const HARNESS_RELATIVE =
  "src/verification/headless-renderer/upstash-live/run-upstash-live-harness.ts";

/** Unconditional stub runners: no await / no ctx port use before pass(). */
const STUB_RUNNER_RE =
  /async\s*\(\s*(?:ctx\s*)?\)\s*=>\s*pass\s*\(/g;

export type UpstashStubBoundaryResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function readRepoFile(relativePath: string, cwd = process.cwd()): string {
  return readFileSync(path.join(cwd, relativePath), "utf8");
}

/**
 * Refuse gate-on provider contact when DEFAULT runners still contain
 * `async () => pass(...)` stubs in live-matrix.ts.
 */
export function assertDefaultUpstashLiveRunnersAreNotStubs(
  cwd: string = process.cwd(),
): UpstashStubBoundaryResult {
  try {
    const source = readRepoFile(LIVE_MATRIX_RELATIVE, cwd);
    // Only scan DEFAULT_UPSTASH_LIVE_CASE_RUNNERS block — not createPassing*.
    const defaultIdx = source.indexOf("DEFAULT_UPSTASH_LIVE_CASE_RUNNERS");
    if (defaultIdx < 0) {
      return {
        ok: false,
        message: "DEFAULT_UPSTASH_LIVE_CASE_RUNNERS not found in live-matrix.ts.",
      };
    }
    const slice = source.slice(defaultIdx);
    const stubs = slice.match(STUB_RUNNER_RE);
    if (stubs != null && stubs.length > 0) {
      return {
        ok: false,
        message: `DEFAULT_UPSTASH_LIVE_CASE_RUNNERS still contains ${stubs.length} stub pass(() ) runner(s).`,
      };
    }
    // createPassing may use stubs — ensure it is not assigned as DEFAULT.
    if (/DEFAULT_UPSTASH_LIVE_CASE_RUNNERS\s*=\s*createPassing/.test(source)) {
      return {
        ok: false,
        message: "DEFAULT runners must not alias createPassingUpstashLiveCaseRunners.",
      };
    }
    // 2D.1B: enqueue.render must use attributed helper (stage/reason separation).
    if (!/runAttributedRenderEnqueue/.test(source)) {
      return {
        ok: false,
        message: "live-matrix must use runAttributedRenderEnqueue for enqueue.render.",
      };
    }
    // 2D.1C: consume.terminal.noop must use attributed terminal helper.
    if (!/runAttributedTerminalNoopConsume/.test(source)) {
      return {
        ok: false,
        message:
          "live-matrix must use runAttributedTerminalNoopConsume for consume.terminal.noop.",
      };
    }
    // 2D.1D: universal case delivery authority + duplicate attribution.
    if (!/acquireIsolatedCaseDelivery/.test(source)) {
      return {
        ok: false,
        message:
          "live-matrix must use acquireIsolatedCaseDelivery for isolated delivery cases.",
      };
    }
    if (!/runAttributedDuplicateLiveConsume/.test(source)) {
      return {
        ok: false,
        message:
          "live-matrix must use runAttributedDuplicateLiveConsume for consume.duplicate.live.",
      };
    }
    // Reject uncorrelated first-item anti-pattern in DEFAULT runners.
    const defaultBlock = source.slice(defaultIdx);
    const endMatch = defaultBlock.match(/\n\}\);/);
    const defaultBody =
      endMatch != null
        ? defaultBlock.slice(0, endMatch.index ?? defaultBlock.length)
        : defaultBlock;
    if (/read\.value\[0\]/.test(defaultBody)) {
      return {
        ok: false,
        message:
          "DEFAULT_UPSTASH_LIVE_CASE_RUNNERS must not use uncorrelated read.value[0].",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Stub-boundary source scan failed.",
    };
  }
}

/**
 * Production harness path must not construct FakeRedis; must import cleanup +
 * schema preflight.
 */
export function assertUpstashLiveHarnessProductionWiring(
  cwd: string = process.cwd(),
): UpstashStubBoundaryResult {
  try {
    const source = readRepoFile(HARNESS_RELATIVE, cwd);
    if (/new\s+FakeRedisStreams\s*\(/.test(source)) {
      return {
        ok: false,
        message: "run-upstash-live-harness must not construct FakeRedisStreams.",
      };
    }
    if (!/defaultUpstashLiveCleanup|from\s+["']\.\/cleanup["']/.test(source)) {
      return {
        ok: false,
        message: "Harness must import cleanup.",
      };
    }
    if (!/runHeadlessSchemaPreflight/.test(source)) {
      return {
        ok: false,
        message: "Harness must call runHeadlessSchemaPreflight.",
      };
    }
    if (!/assertDefaultUpstashLiveRunnersAreNotStubs/.test(source)) {
      return {
        ok: false,
        message: "Harness must refuse stubs before provider contact.",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Harness wiring scan failed.",
    };
  }
}
