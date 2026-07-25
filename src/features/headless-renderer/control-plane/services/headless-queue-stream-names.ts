/**
 * Derive Upstash Streams / consumer-group names from trusted env name only.
 * Never accept client-supplied stream or group names.
 */

import type { HeadlessEnvName } from "../runtime/upstash-environment";

export type HeadlessQueueStreamNames = {
  readonly renderStream: string;
  readonly renderDlq: string;
  readonly verifyStream: string;
  readonly verifyDlq: string;
  readonly renderGroup: "hfq:render-workers";
  readonly verifyGroup: "hfq:verify-workers";
};

const ENV_SET = new Set<string>(["local", "staging", "production"]);

/**
 * Server-derived stream names. Throws nothing — returns null on hostile envName.
 */
export function deriveHeadlessQueueStreamNames(
  envName: HeadlessEnvName,
): HeadlessQueueStreamNames {
  if (typeof envName !== "string" || !ENV_SET.has(envName)) {
    throw new TypeError("HEADLESS_ENV_NAME must be local|staging|production.");
  }
  return Object.freeze({
    renderStream: `hfq:render:${envName}`,
    renderDlq: `hfq:render-dlq:${envName}`,
    verifyStream: `hfq:verify:${envName}`,
    verifyDlq: `hfq:verify-dlq:${envName}`,
    renderGroup: "hfq:render-workers" as const,
    verifyGroup: "hfq:verify-workers" as const,
  });
}
