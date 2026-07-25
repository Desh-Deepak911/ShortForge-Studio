/**
 * Hostile-input traversal guards for total validators.
 */

import {
  HEADLESS_MAX_STRUCTURE_DEPTH,
  HEADLESS_MAX_STRUCTURE_NODES,
} from "./headless-render-constants";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import type { HeadlessIntegrityResult } from "./headless-render.types";

export type HeadlessHostileGuardFailure = {
  readonly ok: false;
  readonly issues: HeadlessIntegrityResult["issues"];
};

export function guardHeadlessStructure(
  value: unknown,
): HeadlessHostileGuardFailure | null {
  try {
    let nodes = 0;
    // Path-stack cycle detection (allows shared DAG refs; rejects true cycles).
    const stack = new WeakSet<object>();

    const walk = (
      node: unknown,
      depth: number,
    ): HeadlessHostileGuardFailure | null => {
      if (depth > HEADLESS_MAX_STRUCTURE_DEPTH) {
        return headlessFail(
          headlessIssue("HOSTILE_INPUT", "Input structure exceeds maximum depth."),
        );
      }
      if (node === null || typeof node !== "object") {
        return null;
      }
      if (stack.has(node as object)) {
        return headlessFail(
          headlessIssue("HOSTILE_INPUT", "Cyclic object graph rejected."),
        );
      }
      stack.add(node as object);
      nodes += 1;
      if (nodes > HEADLESS_MAX_STRUCTURE_NODES) {
        stack.delete(node as object);
        return headlessFail(
          headlessIssue("HOSTILE_INPUT", "Input structure exceeds maximum size."),
        );
      }

      try {
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) {
            const nested = walk(node[i], depth + 1);
            if (nested) return nested;
          }
          return null;
        }

        const keys = Reflect.ownKeys(node as object);
        for (const key of keys) {
          if (typeof key === "symbol") {
            return headlessFail(
              headlessIssue("UNKNOWN_FIELD", "Symbol keys are not allowed."),
            );
          }
          const nested = walk((node as Record<string, unknown>)[key], depth + 1);
          if (nested) return nested;
        }
        return null;
      } finally {
        stack.delete(node as object);
      }
    };

    return walk(value, 0);
  } catch {
    return headlessFail(
      headlessIssue("HOSTILE_INPUT", "Hostile or unreadable input rejected."),
    );
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function hasUnknownFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  try {
    const allow = new Set(allowed);
    for (const key of Object.keys(record)) {
      if (!allow.has(key)) return key;
    }
    return null;
  } catch {
    // Caller total-validators treat non-null as unknown-field failure.
    return "__hostile_own_keys__";
  }
}

/** Own-key presence check that never throws on hostile Proxies. */
export function hasOwnPlainField(
  record: Record<string, unknown>,
  key: string,
): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(record, key);
  } catch {
    return false;
  }
}
