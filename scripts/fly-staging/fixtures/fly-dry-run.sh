#!/bin/sh
# Provider-free Fly CLI stub for verify-first dry-run fixtures.
# Never contacts Fly.io. Emits bounded fixture responses only.
set -eu

FIXTURE_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SCENARIO="${HEADLESS_FLY_STAGING_FIXTURE_SCENARIO:-staged_activation_pass}"
DIGEST="ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e"
MACHINE_ID="dryrun8675309a"
STATE_FILE="${HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE:-/tmp/fly-staging-dry-run-state.$$}"

_secrets_json() {
  _status="$1"
  _names="DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_ASSETS R2_BUCKET_ARTIFACTS R2_ENDPOINT HEADLESS_ALLOWED_ORIGINS UPSTASH_REDIS_TCP_URL"
  printf '['
  _first=1
  for _n in ${_names}; do
    [ "${_first}" = "1" ] || printf ','
    _first=0
    printf '{"name":"%s","status":"%s"}' "${_n}" "${_status}"
  done
  printf ']\n'
}

_machine_json() {
  printf '[{"id":"%s","region":"iad","config":{"metadata":{"fly_process_group":"verify"},"image":"registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:%s","guest":{"cpu_kind":"shared","cpus":1,"memory_mb":2048}}}]\n' \
    "${MACHINE_ID}" "${DIGEST}"
}

_deployed_flag="${STATE_FILE}.secrets_deployed"
_synced_flag="${STATE_FILE}.secrets_synced"

case "$1" in
  machine)
    case "$2" in
      list)
        shift 2
        _json=0
        _quiet=0
        while [ $# -gt 0 ]; do
          case "$1" in
            --json) _json=1; shift ;;
            -q) _quiet=1; shift ;;
            -a) shift 2 ;;
            *) shift ;;
          esac
        done
        if [ "${SCENARIO}" = "rollback_list_fail" ] && [ "${HEADLESS_FLY_STAGING_FIXTURE_ROLLBACK_PHASE:-}" = "1" ]; then
          exit 1
        fi
        if [ -f "${STATE_FILE}.machine_created" ]; then
          if [ "${_json}" = "1" ]; then
            _machine_json
          elif [ "${_quiet}" = "1" ]; then
            printf '%s\n' "${MACHINE_ID}"
          fi
        fi
        ;;
      destroy)
        shift 2
        while [ $# -gt 0 ]; do
          case "$1" in
            -a|--force) shift 2 ;;
            *) shift ;;
          esac
        done
        if [ "${SCENARIO}" = "rollback_destroy_fail" ]; then
          exit 1
        fi
        rm -f "${STATE_FILE}.machine_created"
        printf 'destroy_ok=1\n'
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  secrets)
    case "$2" in
      list)
        shift 2
        while [ $# -gt 0 ]; do
          case "$1" in
            -a) shift 2 ;;
            *) shift ;;
          esac
        done
        if [ -f "${_deployed_flag}" ] || [ "${SCENARIO}" = "all_deployed_skip" ]; then
          _secrets_json Deployed
        elif [ -f "${_synced_flag}" ]; then
          _secrets_json Staged
        else
          _secrets_json Staged
        fi
        ;;
      import)
        shift 2
        while [ $# -gt 0 ]; do
          case "$1" in
            -a) shift 2 ;;
            *) shift ;;
          esac
        done
        cat >/dev/null
        touch "${_synced_flag}"
        printf 'secrets_sync_invoked=1 record_count=9\n'
        ;;
      deploy)
        touch "${_deployed_flag}"
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  deploy)
    touch "${STATE_FILE}.machine_created"
    printf 'deploy_ok=1\n'
    ;;
  logs)
    case "${SCENARIO}" in
      schema_database_unavailable_rollback|schema_database_unavailable)
        cat "${FIXTURE_DIR}/runtime-logs-schema-db-unavailable.txt"
        ;;
      verify_loop_not_started_rollback|verify_loop_not_started|rollback_destroy_fail|rollback_list_fail)
        cat "${FIXTURE_DIR}/runtime-logs-loop-not-started.txt"
        ;;
      *)
        cat "${FIXTURE_DIR}/runtime-logs-pass.txt"
        ;;
    esac
    ;;
  config)
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
