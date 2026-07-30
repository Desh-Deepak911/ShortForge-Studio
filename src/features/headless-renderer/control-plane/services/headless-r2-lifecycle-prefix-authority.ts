/**
 * Canonical staging artifact prefix patterns for lifecycle policy generation.
 *
 * Prefixes are derived from storage key authority — never hand-written bucket
 * names or raw owner identifiers.
 */


import type { HeadlessR2EnvironmentNamespace } from "./r2-object-key-authority";

const STAGING_ENV: HeadlessR2EnvironmentNamespace = "staging";

/**
 * Returns the prefix pattern for finalized staging export artifacts only.
 * Production namespaces are excluded by construction.
 */
export function buildHeadlessStagingArtifactPrefixPattern(): string {
  return `${STAGING_ENV}/finalized/artifacts/artifact/`;
}

/**
 * Returns true when a candidate prefix could match production object namespaces.
 */
export function isHeadlessProductionPrefixCandidate(prefix: string): boolean {
  return (
    prefix.startsWith("production/") ||
    prefix.includes("/production/") ||
    prefix === "production"
  );
}
