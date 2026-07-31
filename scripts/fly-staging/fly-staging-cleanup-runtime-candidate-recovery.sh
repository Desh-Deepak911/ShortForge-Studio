#!/bin/sh
# One-time candidate recovery deploy + one candidate-validation probe.
# Preserves sealed incident ledger; uses sibling recovery ledger.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HEADLESS_FLY_STAGING_ORCHESTRATOR_INVOKED_AS="$0"
export HEADLESS_FLY_STAGING_APP_NAME="${HEADLESS_FLY_STAGING_APP_NAME:-shortforge-hw-staging-4def8fa0}"
export HEADLESS_ENV_NAME="${HEADLESS_ENV_NAME:-staging}"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_app_name

CANDIDATE_DIGEST="41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde"
BRIDGE_DIGEST="7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206"
FORBIDDEN_2G24_DIGEST="d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68"
REJECTED_PART_A="9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60"
REJECTED_LIVE="e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916"
EXPECTED_VERIFY_MACHINE="d895d12a240938"
EXPECTED_RENDER_MACHINE="d895d16f264918"
PUBLIC_APP="${HEADLESS_FLY_STAGING_APP_NAME}"
PUBLIC_ENV="${HEADLESS_ENV_NAME}"

WORKER_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-recovery-worker.XXXXXX")"
QA_PROBE_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-recovery-qa.XXXXXX")"
NEON_READ_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-recovery-neon.XXXXXX")"
TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-topology-before.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-machines-before.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-release-before.XXXXXX")"

cleanup() {
  set +e
  rm -f "${WORKER_BRIDGE}" "${QA_PROBE_BRIDGE}" "${NEON_READ_BRIDGE}" \
    "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}" \
    "${CANDIDATE_MATERIALIZED:-}" "${ROLLBACK_MATERIALIZED:-}" \
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

# Operator-only candidate gates on the ephemeral QA probe bridge only.
{
  printf '\nHEADLESS_FLY_RENDER_CANDIDATE_VALIDATION=1\n'
  printf 'HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN=%s\n' "${CANDIDATE_DIGEST}"
  printf 'HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_SHA256=%s\n' "${CANDIDATE_DIGEST}"
} >>"${QA_PROBE_BRIDGE}"
chmod 600 "${QA_PROBE_BRIDGE}"

export HEADLESS_FLY_STAGING_BRIDGE_FILE="${WORKER_BRIDGE}"
fly_staging_accept_bridge
fly_staging_load_bridge
fly_staging_apply_public_environment

printf 'phase=recovery_reconcile\n'
if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_CONTINUE:-}" = "1" ]; then
  printf 'recovery_reconcile=CONTINUE\n'
else
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" reconcile "${PUBLIC_APP}"
fi
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" assert-deploy-budget "${PUBLIC_APP}"

printf 'phase=materialize_pairs\n'
CANDIDATE_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-materialize-cli.ts" identity candidate 2)"
CANDIDATE_TOKEN="$(printf '%s\n' "${CANDIDATE_IDENTITY}" | sed -n 's/materialized_token=//p')"
CANDIDATE_MATERIALIZED="${FOOTIEBITZ_ROOT}/${CANDIDATE_TOKEN}.materialized.toml"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-materialize-cli.ts" \
  write-candidate "${CANDIDATE_MATERIALIZED}" "${PUBLIC_APP}"
ROLLBACK_IDENTITY="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-materialize-cli.ts" identity rollback 1)"
ROLLBACK_TOKEN="$(printf '%s\n' "${ROLLBACK_IDENTITY}" | sed -n 's/materialized_token=//p')"
ROLLBACK_MATERIALIZED="${FOOTIEBITZ_ROOT}/${ROLLBACK_TOKEN}.materialized.toml"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-materialize-cli.ts" \
  write-rollback-bridge "${ROLLBACK_MATERIALIZED}" "${PUBLIC_APP}"
fly_staging_assert_no_public_services_text "${CANDIDATE_MATERIALIZED}"
fly_staging_assert_no_public_services_text "${ROLLBACK_MATERIALIZED}"

printf 'phase=read_only_preflight\n'
fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}"
cat "${TOPOLOGY_BEFORE}"

# Fresh recovery: baseline must still be on the bridge digest.
# CONTINUE: recovery deploy already attached the candidate — require unified candidate.
PREFLIGHT_EXPECTED_DIGEST="${BRIDGE_DIGEST}"
PREFLIGHT_FAIL_CLASS="baseline_not_on_bridge_digest"
if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_CONTINUE:-}" = "1" ]; then
  PREFLIGHT_EXPECTED_DIGEST="${CANDIDATE_DIGEST}"
  PREFLIGHT_FAIL_CLASS="continue_baseline_not_on_candidate_digest"
fi

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
if (digests[0] === process.argv[5] || digests[0] === process.argv[6] || digests[0] === process.argv[7]) process.exit(6);
console.log("topology_digest=PASS unified_digest=" + digests[0]);
' "${MACHINE_JSON_BEFORE}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" "${PREFLIGHT_EXPECTED_DIGEST}" \
  "${FORBIDDEN_2G24_DIGEST}" "${REJECTED_PART_A}" "${REJECTED_LIVE}" \
  || fly_staging_die "fail_class=${PREFLIGHT_FAIL_CLASS}"

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
  || fly_staging_die "fail_class=precontact_failed"

if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_PROVIDER:-}" != "1" ]; then
  printf 'gate=candidate_recovery result=DRY_RUN precontact=PASS provider_contact=blocked\n'
  exit 0
fi

fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CANDIDATE_RECOVERY candidate_recovery

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
  if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_ROLLBACK_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=BLOCKED_BRIDGE_ROLLBACK_FAILED"
  fi
  export HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_ROLLBACK_ATTEMPTED=1
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
  accept_topology_digest "${BRIDGE_DIGEST}" || fly_staging_die "fail_class=BLOCKED_BRIDGE_ROLLBACK_FAILED"
  fly_staging_provider_fly machine restart "${EXPECTED_VERIFY_MACHINE}" -a "${PUBLIC_APP}"
  fly_staging_provider_fly machine restart "${EXPECTED_RENDER_MACHINE}" -a "${PUBLIC_APP}"
  sleep 20
  fly_staging_apply_public_environment_for_digest "${BRIDGE_DIGEST}"
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" \
    record-rollback "${PUBLIC_APP}" "1" \
    || fly_staging_die "fail_class=BLOCKED_BRIDGE_ROLLBACK_FAILED"
  export HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE="rollback_bridge_007_008"
  export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
  fly_staging_isolate_worker_bridge_preflight_env
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-preflight-cli.ts" \
    || fly_staging_die "fail_class=BLOCKED_BRIDGE_ROLLBACK_FAILED"
}

CONTINUE_AFTER_DEPLOY=0
if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_CONTINUE:-}" = "1" ]; then
  # Resume after an accepted recovery deploy already attached the candidate.
  # Never issues a second recovery deployment.
  accept_topology_digest "${CANDIDATE_DIGEST}" \
    || fly_staging_die "fail_class=continue_requires_candidate_digest"
  printf 'phase=one_time_candidate_recovery_deploy skipped=already_attached\n'
  CONTINUE_AFTER_DEPLOY=1
else
  if [ "${HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_DEPLOY_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=second_candidate_recovery_forbidden"
  fi
  export HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_DEPLOY_ATTEMPTED=1

  CANDIDATE_IMAGE_REF="registry.fly.io/${PUBLIC_APP}@sha256:${CANDIDATE_DIGEST}"
  DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-candidate-recovery-deploy.XXXXXX")"
  printf 'phase=one_time_candidate_recovery_deploy\n'
  set +e
  fly_staging_provider_fly deploy \
    --config "${CANDIDATE_MATERIALIZED}" \
    --app "${PUBLIC_APP}" \
    --primary-region "${REGION}" \
    --image "${CANDIDATE_IMAGE_REF}" \
    --strategy rolling \
    --yes \
    >"${DEPLOY_LOG}" 2>&1
  DEPLOY_RC=$?
  set -e
  cat "${DEPLOY_LOG}"

  if [ "${DEPLOY_RC}" -ne 0 ]; then
    npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" \
      record-recovery-deploy "${PUBLIC_APP}" "1" "0" || true
    rollback_to_bridge
    fly_staging_die "fail_class=candidate_recovery_deploy_failed rollback=confirmed"
  fi

  accept_topology_digest "${CANDIDATE_DIGEST}" || {
    npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" \
      record-recovery-deploy "${PUBLIC_APP}" "1" "0" || true
    rollback_to_bridge
    fly_staging_die "fail_class=candidate_topology_unconfirmed rollback=confirmed"
  }

  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" \
    record-recovery-deploy "${PUBLIC_APP}" "1" "1"
fi

# Candidate digest remains permanently rejected for ordinary resolve-by-digest.
# Under recovery, apply the sealed cleanup-runtime public environment directly.
export HEADLESS_ENV_NAME="staging"
export HEADLESS_CHROME_PATH="/usr/bin/chromium"
export HEADLESS_FFMPEG_PATH="/usr/bin/ffmpeg"
export HEADLESS_FFPROBE_PATH="/usr/bin/ffprobe"
export HEADLESS_RENDERER_BUILD_ID="headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime"
export HEADLESS_WORKER_CONCURRENCY="1"
export HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS="25000"
export HEADLESS_WORKER_WORKSPACE_ROOT="/tmp/footiebitz-headless-worker"
export HEADLESS_HOSTED_IMAGE_CLASS="deployable_worker"
export HEADLESS_EXPORT_MAINTENANCE_ENABLED="0"
unset HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
  || { rollback_to_bridge; fly_staging_die "fail_class=post_recovery_schema_failed rollback=confirmed"; }

printf 'phase=fresh_restart_verify\n'
fly_staging_provider_fly machine restart "${EXPECTED_VERIFY_MACHINE}" -a "${PUBLIC_APP}"
sleep 20
accept_topology_digest "${CANDIDATE_DIGEST}" || { rollback_to_bridge; fly_staging_die "fail_class=verify_restart_topology_failed rollback=confirmed"; }

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
fly_staging_isolate_worker_bridge_preflight_env
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

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=render
fly_staging_isolate_worker_bridge_preflight_env
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-preflight-cli.ts" \
  || { rollback_to_bridge; fly_staging_die "fail_class=render_preflight_failed rollback=confirmed"; }

printf 'phase=fresh_restart_render\n'
fly_staging_provider_fly machine restart "${EXPECTED_RENDER_MACHINE}" -a "${PUBLIC_APP}"
sleep 20
accept_topology_digest "${CANDIDATE_DIGEST}" || { rollback_to_bridge; fly_staging_die "fail_class=render_restart_topology_failed rollback=confirmed"; }

: >"${RUNTIME_LOG}"
_obs_rc=0
_obs_out="$(fly_staging_observe_render_runtime_logs "${RUNTIME_LOG}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
if [ "${_obs_rc}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=render_loop_failed rollback=confirmed"
fi

ROLLOUT_BOUNDARY="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" \
  activate-cycle "${PUBLIC_APP}" "${ROLLOUT_BOUNDARY}" \
  "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}"
printf 'candidate_lifecycle=deployed_validation_candidate boundary=%s\n' "${ROLLOUT_BOUNDARY}"

printf 'phase=archive_probe_evidence\n'
EVIDENCE_SRC="${FOOTIEBITZ_ROOT}/docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md"
EVIDENCE_SHA="$(shasum -a 256 "${EVIDENCE_SRC}" | awk '{print $1}')"
ARCHIVE_PATH="${FOOTIEBITZ_ROOT}/docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-2g25d-candidate-recovery-${EVIDENCE_SHA}.md"
cp -p "${EVIDENCE_SRC}" "${ARCHIVE_PATH}"
cmp -s "${EVIDENCE_SRC}" "${ARCHIVE_PATH}" || fly_staging_die "fail_class=evidence_archive_not_byte_identical"
printf 'probe_evidence_archived=%s\n' "${ARCHIVE_PATH}"

printf 'phase=candidate_validation_probe\n'
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" assert-probe-budget "${PUBLIC_APP}"
set -a
# shellcheck disable=SC1090
. "${QA_PROBE_BRIDGE}"
set +a
export HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE=1
export HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION=1
export HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN="${CANDIDATE_DIGEST}"
export HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_SHA256="${CANDIDATE_DIGEST}"

PROBE_RC=0
PROBE_OUT="$(npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-probe-cli.ts" run "${PUBLIC_APP}" 2>&1)" || PROBE_RC=$?
printf '%s\n' "${PROBE_OUT}"

# Strip candidate gates after probe contact window.
unset HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION
unset HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN
unset HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_SHA256
unset HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE

if [ "${PROBE_RC}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=candidate_probe_failed rollback=confirmed"
fi

printf 'phase=gate_off_preservation\n'
PRESERVE_RC=0
PRESERVE_OUT="$(npx tsx "${FOOTIEBITZ_ROOT}/src/verification/headless-renderer/execution/headlessFlyRenderExecutionProbeAuthority.verify.ts" 2>&1)" || PRESERVE_RC=$?
printf '%s\n' "${PRESERVE_OUT}"
if [ "${PRESERVE_RC}" -ne 0 ]; then
  rollback_to_bridge
  fly_staging_die "fail_class=gate_off_preservation_failed rollback=confirmed"
fi

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-candidate-recovery-cli.ts" mark-promoted "${PUBLIC_APP}"
printf 'gate=candidate_recovery result=PASS candidate_probe=PASS awaiting_authority_promotion_commit=1\n'
