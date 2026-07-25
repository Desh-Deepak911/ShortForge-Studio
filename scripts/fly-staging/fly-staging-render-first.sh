#!/bin/sh
# Sprint 11E Phase 2E.2D.8A — canonical render-first orchestration entrypoint.
# Sole authorized remote path: invoke this script directly (never .tmp wrappers).
#
# Usage:
#   scripts/fly-staging/fly-staging-render-first.sh           # live (gated)
#   scripts/fly-staging/fly-staging-render-first.sh --dry-run # fixture state machine
#
# Requires verify=1/render=0 prerequisite, same immutable image, deployed secrets.
# Activation gate: HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP (separate from QA).
set -eu

FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HEADLESS_FLY_STAGING_ORCHESTRATOR_INVOKED_AS="$0"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
  export HEADLESS_FLY_STAGING_DRY_RUN=1
  shift
fi

fly_staging_forbid_env_local
fly_staging_require_app_name
printf 'phase=bootstrap\n'

if [ "${DRY_RUN}" != "1" ]; then
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP render_scale_up
else
  export HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1
  export HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP=1
  export HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK=1
fi

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

IMAGE_REF="${HEADLESS_FLY_STAGING_IMAGE_REF:-}"
if [ -z "${IMAGE_REF}" ] && [ "${DRY_RUN}" != "1" ]; then
  fly_staging_die "fail_class=missing_immutable_image_ref"
fi
if [ -n "${IMAGE_REF}" ]; then
  case "${IMAGE_REF}" in
    *sha256:[a-f0-9][a-f0-9][a-f0-9][a-f0-9]*)
      ;;
    *)
      fly_staging_die "fail_class=image_ref_missing_digest"
      ;;
  esac
fi

# Read-only readiness: verify=1 render=0 before any mutation.
JSON_TMP="$(mktemp)"
set +e
if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
  printf '[{"id":"abcd1234abcd1234","region":"iad","config":{"metadata":{"fly_process_group":"verify"},"guest":{"cpu_kind":"shared","cpus":1,"memory_mb":2048},"image":"registry.fly.io/app@sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e"}}]\n' >"${JSON_TMP}"
  LIST_RC=0
else
  fly machine list -a "${HEADLESS_FLY_STAGING_APP_NAME}" --json >"${JSON_TMP}" 2>"${JSON_TMP}.err"
  LIST_RC=$?
fi
set -e
if [ "${LIST_RC}" -ne 0 ]; then
  rm -f "${JSON_TMP}" "${JSON_TMP}.err"
  fly_staging_die "fail_class=machine_list_provider_error"
fi

node -e '
const fs = require("fs");
const path = process.argv[1];
let rows;
try { rows = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { console.error("fail_class=malformed_machine_list"); process.exit(1); }
let verify = 0, render = 0, other = 0;
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const g = meta.fly_process_group;
  if (g === "verify") verify += 1;
  else if (g === "render") render += 1;
  else other += 1;
}
if (verify !== 1 || render !== 0 || other !== 0) {
  console.error("fail_class=read_only_readiness_failed verify=" + verify + " render=" + render);
  process.exit(1);
}
console.log("read_only_readiness=PASS verify=1 render=0");
' "${JSON_TMP}"
rm -f "${JSON_TMP}" "${JSON_TMP}.err"
printf 'phase=read_only_readiness_pass\n'

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=render
set +e
_preflight_out="$(fly_staging_run_local_preflight 2>&1)"
_preflight_rc=$?
set -e
printf '%s\n' "${_preflight_out}"
if [ "${_preflight_rc}" -ne 0 ] || ! printf '%s' "${_preflight_out}" | grep -q 'schema_preflight=PASS'; then
  fly_staging_die "fail_class=local_preflight_failed"
fi
printf 'phase=local_preflight_pass\n'

if [ "${DRY_RUN}" = "1" ]; then
  printf 'phase=render_scale_up_complete\n'
  printf 'phase=post_activation_inventory_proven\n'
  _runtime_log="$(mktemp)"
  _obs_rc=0
  _obs_out="$(fly_staging_observe_render_runtime_logs "${_runtime_log}" 2>&1)" || _obs_rc=$?
  printf '%s\n' "${_obs_out}"
  rm -f "${_runtime_log}"
  if [ "${_obs_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=runtime_observation_failed dry_run=1"
  fi
  printf 'phase=render_runtime_observation_pass\n'
  printf 'orchestrator=render_first result=PASS model=verify_one_render_one_from_immutable_image dry_run=1\n'
  exit 0
fi

export HEADLESS_FLY_STAGING_ORCHESTRATOR_ACTIVE=1
"${FLY_STAGING_COMMON_DIR}/fly-staging-render-scale-up.sh"
printf 'phase=render_scale_up_complete\n'
printf 'phase=post_activation_inventory_proven\n'

_runtime_log="$(mktemp)"
_obs_rc=0
_obs_out="$(fly_staging_observe_render_runtime_logs "${_runtime_log}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
rm -f "${_runtime_log}"
if [ "${_obs_rc}" -ne 0 ]; then
  _runtime_reason="$(printf '%s\n' "${_obs_out}" | awk -F= '/^runtime_observation=FAIL/{print; exit}' | awk -F'reason=' '{print $2}' | awk '{print $1}')"
  if [ -z "${_runtime_reason}" ]; then
    _runtime_reason="render_loop_not_started"
  fi
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
  export HEADLESS_FLY_STAGING_FIXTURE_ROLLBACK_PHASE=1
  _rollback_rc=0
  _rollback_out="$(fly_staging_orchestrator_rollback_render_only 2>&1)" || _rollback_rc=$?
  unset HEADLESS_FLY_STAGING_FIXTURE_ROLLBACK_PHASE 2>/dev/null || true
  printf '%s\n' "${_rollback_out}"
  if [ "${_rollback_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=rollback_unconfirmed runtime_reason=${_runtime_reason}"
  fi
  printf 'phase=render_rollback_complete\n'
  printf 'phase=readiness_fail\n'
  fly_staging_die "fail_class=runtime_observation_failed rollback=render_only_confirmed runtime_reason=${_runtime_reason}"
fi
printf 'phase=render_runtime_observation_pass\n'

printf 'orchestrator=render_first result=PASS model=verify_one_render_one_from_immutable_image dry_run=0\n'
exit 0
