/**
 * Sprint 11E Phase 2E.2D.8A — Fly staging render Machine inventory authority (local).
 */

import {
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_RENDER_VM,
  HEADLESS_FLY_STAGING_VERIFY_VM,
} from "./fly-staging-topology";
import { parseHeadlessFlyStagingMachineId } from "./fly-staging-machine-id-authority";
import type { HeadlessFlyStagingVerifyMachineSnapshot } from "./fly-staging-secret-activation";

const DIGEST_RE = /^[a-f0-9]{64}$/i;

export type HeadlessFlyStagingRenderMachineSnapshot =
  HeadlessFlyStagingVerifyMachineSnapshot;

export type HeadlessFlyStagingDualMachineInventory = {
  readonly verify: HeadlessFlyStagingVerifyMachineSnapshot | null;
  readonly render: HeadlessFlyStagingRenderMachineSnapshot | null;
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly otherCount: number;
};

function parseMachineRow(
  m: Record<string, unknown>,
): HeadlessFlyStagingVerifyMachineSnapshot | null {
  const idParsed = parseHeadlessFlyStagingMachineId(m.id);
  if (!idParsed.ok) return null;
  const id = idParsed.machineId;
  const config = (m.config as Record<string, unknown> | undefined) ?? {};
  const meta =
    (config.metadata as Record<string, unknown> | undefined) ??
    (m.metadata as Record<string, unknown> | undefined) ??
    {};
  const groupRaw = meta.fly_process_group;
  const processGroup =
    groupRaw === "verify"
      ? "verify"
      : groupRaw === "render"
        ? "render"
        : "other";
  const guest = (config.guest as Record<string, unknown> | undefined) ?? {};
  const region = typeof m.region === "string" ? m.region : "";
  const cpuKind =
    typeof guest.cpu_kind === "string"
      ? guest.cpu_kind
      : typeof guest.cpuKind === "string"
        ? guest.cpuKind
        : "";
  const cpus = Number(guest.cpus);
  const memoryMb = Number(guest.memory_mb ?? guest.memoryMb);
  let imageDigestSha256: string | null = null;
  const image = config.image;
  if (typeof image === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(image);
    if (match) imageDigestSha256 = match[1]!.toLowerCase();
  }
  const imageRef = m.image_ref as Record<string, unknown> | undefined;
  if (
    imageDigestSha256 == null &&
    imageRef &&
    typeof imageRef.digest === "string" &&
    DIGEST_RE.test(imageRef.digest)
  ) {
    imageDigestSha256 = imageRef.digest.toLowerCase();
  }
  return Object.freeze({
    machineId: id,
    processGroup,
    region,
    cpuKind,
    cpus,
    memoryMb,
    imageDigestSha256,
  });
}

export function parseHeadlessFlyStagingDualMachineInventoryFromListJson(
  json: unknown,
): HeadlessFlyStagingDualMachineInventory {
  const empty: HeadlessFlyStagingDualMachineInventory = Object.freeze({
    verify: null,
    render: null,
    verifyCount: 0,
    renderCount: 0,
    otherCount: 0,
  });
  try {
    if (!Array.isArray(json)) return empty;
    let verify: HeadlessFlyStagingRenderMachineSnapshot | null = null;
    let render: HeadlessFlyStagingRenderMachineSnapshot | null = null;
    let verifyCount = 0;
    let renderCount = 0;
    let otherCount = 0;
    for (const row of json) {
      if (row == null || typeof row !== "object") {
        otherCount += 1;
        continue;
      }
      const parsed = parseMachineRow(row as Record<string, unknown>);
      if (parsed == null) {
        otherCount += 1;
        continue;
      }
      if (parsed.processGroup === "verify") {
        verifyCount += 1;
        verify = parsed;
      } else if (parsed.processGroup === "render") {
        renderCount += 1;
        render = parsed;
      } else {
        otherCount += 1;
      }
    }
    return Object.freeze({
      verify,
      render,
      verifyCount,
      renderCount,
      otherCount,
    });
  } catch {
    return empty;
  }
}

export type HeadlessFlyStagingRenderVmSpecReasonId =
  | "ok"
  | "wrong_region"
  | "wrong_cpu_kind"
  | "wrong_cpus"
  | "wrong_memory"
  | "wrong_process_group"
  | "hostile_input";

export function classifyHeadlessFlyStagingRenderVmSpec(
  machine: unknown,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingRenderVmSpecReasonId;
} {
  try {
    if (machine == null || typeof machine !== "object") {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    const m = machine as HeadlessFlyStagingRenderMachineSnapshot;
    if (m.processGroup !== "render") {
      return Object.freeze({ status: "invalid", reasonId: "wrong_process_group" });
    }
    if (m.region !== HEADLESS_FLY_STAGING_PRIMARY_REGION) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_region" });
    }
    if (m.cpuKind !== HEADLESS_FLY_STAGING_RENDER_VM.cpuKind) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_cpu_kind" });
    }
    if (m.cpus !== HEADLESS_FLY_STAGING_RENDER_VM.cpus) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_cpus" });
    }
    if (m.memoryMb !== HEADLESS_FLY_STAGING_RENDER_VM.memoryMb) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_memory" });
    }
    return Object.freeze({ status: "ok", reasonId: "ok" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export function classifyHeadlessFlyStagingVerifyVmSpec(
  machine: unknown,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingRenderVmSpecReasonId;
} {
  try {
    if (machine == null || typeof machine !== "object") {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    const m = machine as HeadlessFlyStagingVerifyMachineSnapshot;
    if (m.processGroup !== "verify") {
      return Object.freeze({ status: "invalid", reasonId: "wrong_process_group" });
    }
    if (m.region !== HEADLESS_FLY_STAGING_PRIMARY_REGION) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_region" });
    }
    if (m.cpuKind !== HEADLESS_FLY_STAGING_VERIFY_VM.cpuKind) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_cpu_kind" });
    }
    if (m.cpus !== HEADLESS_FLY_STAGING_VERIFY_VM.cpus) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_cpus" });
    }
    if (m.memoryMb !== HEADLESS_FLY_STAGING_VERIFY_VM.memoryMb) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_memory" });
    }
    return Object.freeze({ status: "ok", reasonId: "ok" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}
