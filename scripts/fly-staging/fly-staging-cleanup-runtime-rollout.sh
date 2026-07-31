#!/bin/sh
# Controlled cleanup-runtime rollout on schema 008 with maintenance disabled.
# One forward deploy, optional bridge rollback, one execution probe, no migration.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HEADLESS_FLY_STAGING_ORCHESTRATOR_INVOKED_AS="$0"
export HEADLESS_FLY_STAGING_APP_NAME="${HEADLESS_FLY_STAGING_APP_NAME:-shortforge-hw-staging-4def8fa0}"
export HEADLESS_ENV_NAME="${HEADLESS_ENV_NAME:-staging}"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_app_name

REJECTED_CLEANUP_DIGEST="9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60"
CLEANUP_DIGEST="$(npx tsx -e "import { HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST } from './src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority.ts'; console.log(HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST)")"
if [ "${CLEANUP_DIGEST}" = "${REJECTED_CLEANUP_DIGEST}" ]; then
  fly_staging_die "fail_class=rejected_cleanup_digest_forbidden"
fi
BRIDGE_DIGEST="7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206"
FORBIDDEN_2G24_DIGEST="d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68"
EXPECTED_VERIFY_MACHINE="d895d12a240938"
EXPECTED_RENDER_MACHINE="d895d16f264918"
PUBLIC_APP="${HEADLESS_FLY_STAGING_APP_NAME}"
PUBLIC_ENV="${HEADLESS_ENV_NAME}"

WORKER_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-rollout-worker.XXXXXX")"
QA_PROBE_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-rollout-qa-probe.XXXXXX")"
NEON_READ_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-rollout-neon-read.XXXXXX")"
TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-topology-before.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-machines-before.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-release-before.XXXXXX")"

cleanup() {
  set +e
  rm -f "${WORKER_BRIDGE}" "${QA_PROBE_BRIDGE}" "${NEON_READ_BRIDGE}" \
    "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}" \
    "${FORWARD_MATERIALIZED:-}" "${ROLLBACK_MATERIALIZED:-}" \
    "${DEPLOY_LOG:-}" "${RUNTIME_LOG:-}"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" \
    cleanup "${WORKER_BRIDGE}" "${QA_PROBE_BRIDGE}" "${NEON_READ_BRIDGE}" >/dev/null 2>&1 || true
  fly_staging_bridge_cleanup 2>/dev/null || true
  set -e
}
trap cleanup EXIT INT TERM HUP

printf 'phase=credential_validation\n'
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-qa-master
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-surfaces
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-worker-bridge "${WORKER_BRIDGE}"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-qa-probe-env "${QA_PROBE_BRIDGE}"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-neon-read-env "${NEON_READ_BRIDGE}"

export HEADLESS_FLY_STAGING_BRIDGE_FILE="${WORKER_BRIDGE}"
fly_staging_accept_bridge
fly_staging_load_bridge
fly_staging_apply_public_environment

printf 'phase=local_predeploy_authority\n'
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-materialize-cli.ts" validate-pairs
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-attempt-budget-cli.ts" \
  assert-forward-budget "${PUBLIC_APP}" "${CLEANUP_DIGEST}" \
  || fly_staging_die "fail_class=forward_attempt_budget_blocked"
FORWARD_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-materialize-cli.ts" identity forward 1)"
FORWARD_TOKEN="$(printf '%s\n' "${FORWARD_IDENTITY}" | sed -n 's/materialized_token=//p')"
FORWARD_MATERIALIZED="${FOOTIEBITZ_ROOT}/${FORWARD_TOKEN}.materialized.toml"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-materialize-cli.ts" \
  write-forward "${FORWARD_MATERIALIZED}" "${PUBLIC_APP}"
ROLLBACK_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-materialize-cli.ts" identity rollback 1)"
ROLLBACK_TOKEN="$(printf '%s\n' "${ROLLBACK_IDENTITY}" | sed -n 's/materialized_token=//p')"
ROLLBACK_MATERIALIZED="${FOOTIEBITZ_ROOT}/${ROLLBACK_TOKEN}.materialized.toml"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-materialize-cli.ts" \
  write-rollback-bridge "${ROLLBACK_MATERIALIZED}" "${PUBLIC_APP}"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-probe-config-cli.ts" \
  "${FORWARD_MATERIALIZED}" \
  || fly_staging_die "fail_class=probe_config_gate_failed"
fly_staging_assert_no_public_services_text "${FORWARD_MATERIALIZED}"
fly_staging_assert_no_public_services_text "${ROLLBACK_MATERIALIZED}"

printf 'phase=read_only_preflight\n'
fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}"
cat "${TOPOLOGY_BEFORE}"

node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3], digest: process.argv[4] };
let verify = 0, render = 0, other = 0;
const digest = (m) => {
  const img = m.config && m.config.image;
  if (typeof img === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(img);
    if (match) return match[1].toLowerCase();
  }
  return "";
};
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (row.id !== expected.verify && group === "verify") process.exit(1);
  if (row.id !== expected.render && group === "render") process.exit(1);
  if (row.region !== "iad") process.exit(2);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
const digests = rows.map(digest).filter(Boolean);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
console.log("topology_digest=PASS unified_digest=" + digests[0]);
' "${MACHINE_JSON_BEFORE}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" "${BRIDGE_DIGEST}" \
  || fly_staging_die "fail_class=baseline_not_on_bridge_digest"

BASELINE_DIGEST="$(node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const img = rows[0] && rows[0].config && rows[0].config.image;
const match = typeof img === "string" ? /@sha256:([a-f0-9]{64})/i.exec(img) : null;
if (!match) process.exit(1);
console.log(match[1].toLowerCase());
' "${MACHINE_JSON_BEFORE}")"

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
  || fly_staging_die "fail_class=precontact_failed"

if [ "${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_PROVIDER:-}" != "1" ]; then
  printf 'gate=cleanup_runtime_rollout result=DRY_RUN precontact=PASS provider_contact=blocked\n'
  exit 0
fi

fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CLEANUP_RUNTIME_ROLLOUT cleanup_runtime_rollout

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

accept_topology_digest() {
  _expected_digest="$1"
  _json="$(mktemp)"
  fly_staging_provider_fly machine list -a "${PUBLIC_APP}" --json >"${_json}"
  node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3], digest: process.argv[4] };
let verify = 0, render = 0, other = 0;
const digests = [];
const digest = (m) => {
  const img = m.config && m.config.image;
  if (typeof img === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(img);
    if (match) return match[1].toLowerCase();
  }
  return "";
};
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (row.id !== expected.verify && group === "verify") process.exit(1);
  if (row.id !== expected.render && group === "render") process.exit(1);
  if (row.region !== "iad") process.exit(2);
  const d = digest(row);
  if (!d) process.exit(3);
  digests.push(d);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
console.log("topology_digest=PASS unified_digest=" + digests[0]);
' "${_json}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" "${_expected_digest}"
  rm -f "${_json}"
}

rollback_to_bridge() {
  if [ "${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ROLLBACK_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=rollback_already_attempted"
  fi
  export HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ROLLBACK_ATTEMPTED=1
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
  printf 'phase=rollback_bridge\n'
  BRIDGE_IMAGE_REF="registry.fly.io/${PUBLIC_APP}@sha256:${BRIDGE_DIGEST}"
  fly_staging_provider_fly deploy \
    --config "${ROLLBACK_MATERIALIZED}" \
    --app "${PUBLIC_APP}" \
    --primary-region "${REGION}" \
    --image "${BRIDGE_IMAGE_REF}" \
    --strategy rolling \
    --yes
  accept_topology_digest "${BRIDGE_DIGEST}" || fly_staging_die "fail_class=rollback_topology_unconfirmed"
  fly_staging_provider_fly machine restart "${EXPECTED_VERIFY_MACHINE}" -a "${PUBLIC_APP}"
  fly_staging_provider_fly machine restart "${EXPECTED_RENDER_MACHINE}" -a "${PUBLIC_APP}"
  sleep 20
  fly_staging_apply_public_environment_for_digest "${BRIDGE_DIGEST}"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-attempt-budget-cli.ts" \
    record-rollback "${PUBLIC_APP}" "${BRIDGE_DIGEST}" \
    || fly_staging_die "fail_class=rollback_attempt_record_failed"
  export HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE="rollback_bridge_007_008"
  export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
  fly_staging_isolate_worker_bridge_preflight_env
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-preflight-cli.ts" \
    || fly_staging_die "fail_class=rollback_verify_preflight_failed"
}

FORWARD_RC=0
if [ "${BASELINE_DIGEST}" = "${CLEANUP_DIGEST}" ]; then
  printf 'forward_deploy=SKIPPED reason=baseline_already_on_cleanup_digest\n'
else
  if [ "${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_FORWARD_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=second_forward_attempt_forbidden"
  fi
  export HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_FORWARD_ATTEMPTED=1

  CLEANUP_IMAGE_REF="registry.fly.io/${PUBLIC_APP}@sha256:${CLEANUP_DIGEST}"
  DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-forward.XXXXXX")"

  printf 'phase=forward_deploy\n'
  set +e
  fly_staging_provider_fly deploy \
    --config "${FORWARD_MATERIALIZED}" \
    --app "${PUBLIC_APP}" \
    --primary-region "${REGION}" \
    --image "${CLEANUP_IMAGE_REF}" \
    --strategy rolling \
    --yes \
    >"${DEPLOY_LOG}" 2>&1
  FORWARD_RC=$?
  set -e
  cat "${DEPLOY_LOG}"
fi

if [ "${FORWARD_RC}" -eq 0 ] && [ "${BASELINE_DIGEST}" != "${CLEANUP_DIGEST}" ]; then
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-attempt-budget-cli.ts" \
    record-forward "${PUBLIC_APP}" "${CLEANUP_DIGEST}" "1" \
    || fly_staging_die "fail_class=forward_attempt_record_failed"
fi

if [ "${FORWARD_RC}" -ne 0 ]; then
  printf 'forward_deploy=FAIL\n'
else
  accept_topology_digest "${CLEANUP_DIGEST}" || FORWARD_RC=1
fi

if [ "${FORWARD_RC}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=forward_acceptance_failed rollback=confirmed"
fi

fly_staging_apply_public_environment_for_digest "${CLEANUP_DIGEST}"
export HEADLESS_EXPORT_MAINTENANCE_ENABLED="0"
unset HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
  || { rollback_to_bridge; fly_staging_die "fail_class=post_forward_schema_failed rollback=confirmed"; }

printf 'phase=fresh_restart_verify\n'
fly_staging_provider_fly machine restart "${EXPECTED_VERIFY_MACHINE}" -a "${PUBLIC_APP}"
sleep 20
accept_topology_digest "${CLEANUP_DIGEST}" || { rollback_to_bridge; fly_staging_die "fail_class=verify_restart_topology_failed rollback=confirmed"; }

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-preflight-cli.ts" \
  || { rollback_to_bridge; fly_staging_die "fail_class=verify_preflight_failed rollback=confirmed"; }

RUNTIME_LOG="$(mktemp)"
_obs_rc=0
_obs_out="$(fly_staging_observe_verify_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
if [ "${_obs_rc}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=verify_loop_failed rollback=confirmed"
fi
if grep -Eiq 'maintenance.*(batch|lease|enabled=1|scheduler)' "${RUNTIME_LOG}" 2>/dev/null; then
  rollback_to_bridge
  fly_staging_die "fail_class=maintenance_activity_detected rollback=confirmed"
fi

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=render
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-preflight-cli.ts" \
  || { rollback_to_bridge; fly_staging_die "fail_class=render_preflight_failed rollback=confirmed"; }

printf 'phase=fresh_restart_render\n'
fly_staging_provider_fly machine restart "${EXPECTED_RENDER_MACHINE}" -a "${PUBLIC_APP}"
sleep 20
accept_topology_digest "${CLEANUP_DIGEST}" || { rollback_to_bridge; fly_staging_die "fail_class=render_restart_topology_failed rollback=confirmed"; }

: >"${RUNTIME_LOG}"
_obs_rc=0
_obs_out="$(fly_staging_observe_render_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
if [ "${_obs_rc}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=render_loop_failed rollback=confirmed"
fi
if grep -Eiq 'maintenance.*(batch|lease|enabled=1|scheduler)' "${RUNTIME_LOG}" 2>/dev/null; then
  rollback_to_bridge
  fly_staging_die "fail_class=maintenance_activity_detected rollback=confirmed"
fi

if [ "${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_PROBE_ATTEMPTED:-0}" = "1" ]; then
  fly_staging_die "fail_class=second_probe_attempt_forbidden"
fi
export HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_PROBE_ATTEMPTED=1

printf 'phase=execution_probe\n'
set -a
# shellcheck disable=SC1090
. "${QA_PROBE_BRIDGE}"
set +a
export HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE=1
PROBE_RC=0
PROBE_OUT="$(npx tsx "${FOOTIEBITZ_ROOT}/src/verification/headless-renderer/platform/headlessFlyRenderExecutionProbe.verify.ts" 2>&1)" || PROBE_RC=$?
printf '%s\n' "${PROBE_OUT}"
if [ "${PROBE_RC}" -ne 0 ]; then
  if printf '%s\n' "${PROBE_OUT}" | grep -Eq 'FAIL_CONFIG|QA config missing|Gate on but QA secret contract incomplete|execution_probe_eligibility_verdict=FAIL_CONFIG'; then
    fly_staging_die "fail_class=execution_probe_config_failed rollback=skipped"
  fi
  rollback_to_bridge
  fly_staging_die "fail_class=execution_probe_failed rollback=confirmed"
fi

printf 'gate=cleanup_runtime_rollout result=PASS forward_digest=%s probe=PASS maintenance=disabled\n' "${CLEANUP_DIGEST}"
