/**
 * Fly render live PASS evidence authority.
 */

import {
  embeddedSchemaFingerprintAsPreflightSources,
} from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";
import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-activation-authority";

import {
  checksumPrefix,
  type FlyRenderLiveEvidenceDocument,
} from "./evidence";
import { assertFlyRenderLiveEvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  assertExactRequiredFlyRenderLiveCasePassAuthority,
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
} from "./required-cases";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./smoke-workload";
import { validateHostedRenderResourceObservation } from "./process-tree-peak-memory";

export const FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS = Object.freeze([
  "000_headless_schema_migrations",
  "001_headless_project_ownership",
  "002_headless_jobs",
  "004_headless_owned_objects",
  "005_headless_cleanup_intents",
  "006_headless_render_dispatch_outbox",
  "007_headless_owned_object_slot_key_capacity",
] as const);

const CLEANUP_OK = new Set(["ok", "preserved"]);

const SECRETISH =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|registry\.fly\.io\/)/i;

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.length >= 20 && value.length <= 40;
}

export function buildFlyRenderLiveSchemaFingerprint(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
} {
  const sources = embeddedSchemaFingerprintAsPreflightSources();
  const byId = new Map(sources.map((s) => [s.migrationId, s.checksumSha256]));
  const migrationIds: string[] = [];
  const checksumPrefixes: string[] = [];
  for (const id of FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS) {
    const checksum = byId.get(id);
    if (checksum == null || checksum.length < 12) {
      throw new Error(`Missing required migration ${id}`);
    }
    migrationIds.push(id);
    checksumPrefixes.push(checksumPrefix(checksum));
  }
  return Object.freeze({
    migrationIds: Object.freeze(migrationIds.slice()),
    checksumPrefixes: Object.freeze(checksumPrefixes.slice()),
  });
}

export function validatePassFlyRenderLiveEvidence(input: {
  readonly document: unknown;
}):
  | { readonly ok: true; readonly document: FlyRenderLiveEvidenceDocument }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(input.document)) {
      return { ok: false, message: "Hostile evidence rejected." };
    }
    const doc = input.document as FlyRenderLiveEvidenceDocument;
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall must be PASS." };
    }
    if (
      typeof doc.startedAtIso !== "string" ||
      typeof doc.endedAtIso !== "string" ||
      !isIsoTimestamp(doc.startedAtIso) ||
      !isIsoTimestamp(doc.endedAtIso)
    ) {
      return { ok: false, message: "timestamps invalid." };
    }
    if (!CLEANUP_OK.has(doc.cleanupStatus)) {
      return { ok: false, message: "cleanupStatus must be ok or preserved." };
    }
    const membership = assertExactRequiredFlyRenderLiveCasePassAuthority(doc.cases);
    if (!membership.ok) {
      return { ok: false, message: membership.message };
    }
    if (doc.cases.length !== REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length) {
      return { ok: false, message: "case count mismatch." };
    }
    if (
      doc.acceptedImageDigestSha256 !==
      resolveCurrentFlyStagingAcceptedImageDigestSha256()
    ) {
      return { ok: false, message: "accepted image digest mismatch." };
    }
    if (doc.flyRenderTopology == null) {
      return { ok: false, message: "topology missing." };
    }
    if (
      doc.flyRenderTopology.verifyCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY.verifyCount ||
      doc.flyRenderTopology.renderCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY.renderCount
    ) {
      return { ok: false, message: "topology must be verify=1 render=1." };
    }
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    if (
      doc.smokeWorkload == null ||
      doc.smokeWorkload.profileId !== smoke.profileId ||
      doc.smokeWorkload.claims4kCapacity !== false
    ) {
      return { ok: false, message: "smoke workload boundary invalid." };
    }
    if (doc.resourceObservation != null) {
      const resource = validateHostedRenderResourceObservation(
        doc.resourceObservation,
      );
      if (!resource.ok) {
        return { ok: false, message: resource.message };
      }
    }
    const privacy = assertFlyRenderLiveEvidencePrivacyStructure(doc);
    if (!privacy.ok) {
      return { ok: false, message: privacy.message };
    }
    const rendered = JSON.stringify(doc);
    if (SECRETISH.test(rendered)) {
      return { ok: false, message: "secret-like content in evidence." };
    }
    return { ok: true, document: doc };
  } catch {
    return { ok: false, message: "Hostile evidence rejected." };
  }
}

export const FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST =
  resolveCurrentFlyStagingAcceptedImageDigestSha256();
