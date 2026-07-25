/**
 * QA-only run-scoped remote stream namespace (Sprint 11E 2D.1F / 2D.1F.1).
 * Derived from trusted envName + runId + fixed namespace version — never user input.
 * Binding validation is total and hostile-input safe.
 */

import { createHash } from "node:crypto";

import type { HeadlessEnvName } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { isExactQaRunScopedStreamKey } from "@/features/headless-renderer/control-plane/runtime/qa-run-scoped-stream-key";
import type { HeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import {
  guardHeadlessStructure,
  hasOwnPlainField,
  hasUnknownFields,
  isPlainObject,
} from "@/features/headless-renderer/domain/headless-hostile-guard";

export const QA_RUN_QUEUE_NAMESPACE_VERSION = "v1" as const;

export type UpstashLiveStreamAuthority = "production_env" | "qa_run_scoped";

/** Evidence-facing group authority for production-protocol worker groups. */
export type UpstashLiveGroupAuthorityEvidence =
  | "production_protocol"
  | "qa_group";

export type QaRunScopedStreamNames = HeadlessQueueStreamNames;

export type QaRunScopedStreamBinding = {
  readonly streamAuthority: "qa_run_scoped";
  readonly groupAuthority: "production_protocol";
  readonly namespaceVersion: typeof QA_RUN_QUEUE_NAMESPACE_VERSION;
  readonly envName: HeadlessEnvName;
  /** Bounded hex digest — never the raw runId. */
  readonly runDigest: string;
  readonly names: QaRunScopedStreamNames;
};

const ENV_SET = new Set<string>(["local", "staging", "production"]);
const RUN_ID_MAX = 128;
const DIGEST_RE = /^[a-f0-9]{32}$/;

const BINDING_OWN_KEYS = Object.freeze([
  "streamAuthority",
  "groupAuthority",
  "namespaceVersion",
  "envName",
  "runDigest",
  "names",
] as const);

const NAMES_OWN_KEYS = Object.freeze([
  "renderStream",
  "renderDlq",
  "verifyStream",
  "verifyDlq",
  "renderGroup",
  "verifyGroup",
] as const);

function runDigest(envName: HeadlessEnvName, runId: string): string {
  return createHash("sha256")
    .update(`qa-run\0${envName}\0${runId}\0${QA_RUN_QUEUE_NAMESPACE_VERSION}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function key(
  kind: "render" | "verify" | "render-dlq" | "verify-dlq",
  envName: HeadlessEnvName,
  digest: string,
): string {
  return `hfq:qa-run:${QA_RUN_QUEUE_NAMESPACE_VERSION}:${kind}:${envName}:${digest}`;
}

function safeReadString(record: Record<string, unknown>, field: string): string | null {
  try {
    if (!hasOwnPlainField(record, field)) return null;
    const v = record[field];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Detached deeply frozen canonical binding from trusted primitives only.
 * Never spreads untrusted objects.
 */
function detachFrozenBinding(input: {
  readonly envName: HeadlessEnvName;
  readonly runDigest: string;
  readonly renderStream: string;
  readonly renderDlq: string;
  readonly verifyStream: string;
  readonly verifyDlq: string;
}): QaRunScopedStreamBinding {
  return Object.freeze({
    streamAuthority: "qa_run_scoped" as const,
    groupAuthority: "production_protocol" as const,
    namespaceVersion: QA_RUN_QUEUE_NAMESPACE_VERSION,
    envName: input.envName,
    runDigest: input.runDigest,
    names: Object.freeze({
      renderStream: input.renderStream,
      renderDlq: input.renderDlq,
      verifyStream: input.verifyStream,
      verifyDlq: input.verifyDlq,
      renderGroup: "hfq:render-workers" as const,
      verifyGroup: "hfq:verify-workers" as const,
    }),
  });
}

/**
 * Total validation: structure/cycle guard, exact own keys, safe property access.
 * Returns a detached deeply frozen canonical binding, or null (never throws).
 * Does not call any spread-based freeze helper on untrusted input.
 */
export function canonicalizeQaRunScopedStreamBinding(
  value: unknown,
): QaRunScopedStreamBinding | null {
  try {
    if (guardHeadlessStructure(value) != null) return null;
    if (!isPlainObject(value)) return null;
    if (hasUnknownFields(value, BINDING_OWN_KEYS) != null) return null;
    for (const k of BINDING_OWN_KEYS) {
      if (!hasOwnPlainField(value, k)) return null;
    }

    const streamAuthority = safeReadString(value, "streamAuthority");
    const groupAuthority = safeReadString(value, "groupAuthority");
    const namespaceVersion = safeReadString(value, "namespaceVersion");
    const envNameRaw = safeReadString(value, "envName");
    const digest = safeReadString(value, "runDigest");
    if (streamAuthority !== "qa_run_scoped") return null;
    if (groupAuthority !== "production_protocol") return null;
    if (namespaceVersion !== QA_RUN_QUEUE_NAMESPACE_VERSION) return null;
    if (envNameRaw == null || !ENV_SET.has(envNameRaw)) return null;
    if (digest == null || !DIGEST_RE.test(digest)) return null;

    let namesRaw: unknown;
    try {
      namesRaw = value.names;
    } catch {
      return null;
    }
    if (guardHeadlessStructure(namesRaw) != null) return null;
    if (!isPlainObject(namesRaw)) return null;
    if (hasUnknownFields(namesRaw, NAMES_OWN_KEYS) != null) return null;
    for (const k of NAMES_OWN_KEYS) {
      if (!hasOwnPlainField(namesRaw, k)) return null;
    }

    const renderGroup = safeReadString(namesRaw, "renderGroup");
    const verifyGroup = safeReadString(namesRaw, "verifyGroup");
    if (renderGroup !== "hfq:render-workers") return null;
    if (verifyGroup !== "hfq:verify-workers") return null;

    const envName = envNameRaw as HeadlessEnvName;
    const expectedRender = key("render", envName, digest);
    const expectedVerify = key("verify", envName, digest);
    const expectedRenderDlq = key("render-dlq", envName, digest);
    const expectedVerifyDlq = key("verify-dlq", envName, digest);

    const renderStream = safeReadString(namesRaw, "renderStream");
    const verifyStream = safeReadString(namesRaw, "verifyStream");
    const renderDlq = safeReadString(namesRaw, "renderDlq");
    const verifyDlq = safeReadString(namesRaw, "verifyDlq");
    if (
      renderStream !== expectedRender ||
      verifyStream !== expectedVerify ||
      renderDlq !== expectedRenderDlq ||
      verifyDlq !== expectedVerifyDlq
    ) {
      return null;
    }
    if (
      !isExactQaRunScopedStreamKey(renderStream) ||
      !isExactQaRunScopedStreamKey(verifyStream) ||
      !isExactQaRunScopedStreamKey(renderDlq) ||
      !isExactQaRunScopedStreamKey(verifyDlq)
    ) {
      return null;
    }

    return detachFrozenBinding({
      envName,
      runDigest: digest,
      renderStream,
      renderDlq,
      verifyStream,
      verifyDlq,
    });
  } catch {
    return null;
  }
}

/**
 * Derive unguessable run-scoped stream/DLQ keys + production worker group identities.
 * Returns null on hostile/malformed inputs (fail closed).
 */
export function deriveQaRunScopedStreamBinding(input: {
  readonly envName: HeadlessEnvName;
  readonly runId: string;
}): QaRunScopedStreamBinding | null {
  try {
    const { envName, runId } = input;
    if (typeof envName !== "string" || !ENV_SET.has(envName)) return null;
    if (typeof runId !== "string" || runId.length === 0 || runId.length > RUN_ID_MAX) {
      return null;
    }
    if (/[\0-\x1f\x7f]/.test(runId)) return null;

    const digest = runDigest(envName, runId);
    if (!DIGEST_RE.test(digest)) return null;

    return detachFrozenBinding({
      envName,
      runDigest: digest,
      renderStream: key("render", envName, digest),
      renderDlq: key("render-dlq", envName, digest),
      verifyStream: key("verify", envName, digest),
      verifyDlq: key("verify-dlq", envName, digest),
    });
  } catch {
    return null;
  }
}

/** Predicate over canonicalize (never throws). */
export function isValidQaRunScopedStreamBinding(
  value: unknown,
): value is QaRunScopedStreamBinding {
  return canonicalizeQaRunScopedStreamBinding(value) != null;
}

/** Reject cross-run / forged stream keys against a trusted binding. */
export function streamKeyBelongsToQaRunBinding(
  binding: QaRunScopedStreamBinding,
  streamKey: string,
): boolean {
  const canonical = canonicalizeQaRunScopedStreamBinding(binding);
  if (canonical == null) return false;
  if (typeof streamKey !== "string") return false;
  return (
    streamKey === canonical.names.renderStream ||
    streamKey === canonical.names.verifyStream ||
    streamKey === canonical.names.renderDlq ||
    streamKey === canonical.names.verifyDlq
  );
}

/**
 * Authorized production-protocol group for a run-scoped stream key, or null.
 * DLQ keys have no authorized groups in v1.
 */
export function authorizedGroupForQaRunScopedStream(
  binding: QaRunScopedStreamBinding,
  streamKey: string,
): "hfq:render-workers" | "hfq:verify-workers" | null {
  const canonical = canonicalizeQaRunScopedStreamBinding(binding);
  if (canonical == null) return null;
  if (streamKey === canonical.names.renderStream) return "hfq:render-workers";
  if (streamKey === canonical.names.verifyStream) return "hfq:verify-workers";
  return null;
}

export { isExactQaRunScopedStreamKey };
