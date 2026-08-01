/**
 * Server-side production isolation for the mixed-media scenes QA harness.
 * Fail-closed outside the explicitly permitted local-development context.
 */

import { notFound } from "next/navigation";

/**
 * Pure permit decision — only Next.js local `development` may serve the harness.
 * Production, test, and unset NODE_ENV all deny (fail closed).
 */
export function isLocalDevQaHarnessAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development";
}

/**
 * Call from the harness route Server Component before rendering any UI.
 * Invokes Next.js `notFound()` when the harness must stay unavailable.
 */
export function assertLocalDevQaHarnessAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (!isLocalDevQaHarnessAllowed(nodeEnv)) {
    notFound();
  }
}
