/**
 * Sprint 11E Phase 2E.2D.4 — Fly staging template materialization + audit.
 * Pure local string authority — never writes to disk unless callers do.
 */

import {
  classifyHeadlessFlyStagingAppName,
  type HeadlessFlyStagingAppNameClassification,
} from "./fly-staging-app-name";
import { HEADLESS_FLY_STAGING_PUBLIC_ENV } from "./fly-staging-env-ledger";
import {
  HEADLESS_FLY_STAGING_KILL_SIGNAL,
  HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS,
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_RENDER_VM,
  HEADLESS_FLY_STAGING_VERIFY_VM,
} from "./fly-staging-topology";

export const HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH =
  "deploy/headless-worker/fly.staging.template.toml" as const;

/** Verify-only first activation — render process group absent. */
export const HEADLESS_FLY_STAGING_VERIFY_FIRST_TEMPLATE_RELATIVE_PATH =
  "deploy/headless-worker/fly.staging.verify-first.template.toml" as const;

export const HEADLESS_FLY_STAGING_APP_PLACEHOLDER =
  "REPLACE_WITH_STAGING_APP_NAME" as const;

export type HeadlessFlyStagingTemplateAuditReasonId =
  | "ok"
  | "missing_process_groups"
  | "wrong_region"
  | "wrong_resources"
  | "public_service_exposure"
  | "worker_mode_in_env"
  | "secret_literal_present"
  | "image_class_mismatch"
  | "missing_placeholders"
  | "kill_signal_mismatch"
  | "hostile_input";

export type HeadlessFlyStagingTemplateAudit = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingTemplateAuditReasonId;
};

/**
 * Audit the committed staging template (placeholders allowed for app name).
 */
export function auditHeadlessFlyStagingTemplate(
  toml: unknown,
): HeadlessFlyStagingTemplateAudit {
  try {
    if (typeof toml !== "string" || toml.length === 0) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    if (!toml.includes(HEADLESS_FLY_STAGING_APP_PLACEHOLDER)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing_placeholders",
      });
    }
    if (
      !/verify\s*=\s*"verify"/.test(toml) ||
      !/render\s*=\s*"render"/.test(toml)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing_process_groups",
      });
    }
    if (
      !new RegExp(
        `primary_region\\s*=\\s*"${HEADLESS_FLY_STAGING_PRIMARY_REGION}"`,
      ).test(toml)
    ) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_region" });
    }
    if (
      !/processes\s*=\s*\["verify"\]/.test(toml) ||
      !/processes\s*=\s*\["render"\]/.test(toml) ||
      !new RegExp(`cpu_kind\\s*=\\s*"${HEADLESS_FLY_STAGING_VERIFY_VM.cpuKind}"`).test(
        toml,
      ) ||
      !new RegExp(`cpus\\s*=\\s*${HEADLESS_FLY_STAGING_VERIFY_VM.cpus}`).test(
        toml,
      ) ||
      !new RegExp(
        `memory_mb\\s*=\\s*${HEADLESS_FLY_STAGING_VERIFY_VM.memoryMb}`,
      ).test(toml) ||
      !new RegExp(
        `cpu_kind\\s*=\\s*"${HEADLESS_FLY_STAGING_RENDER_VM.cpuKind}"`,
      ).test(toml) ||
      !new RegExp(`cpus\\s*=\\s*${HEADLESS_FLY_STAGING_RENDER_VM.cpus}`).test(
        toml,
      ) ||
      !new RegExp(
        `memory_mb\\s*=\\s*${HEADLESS_FLY_STAGING_RENDER_VM.memoryMb}`,
      ).test(toml)
    ) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_resources" });
    }
    if (/^\[\[services\]\]/m.test(toml) || /^\[http_service\]/m.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "public_service_exposure",
      });
    }
    if (/HEADLESS_WORKER_MODE\s*=/.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "worker_mode_in_env",
      });
    }
    if (
      /UPSTASH_REDIS_REST_|DATABASE_URL\s*=|R2_SECRET_ACCESS_KEY\s*=|sk_live|rediss:\/\//i.test(
        toml,
      )
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "secret_literal_present",
      });
    }
    if (
      !new RegExp(
        `HEADLESS_HOSTED_IMAGE_CLASS\\s*=\\s*"${HEADLESS_FLY_STAGING_PUBLIC_ENV.HEADLESS_HOSTED_IMAGE_CLASS}"`,
      ).test(toml)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "image_class_mismatch",
      });
    }
    if (
      !new RegExp(
        `kill_signal\\s*=\\s*"${HEADLESS_FLY_STAGING_KILL_SIGNAL}"`,
      ).test(toml) ||
      !new RegExp(
        `kill_timeout\\s*=\\s*${HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS}`,
      ).test(toml)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "kill_signal_mismatch",
      });
    }
    return Object.freeze({ status: "ok", reasonId: "ok" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export type HeadlessFlyStagingMaterializeResult = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok"
    | "template_invalid"
    | HeadlessFlyStagingAppNameClassification["reasonId"];
  readonly toml: string | null;
  readonly appName: string | null;
};

/**
 * Replace the app-name placeholder. Region is already pinned to iad in template.
 */
export function materializeHeadlessFlyStagingToml(
  templateToml: unknown,
  appName: unknown,
): HeadlessFlyStagingMaterializeResult {
  const templateAudit = auditHeadlessFlyStagingTemplate(templateToml);
  if (templateAudit.status !== "ok") {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
    });
  }
  const nameClass = classifyHeadlessFlyStagingAppName(appName);
  if (nameClass.status !== "ok" || nameClass.appName == null) {
    return Object.freeze({
      status: "invalid",
      reasonId: nameClass.reasonId,
      toml: null,
      appName: null,
    });
  }
  const toml = (templateToml as string).split(
    HEADLESS_FLY_STAGING_APP_PLACEHOLDER,
  ).join(nameClass.appName);
  if (toml.includes(HEADLESS_FLY_STAGING_APP_PLACEHOLDER)) {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
    });
  }
  // Re-audit materialized form: placeholder gone, app name present.
  if (
    /^\[\[services\]\]/m.test(toml) ||
    /HEADLESS_WORKER_MODE\s*=/.test(toml)
  ) {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
    });
  }
  return Object.freeze({
    status: "ok",
    reasonId: "ok",
    toml,
    appName: nameClass.appName,
  });
}

export type HeadlessFlyStagingVerifyFirstTemplateAuditReasonId =
  | "ok"
  | "missing_verify_process"
  | "render_process_present"
  | "wrong_region"
  | "wrong_resources"
  | "public_service_exposure"
  | "worker_mode_in_env"
  | "secret_literal_present"
  | "image_class_mismatch"
  | "missing_placeholders"
  | "kill_signal_mismatch"
  | "hostile_input";

export type HeadlessFlyStagingVerifyFirstTemplateAudit = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingVerifyFirstTemplateAuditReasonId;
};

/**
 * Audit verify-first template: verify-only, no render, no public services.
 */
export function auditHeadlessFlyStagingVerifyFirstTemplate(
  toml: unknown,
): HeadlessFlyStagingVerifyFirstTemplateAudit {
  try {
    if (typeof toml !== "string" || toml.length === 0) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    if (!toml.includes(HEADLESS_FLY_STAGING_APP_PLACEHOLDER)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing_placeholders",
      });
    }
    if (!/verify\s*=\s*"verify"/.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing_verify_process",
      });
    }
    if (/render\s*=\s*"render"/.test(toml) || /processes\s*=\s*\["render"\]/.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "render_process_present",
      });
    }
    if (
      !new RegExp(
        `primary_region\\s*=\\s*"${HEADLESS_FLY_STAGING_PRIMARY_REGION}"`,
      ).test(toml)
    ) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_region" });
    }
    if (
      !/processes\s*=\s*\["verify"\]/.test(toml) ||
      !new RegExp(`cpu_kind\\s*=\\s*"${HEADLESS_FLY_STAGING_VERIFY_VM.cpuKind}"`).test(
        toml,
      ) ||
      !new RegExp(`cpus\\s*=\\s*${HEADLESS_FLY_STAGING_VERIFY_VM.cpus}`).test(
        toml,
      ) ||
      !new RegExp(
        `memory_mb\\s*=\\s*${HEADLESS_FLY_STAGING_VERIFY_VM.memoryMb}`,
      ).test(toml)
    ) {
      return Object.freeze({ status: "invalid", reasonId: "wrong_resources" });
    }
    if (/^\[\[services\]\]/m.test(toml) || /^\[http_service\]/m.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "public_service_exposure",
      });
    }
    if (/HEADLESS_WORKER_MODE\s*=/.test(toml)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "worker_mode_in_env",
      });
    }
    if (
      /UPSTASH_REDIS_REST_|DATABASE_URL\s*=|R2_SECRET_ACCESS_KEY\s*=|sk_live|rediss:\/\//i.test(
        toml,
      )
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "secret_literal_present",
      });
    }
    if (
      !new RegExp(
        `HEADLESS_HOSTED_IMAGE_CLASS\\s*=\\s*"${HEADLESS_FLY_STAGING_PUBLIC_ENV.HEADLESS_HOSTED_IMAGE_CLASS}"`,
      ).test(toml)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "image_class_mismatch",
      });
    }
    if (
      !new RegExp(
        `kill_signal\\s*=\\s*"${HEADLESS_FLY_STAGING_KILL_SIGNAL}"`,
      ).test(toml) ||
      !new RegExp(
        `kill_timeout\\s*=\\s*${HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS}`,
      ).test(toml)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "kill_signal_mismatch",
      });
    }
    return Object.freeze({ status: "ok", reasonId: "ok" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export function materializeHeadlessFlyStagingVerifyFirstToml(
  templateToml: unknown,
  appName: unknown,
): HeadlessFlyStagingMaterializeResult {
  const templateAudit = auditHeadlessFlyStagingVerifyFirstTemplate(templateToml);
  if (templateAudit.status !== "ok") {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
    });
  }
  const nameClass = classifyHeadlessFlyStagingAppName(appName);
  if (nameClass.status !== "ok" || nameClass.appName == null) {
    return Object.freeze({
      status: "invalid",
      reasonId: nameClass.reasonId,
      toml: null,
      appName: null,
    });
  }
  const toml = (templateToml as string).split(
    HEADLESS_FLY_STAGING_APP_PLACEHOLDER,
  ).join(nameClass.appName);
  if (
    toml.includes(HEADLESS_FLY_STAGING_APP_PLACEHOLDER) ||
    /render\s*=\s*"render"/.test(toml) ||
    /^\[\[services\]\]/m.test(toml)
  ) {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
    });
  }
  return Object.freeze({
    status: "ok",
    reasonId: "ok",
    toml,
    appName: nameClass.appName,
  });
}
