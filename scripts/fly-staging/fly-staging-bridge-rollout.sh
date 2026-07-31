#!/bin/sh
# Controlled schema-008 bridge rollout on existing verify=1/render=1 staging.
# One forward deploy, optional pre-008 rollback, migration 008, fresh restart proof.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HEADLESS_FLY_STAGING_ORCHESTRATOR_INVOKED_AS="$0"
export HEADLESS_FLY_STAGING_APP_NAME="${HEADLESS_FLY_STAGING_APP_NAME:-shortforge-hw-staging-4def8fa0}"
export HEADLESS_ENV_NAME="${HEADLESS_ENV_NAME:-staging}"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_app_name

BRIDGE_DIGEST="7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206"
ROLLBACK_DIGEST="d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68"
EXPECTED_VERIFY_MACHINE="d895d12a240938"
EXPECTED_RENDER_MACHINE="d895d16f264918"
PUBLIC_APP="${HEADLESS_FLY_STAGING_APP_NAME}"
PUBLIC_ENV="${HEADLESS_ENV_NAME}"

WORKER_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-worker.XXXXXX")"
NEON_READ_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-neon-read.XXXXXX")"
TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-topology-before.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-machines-before.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-release-before.XXXXXX")"

cleanup() {
  set +e
  rm -f "${WORKER_BRIDGE}" "${NEON_READ_BRIDGE}" \
    "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}" \
    "${FORWARD_MATERIALIZED:-}" "${ROLLBACK_MATERIALIZED:-}" \
    "${DEPLOY_LOG:-}" "${RUNTIME_LOG:-}"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" \
    cleanup "${WORKER_BRIDGE}" "${NEON_READ_BRIDGE}" >/dev/null 2>&1 || true
  fly_staging_bridge_cleanup 2>/dev/null || true
  set -e
}
trap cleanup EXIT INT TERM HUP

printf 'phase=credential_validation\n'
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-qa-master
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-surfaces
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-worker-bridge "${WORKER_BRIDGE}"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-neon-read-env "${NEON_READ_BRIDGE}"

export HEADLESS_FLY_STAGING_BRIDGE_FILE="${WORKER_BRIDGE}"
fly_staging_accept_bridge
fly_staging_load_bridge
fly_staging_apply_public_environment

printf 'phase=read_only_preflight\n'
fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}"
cat "${TOPOLOGY_BEFORE}"

node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3] };
const allowedDigests = new Set([process.argv[4], process.argv[5]]);
let verifyId = "", renderId = "";
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
  if (meta.fly_process_group === "verify") verifyId = row.id;
  if (meta.fly_process_group === "render") renderId = row.id;
  if (row.region !== "iad") process.exit(1);
}
if (verifyId !== expected.verify || renderId !== expected.render) process.exit(2);
const digests = rows.map(digest).filter(Boolean);
if (new Set(digests).size !== 1 || !allowedDigests.has(digests[0])) process.exit(3);
console.log("machine_ids_preserved=PASS baseline_digest=" + digests[0]);
' "${MACHINE_JSON_BEFORE}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" "${ROLLBACK_DIGEST}" "${BRIDGE_DIGEST}" \
  || fly_staging_die "fail_class=baseline_topology_mismatch"

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a
if npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate >/dev/null 2>&1; then
  printf 'precontact=PASS phase=post_migrate_resume\n'
elif npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" baseline; then
  printf 'precontact=PASS phase=baseline\n'
else
  fly_staging_die "fail_class=precontact_failed"
fi

if [ "${HEADLESS_FLY_STAGING_BRIDGE_ROLLOUT_PROVIDER:-}" != "1" ]; then
  printf 'gate=bridge_rollout result=DRY_RUN precontact=PASS provider_contact=blocked\n'
  exit 0
fi

fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_BRIDGE_ROLLOUT bridge_rollout

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

# Resume-safe: skip forward deploy when both Machines already report the bridge digest.
FORWARD_RC=0
if accept_topology_digest "${BRIDGE_DIGEST}" 2>/dev/null; then
  printf 'forward_deploy=SKIPPED reason=already_on_bridge_digest\n'
else
  if [ "${HEADLESS_FLY_STAGING_BRIDGE_ROLLOUT_FORWARD_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=second_forward_attempt_forbidden"
  fi
  export HEADLESS_FLY_STAGING_BRIDGE_ROLLOUT_FORWARD_ATTEMPTED=1

  FORWARD_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-materialize-cli.ts" identity forward 1)"
  FORWARD_TOKEN="$(printf '%s\n' "${FORWARD_IDENTITY}" | sed -n 's/materialized_token=//p')"
  FORWARD_MATERIALIZED="${FOOTIEBITZ_ROOT}/${FORWARD_TOKEN}.materialized.toml"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-materialize-cli.ts" \
    write-forward "${FORWARD_MATERIALIZED}" "${PUBLIC_APP}"

  BRIDGE_IMAGE_REF="registry.fly.io/${PUBLIC_APP}@sha256:${BRIDGE_DIGEST}"
  DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-forward.XXXXXX")"

  printf 'phase=forward_deploy\n'
  set +e
  fly_staging_provider_fly deploy \
    --config "${FORWARD_MATERIALIZED}" \
    --app "${PUBLIC_APP}" \
    --primary-region "${REGION}" \
    --image "${BRIDGE_IMAGE_REF}" \
    --strategy rolling \
    --yes \
    >"${DEPLOY_LOG}" 2>&1
  FORWARD_RC=$?
  set -e
  cat "${DEPLOY_LOG}"
fi

if [ "${FORWARD_RC}" -ne 0 ]; then
  printf 'forward_deploy=FAIL\n'
else
  accept_topology_digest "${BRIDGE_DIGEST}" || FORWARD_RC=1
fi

if [ "${FORWARD_RC}" -ne 0 ]; then
  if [ "${HEADLESS_FLY_STAGING_BRIDGE_ROLLOUT_ROLLBACK_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=rollback_already_attempted"
  fi
  export HEADLESS_FLY_STAGING_BRIDGE_ROLLOUT_ROLLBACK_ATTEMPTED=1
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
  ROLLBACK_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-materialize-cli.ts" identity rollback 1)"
  ROLLBACK_TOKEN="$(printf '%s\n' "${ROLLBACK_IDENTITY}" | sed -n 's/materialized_token=//p')"
  ROLLBACK_MATERIALIZED="${FOOTIEBITZ_ROOT}/${ROLLBACK_TOKEN}.materialized.toml"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-materialize-cli.ts" \
    write-rollback "${ROLLBACK_MATERIALIZED}" "${PUBLIC_APP}"
  ROLLBACK_IMAGE_REF="registry.fly.io/${PUBLIC_APP}@sha256:${ROLLBACK_DIGEST}"
  fly_staging_provider_fly deploy \
    --config "${ROLLBACK_MATERIALIZED}" \
    --app "${PUBLIC_APP}" \
    --primary-region "${REGION}" \
    --image "${ROLLBACK_IMAGE_REF}" \
    --strategy rolling \
    --yes
  accept_topology_digest "${ROLLBACK_DIGEST}" || fly_staging_die "fail_class=rollback_topology_unconfirmed"
  fly_staging_die "fail_class=forward_acceptance_failed rollback=confirmed"
fi

fly_staging_apply_public_environment_for_digest "${BRIDGE_DIGEST}"
export HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE="rollback_bridge_007_008"

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a

MIGRATION_ALREADY_APPLIED=0
if npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate >/dev/null 2>&1; then
  MIGRATION_ALREADY_APPLIED=1
  printf 'resume=post_migration_008 schema_ledger=001-008\n'
fi

if [ "${MIGRATION_ALREADY_APPLIED}" -eq 0 ]; then
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-forward \
    || fly_staging_die "fail_class=post_forward_schema_failed"

  export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-preflight-cli.ts" \
    || fly_staging_die "fail_class=verify_preflight_failed"

  RUNTIME_LOG="$(mktemp)"
  _obs_rc=0
  _obs_out="$(fly_staging_observe_verify_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
  printf '%s\n' "${_obs_out}"
  [ "${_obs_rc}" -eq 0 ] || fly_staging_die "fail_class=verify_loop_failed"

  printf 'phase=migration_008\n'
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" pre-migrate \
    || fly_staging_die "fail_class=pre_migrate_drain_failed"

  MIGRATE_MASTER="${FLY_STAGING_BRIDGE_ROLLOUT_MIGRATE_MASTER_PATH:-/tmp/shortforge-neon-migrate.master.env}"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-migration-master \
    || fly_staging_die "fail_class=migration_master_invalid"

  if [ "${HEADLESS_NEON_MIGRATE:-}" != "1" ]; then
    fly_staging_die "fail_class=migration_gate_blocked"
  fi

  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" run-migration \
    || fly_staging_die "fail_class=migration_apply_failed"

  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
    || fly_staging_die "fail_class=post_migrate_schema_failed"
else
  RUNTIME_LOG="$(mktemp)"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
    || fly_staging_die "fail_class=post_migrate_schema_failed"
fi

printf 'phase=fresh_restart_verify\n'
fly_staging_provider_fly machine restart "${EXPECTED_VERIFY_MACHINE}" -a "${PUBLIC_APP}"
sleep 15
accept_topology_digest "${BRIDGE_DIGEST}" || fly_staging_die "fail_class=verify_restart_topology_failed"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-restart \
  || fly_staging_die "fail_class=verify_restart_schema_failed"
: >"${RUNTIME_LOG}"
_obs_rc=0
_obs_out="$(fly_staging_observe_verify_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
[ "${_obs_rc}" -eq 0 ] || fly_staging_die "fail_class=verify_fresh_restart_loop_failed"

printf 'phase=fresh_restart_render\n'
fly_staging_provider_fly machine restart "${EXPECTED_RENDER_MACHINE}" -a "${PUBLIC_APP}"
sleep 15
accept_topology_digest "${BRIDGE_DIGEST}" || fly_staging_die "fail_class=render_restart_topology_failed"
export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=render
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-preflight-cli.ts" \
  || fly_staging_die "fail_class=render_preflight_failed"
: >"${RUNTIME_LOG}"
_obs_rc=0
_obs_out="$(fly_staging_observe_render_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
[ "${_obs_rc}" -eq 0 ] || fly_staging_die "fail_class=render_fresh_restart_loop_failed"

printf 'gate=bridge_rollout result=PASS forward_digest=%s migration_008=applied fresh_restart=both\n' "${BRIDGE_DIGEST}"
