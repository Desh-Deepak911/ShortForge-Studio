#!/bin/sh
# Sprint 11E Phase 2E.2D.6G/6H — canonical verify-first orchestration entrypoint.
# Sole authorized remote path: invoke this script directly (never .tmp wrappers).
#
# Usage:
#   scripts/fly-staging/fly-staging-verify-first.sh           # live (gated)
#   scripts/fly-staging/fly-staging-verify-first.sh --dry-run # fixture state machine
#
# Requires: HEADLESS_FLY_STAGING_BRIDGE_FILE, HEADLESS_FLY_STAGING_IMAGE_REF,
#           HEADLESS_FLY_STAGING_APP_NAME, execution + verify-first gates (live only).
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

fly_staging_bootstrap_verify_first

if [ "${DRY_RUN}" != "1" ]; then
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP verify_first
else
  export HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1
  export HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL=1
  export HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP=1
  export HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK=1
fi

fly_staging_accept_bridge
fly_staging_load_bridge
fly_staging_apply_public_environment
printf 'phase=public_environment_applied\n'

export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
set +e
_preflight_out="$(fly_staging_run_local_preflight 2>&1)"
_preflight_rc=$?
set -e
printf '%s\n' "${_preflight_out}"
if [ "${_preflight_rc}" -ne 0 ] || ! printf '%s' "${_preflight_out}" | grep -q 'schema_preflight=PASS'; then
  fly_staging_die "fail_class=local_preflight_failed"
fi
printf 'phase=local_preflight_pass\n'

fly_staging_assert_exact_zero_machines
printf 'phase=zero_machines_confirmed\n'

fly_staging_sync_decoded_secrets
printf 'phase=secrets_synced\n'
fly_staging_assert_post_sync_secrets_ledger
printf 'phase=secrets_post_sync_classified\n'

export HEADLESS_FLY_STAGING_ORCHESTRATOR_ACTIVE=1
"${FLY_STAGING_COMMON_DIR}/fly-staging-verify-scale-up.sh"
printf 'phase=deploy_complete\n'
printf 'phase=topology_proven\n'
printf 'phase=secrets_activated\n'

_runtime_log="$(mktemp)"
_obs_rc=0
_obs_out="$(fly_staging_observe_verify_runtime_logs "${_runtime_log}" 2>&1)" || _obs_rc=$?
printf '%s\n' "${_obs_out}"
rm -f "${_runtime_log}"
if [ "${_obs_rc}" -ne 0 ]; then
  _runtime_reason="$(printf '%s\n' "${_obs_out}" | awk -F= '/^runtime_observation=FAIL/{print; exit}' | awk -F'reason=' '{print $2}' | awk '{print $1}')"
  if [ -z "${_runtime_reason}" ]; then
    _runtime_reason="verify_loop_not_started"
  fi
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
  export HEADLESS_FLY_STAGING_FIXTURE_ROLLBACK_PHASE=1
  _rollback_rc=0
  _rollback_out="$(fly_staging_orchestrator_rollback_to_zero 2>&1)" || _rollback_rc=$?
  unset HEADLESS_FLY_STAGING_FIXTURE_ROLLBACK_PHASE 2>/dev/null || true
  printf '%s\n' "${_rollback_out}"
  if [ "${_rollback_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=rollback_unconfirmed runtime_reason=${_runtime_reason}"
  fi
  printf 'phase=rollback_complete\n'
  fly_staging_die "fail_class=runtime_observation_failed rollback=confirmed runtime_reason=${_runtime_reason}"
fi
printf 'phase=runtime_observation_pass\n'

printf 'orchestrator=verify_first result=PASS model=verify_only_first_deploy_from_immutable_image dry_run=%s\n' "${DRY_RUN}"
exit 0
