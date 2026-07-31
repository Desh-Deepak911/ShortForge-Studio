#!/bin/sh
# Shared fail-closed helpers for Fly staging operator scripts
# (Phase 2E.2D.4 / 2E.2D.5C). Default: refuse provider contact. Never source .env.local.
#
# Pre-first-deploy authority uses exact Machine lists — not Launch scale metadata.

set -eu

# Phase 2E.2D.6A — canonical FOOTIEBITZ_ROOT authority.
# Never derive root from caller $0, cwd, or .tmp orchestrator paths.
# Official scripts export FLY_STAGING_COMMON_DIR before sourcing this file.
# Orchestrators must export FOOTIEBITZ_ROOT or FLY_STAGING_COMMON_SH.

_fly_staging_bootstrap_die() {
  printf '%s\n' "$1" >&2
  exit 1
}

_fly_staging_validate_footiebitz_root() {
  _candidate="$1"
  if [ -z "${_candidate}" ]; then
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_blank"
  fi
  case "${_candidate}" in
    *[![:space:]]*) ;;
    *) _fly_staging_bootstrap_die "fail_class=footiebitz_root_blank" ;;
  esac
  case "${_candidate}" in
    /*) ;;
    *) _fly_staging_bootstrap_die "fail_class=footiebitz_root_relative" ;;
  esac
  if [ ! -d "${_candidate}" ]; then
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_missing"
  fi
  _canonical="$(CDPATH= cd -- "${_candidate}" && pwd)" || _fly_staging_bootstrap_die "fail_class=footiebitz_root_missing"
  if [ ! -f "${_canonical}/package.json" ]; then
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_wrong_package"
  fi
  if ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"footiebitz"' "${_canonical}/package.json" 2>/dev/null; then
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_wrong_package"
  fi
  for _marker in \
    scripts/fly-staging/fly-staging-common.sh \
    deploy/headless-worker/fly.staging.template.toml \
    deploy/headless-worker/fly.staging.verify-first.template.toml \
    deploy/headless-worker/Dockerfile \
    dist/headless-worker/hosted-worker.js
  do
    if [ ! -f "${_canonical}/${_marker}" ]; then
      _fly_staging_bootstrap_die "fail_class=footiebitz_root_missing_marker path=${_marker}"
    fi
  done
  printf '%s' "${_canonical}"
}

_fly_staging_derive_root_from_common_dir() {
  _common_dir="$1"
  case "${_common_dir}" in
    /*) ;;
    *) _fly_staging_bootstrap_die "fail_class=footiebitz_root_relative" ;;
  esac
  if [ ! -f "${_common_dir}/fly-staging-common.sh" ]; then
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_unresolved"
  fi
  _candidate="$(CDPATH= cd -- "${_common_dir}/../.." && pwd)" || _fly_staging_bootstrap_die "fail_class=footiebitz_root_unresolved"
  _fly_staging_validate_footiebitz_root "${_candidate}"
}

_fly_staging_resolve_footiebitz_root() {
  if [ -n "${FOOTIEBITZ_ROOT+set}" ]; then
    FOOTIEBITZ_ROOT="$(_fly_staging_validate_footiebitz_root "${FOOTIEBITZ_ROOT}")"
  elif [ -n "${FLY_STAGING_COMMON_DIR:-}" ]; then
    FOOTIEBITZ_ROOT="$(_fly_staging_derive_root_from_common_dir "${FLY_STAGING_COMMON_DIR}")"
  elif [ -n "${FLY_STAGING_COMMON_SH:-}" ] && [ -f "${FLY_STAGING_COMMON_SH}" ]; then
    _common_dir="$(CDPATH= cd -- "$(dirname "${FLY_STAGING_COMMON_SH}")" && pwd)"
    FOOTIEBITZ_ROOT="$(_fly_staging_derive_root_from_common_dir "${_common_dir}")"
  else
    _fly_staging_bootstrap_die "fail_class=footiebitz_root_unresolved"
  fi
  export FOOTIEBITZ_ROOT
}

_fly_staging_resolve_footiebitz_root

FLY_STAGING_TEMPLATE="${FOOTIEBITZ_ROOT}/deploy/headless-worker/fly.staging.template.toml"
FLY_STAGING_VERIFY_FIRST_TEMPLATE="${FOOTIEBITZ_ROOT}/deploy/headless-worker/fly.staging.verify-first.template.toml"
FLY_STAGING_SECRET_NAMES="DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_ASSETS R2_BUCKET_ARTIFACTS R2_ENDPOINT HEADLESS_ALLOWED_ORIGINS UPSTASH_REDIS_TCP_URL"
FLY_STAGING_PUBLIC_ENV_NAMES="HEADLESS_ENV_NAME HEADLESS_CHROME_PATH HEADLESS_FFMPEG_PATH HEADLESS_FFPROBE_PATH HEADLESS_RENDERER_BUILD_ID HEADLESS_WORKER_CONCURRENCY HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS HEADLESS_WORKER_WORKSPACE_ROOT HEADLESS_HOSTED_IMAGE_CLASS"
FLY_STAGING_GATE_ENV_NAMES="HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED HEADLESS_FLY_STAGING_AUTHORIZE_APP_CREATE HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL HEADLESS_FLY_STAGING_AUTHORIZE_IMAGE_DEPLOY HEADLESS_FLY_STAGING_AUTHORIZE_BRIDGE_BUILD_ONLY HEADLESS_FLY_STAGING_AUTHORIZE_CLEANUP_RUNTIME_BUILD_ONLY HEADLESS_FLY_STAGING_AUTHORIZE_BRIDGE_ROLLOUT HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK HEADLESS_FLY_STAGING_AUTHORIZE_TEARDOWN"
FLY_STAGING_SECRETS_JSON_CLI="${FOOTIEBITZ_ROOT}/src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secrets-json-cli.ts"
FLY_STAGING_SECRETS_IMPORT_CLI="${FOOTIEBITZ_ROOT}/src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secrets-import-cli.ts"
FLY_STAGING_VERIFY_FIRST_ENTRYPOINT="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fly-staging-verify-first.sh"
FLY_STAGING_VERIFY_FIRST_PREFLIGHT_CLI="${FOOTIEBITZ_ROOT}/src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-local-classify-preflight.ts"
FLY_STAGING_FIXTURE_FLY="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/fly-dry-run.sh"
FLY_STAGING_BRIDGE_ACCEPTED="${FLY_STAGING_BRIDGE_ACCEPTED:-0}"
FLY_STAGING_BRIDGE_LOADED="${FLY_STAGING_BRIDGE_LOADED:-0}"
FLY_STAGING_ORCHESTRATOR_MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.verify-first.materialized.toml"

fly_staging_provider_fly() {
  if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
    if [ ! -x "${FLY_STAGING_FIXTURE_FLY}" ]; then
      fly_staging_die "fail_class=dry_run_fixture_missing"
    fi
    HEADLESS_FLY_STAGING_FIXTURE_SCENARIO="${HEADLESS_FLY_STAGING_FIXTURE_SCENARIO:-staged_activation_pass}" \
      HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE="${HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE:-${TMPDIR:-/tmp}/fly-staging-dry-run-state.$$}" \
      "${FLY_STAGING_FIXTURE_FLY}" "$@"
    return $?
  fi
  fly "$@"
}

fly_staging_assert_required_functions() {
  for _fn in \
    fly_staging_die \
    fly_staging_require_gate \
    fly_staging_forbid_env_local \
    fly_staging_require_app_name \
    fly_staging_assert_required_functions \
    fly_staging_bootstrap_verify_first \
    fly_staging_validate_bridge_surface \
    fly_staging_accept_bridge \
    fly_staging_orchestrator_exit_cleanup \
    fly_staging_load_bridge \
    fly_staging_emit_decoded_secrets_import_stream \
    fly_staging_sync_decoded_secrets \
    fly_staging_assert_post_sync_secrets_ledger \
    fly_staging_orchestrator_rollback_to_zero \
    fly_staging_bridge_cleanup \
    fly_staging_apply_public_environment \
    fly_staging_unset_public_environment \
    fly_staging_assert_bridge_has_no_public_keys \
    fly_staging_assert_exact_zero_machines \
    fly_staging_classify_secrets_json_file \
    fly_staging_verify_first_activate_staged_secrets \
    fly_staging_destroy_all_app_machines \
    fly_staging_assert_no_public_services_text \
    fly_staging_provider_fly
  do
    if ! type "${_fn}" >/dev/null 2>&1; then
      fly_staging_die "fail_class=missing_required_function fn=${_fn}"
    fi
  done
  if type fly_staging_source_bridge >/dev/null 2>&1; then
    fly_staging_die "fail_class=forbidden_function_alias fn=fly_staging_source_bridge"
  fi
}

fly_staging_reject_tmp_orchestrator_wrapper() {
  _invoked="${HEADLESS_FLY_STAGING_ORCHESTRATOR_INVOKED_AS:-}"
  case "${_invoked}" in
    *"/.tmp/run-2e2d"*"verify-first.sh") fly_staging_die "fail_class=forbidden_tmp_wrapper" ;;
  esac
}

fly_staging_bootstrap_verify_first() {
  fly_staging_assert_required_functions
  fly_staging_reject_tmp_orchestrator_wrapper
  fly_staging_forbid_env_local
  if [ ! -f "${FLY_STAGING_VERIFY_FIRST_ENTRYPOINT}" ]; then
    fly_staging_die "fail_class=verify_first_entrypoint_missing"
  fi
  if [ ! -f "${FLY_STAGING_VERIFY_FIRST_PREFLIGHT_CLI}" ]; then
    fly_staging_die "fail_class=preflight_cli_missing"
  fi
  if [ ! -f "${FLY_STAGING_SECRETS_JSON_CLI}" ]; then
    fly_staging_die "fail_class=secrets_classifier_missing"
  fi
  if [ ! -f "${FLY_STAGING_VERIFY_FIRST_TEMPLATE}" ]; then
    fly_staging_die "fail_class=verify_first_template_missing"
  fi
  fly_staging_require_app_name
  _org="${HEADLESS_FLY_STAGING_ORG:-personal}"
  _region="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
  if [ "${_org}" != "personal" ] || [ "${_region}" != "iad" ]; then
    fly_staging_die "fail_class=wrong_org_or_region"
  fi
  _image_ref="${HEADLESS_FLY_STAGING_IMAGE_REF:-}"
  if [ -z "${_image_ref}" ]; then
    fly_staging_die "fail_class=missing_immutable_image_ref"
  fi
  case "${_image_ref}" in
    *sha256:[a-f0-9][a-f0-9][a-f0-9][a-f0-9]*) ;;
    *) fly_staging_die "fail_class=image_ref_missing_digest" ;;
  esac
  if [ -z "${HEADLESS_FLY_STAGING_BRIDGE_FILE:-}" ]; then
    fly_staging_die "fail_class=bridge_path_missing"
  fi
  printf 'phase=bootstrap\n'
}

fly_staging_validate_bridge_surface() {
  _bridge="${HEADLESS_FLY_STAGING_BRIDGE_FILE:-}"
  if [ -z "${_bridge}" ] || [ ! -f "${_bridge}" ]; then
    fly_staging_die "fail_class=bridge_missing"
  fi
  _mode="$(stat -f '%Lp' "${_bridge}" 2>/dev/null || stat -c '%a' "${_bridge}" 2>/dev/null || echo '')"
  if [ "${_mode}" != "600" ]; then
    fly_staging_die "fail_class=bridge_wrong_mode"
  fi
  for _k in ${FLY_STAGING_SECRET_NAMES}; do
    if ! grep -Eq "^${_k}=.+" "${_bridge}"; then
      fly_staging_die "fail_class=bridge_missing_key key=${_k}"
    fi
  done
  fly_staging_assert_bridge_has_no_public_keys "${_bridge}"
  if grep -Eq '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|CLERK_|NEXT_PUBLIC_|VERCEL_)' "${_bridge}"; then
    fly_staging_die "fail_class=bridge_forbidden_key"
  fi
  if grep -Eq '\.env\.local' "${_bridge}"; then
    fly_staging_die "fail_class=env_local_fallback_forbidden"
  fi
  printf 'phase=bridge_surface_validated\n'
}

fly_staging_accept_bridge() {
  fly_staging_validate_bridge_surface
  FLY_STAGING_BRIDGE_ACCEPTED=1
  export FLY_STAGING_BRIDGE_ACCEPTED
  trap fly_staging_orchestrator_exit_cleanup EXIT INT TERM HUP
  printf 'phase=bridge_accepted\n'
}

fly_staging_orchestrator_exit_cleanup() {
  set +e
  rm -f "${FLY_STAGING_ORCHESTRATOR_MATERIALIZED}"
  if [ "${FLY_STAGING_BRIDGE_ACCEPTED}" = "1" ]; then
    fly_staging_bridge_cleanup
  fi
  fly_staging_unset_public_environment
  fly_staging_unset_gate_env
  unset HEADLESS_WORKER_MODE 2>/dev/null || true
  unset HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE 2>/dev/null || true
  set -e
}

fly_staging_run_local_preflight() {
  if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
    _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/preflight-pass.log"
    if [ ! -f "${_fixture}" ]; then
      fly_staging_die "fail_class=dry_run_preflight_fixture_missing"
    fi
    cat "${_fixture}"
    return 0
  fi
  npx --yes tsx "${FLY_STAGING_VERIFY_FIRST_PREFLIGHT_CLI}"
}

fly_staging_observe_verify_runtime_logs() {
  _log_file="$1"
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _wait=0
  : >"${_log_file}"
  while [ "${_wait}" -lt 120 ]; do
    set +e
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      _scenario="${HEADLESS_FLY_STAGING_FIXTURE_SCENARIO:-staged_activation_pass}"
      case "${_scenario}" in
        schema_database_unavailable_rollback|schema_database_unavailable)
          _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/runtime-logs-schema-db-unavailable.txt"
          ;;
        verify_loop_not_started_rollback|verify_loop_not_started|rollback_destroy_fail|rollback_list_fail)
          _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/runtime-logs-loop-not-started.txt"
          ;;
        *)
          _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/runtime-logs-pass.txt"
          ;;
      esac
      if [ -f "${_fixture}" ]; then
        cat "${_fixture}" >>"${_log_file}"
      fi
    else
      fly_staging_provider_fly logs -a "${_app}" --no-tail >>"${_log_file}" 2>/dev/null
    fi
    set -e
    if grep -q 'hosted.loop.started' "${_log_file}" 2>/dev/null; then
      printf 'runtime_observation=PASS loop_readiness=started remote_schema_preflight=pass\n'
      return 0
    fi
    if grep -Eq 'database_unavailable|schema_preflight_database_unavailable|reasonId":"database_unavailable' "${_log_file}" 2>/dev/null; then
      printf 'runtime_observation=FAIL reason=schema_database_unavailable loop_readiness=not_started remote_schema_preflight=fail_database_unavailable\n'
      return 1
    fi
    if grep -Eq '"name":"hosted.schema.preflight".*"status":"fail"' "${_log_file}" 2>/dev/null; then
      printf 'runtime_observation=FAIL reason=schema_database_unavailable loop_readiness=not_started remote_schema_preflight=fail_database_unavailable\n'
      return 1
    fi
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      break
    fi
    sleep 5
    _wait=$((_wait + 5))
  done
  printf 'runtime_observation=FAIL reason=verify_loop_not_started loop_readiness=not_started remote_schema_preflight=unknown\n'
  return 1
}

# Emit decoded exact-nine import stream to stdout — never bridge file bytes.
fly_staging_emit_decoded_secrets_import_stream() {
  if [ "${FLY_STAGING_BRIDGE_LOADED:-0}" != "1" ]; then
    fly_staging_die "fail_class=bridge_not_loaded"
  fi
  if [ ! -f "${FLY_STAGING_SECRETS_IMPORT_CLI}" ]; then
    fly_staging_die "fail_class=secrets_import_cli_missing"
  fi
  npx --yes tsx "${FLY_STAGING_SECRETS_IMPORT_CLI}"
}

# Resynchronize Fly secrets from decoded bridge values while app has zero Machines.
fly_staging_sync_decoded_secrets() {
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL secrets_sync
  if [ "${FLY_STAGING_BRIDGE_LOADED:-0}" != "1" ]; then
    fly_staging_die "fail_class=bridge_not_loaded"
  fi
  fly_staging_assert_exact_zero_machines
  _import_err="$(mktemp)"
  set +e
  fly_staging_emit_decoded_secrets_import_stream 2>"${_import_err}" \
    | fly_staging_provider_fly secrets import -a "${HEADLESS_FLY_STAGING_APP_NAME}"
  _import_rc=$?
  set -e
  if [ -s "${_import_err}" ]; then
    _reason="$(awk -F= '/^fail_class=/{print $2; exit}' "${_import_err}" 2>/dev/null || true)"
    rm -f "${_import_err}"
    fly_staging_die "fail_class=secrets_sync_stream_invalid reason=${_reason:-import_stream}"
  fi
  rm -f "${_import_err}"
  if [ "${_import_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=secrets_sync_provider_error"
  fi
  printf 'secrets_sync=PASS source=decoded_values record_count=9 secret_values=redacted\n'
}

# Require truthful exact-nine ledger after decoded sync and before Machine creation.
fly_staging_assert_post_sync_secrets_ledger() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _json="$(mktemp)"
  set +e
  fly_staging_provider_fly secrets list -a "${_app}" --json >"${_json}" 2>"${_json}.err"
  _list_rc=$?
  set -e
  if [ "${_list_rc}" -ne 0 ]; then
    rm -f "${_json}" "${_json}.err"
    fly_staging_die "fail_class=secrets_post_sync_list_failed"
  fi
  set +e
  _cls="$(fly_staging_classify_secrets_json_file "${_json}" "${_list_rc}")"
  _cls_rc=$?
  set -e
  rm -f "${_json}" "${_json}.err"
  if [ "${_cls_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=secrets_post_sync_classify_failed"
  fi
  printf '%s\n' "${_cls}"
  _aggregate="$(printf '%s\n' "${_cls}" | awk -F= '/^aggregate=/{print $2; exit}')"
  case "${_aggregate}" in
    staged|partial|deployed)
      printf 'secrets_post_sync=PASS aggregate=%s\n' "${_aggregate}"
      ;;
    *)
      fly_staging_die "fail_class=secrets_post_sync_invalid aggregate=${_aggregate}"
      ;;
  esac
}

# Orchestrator-only rollback — bounded result, never calls exit directly.
fly_staging_orchestrator_rollback_to_zero() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _tmp="$(mktemp)"
  _destroy_failed=0
  _destroy_count=0
  set +e
  fly_staging_provider_fly machine list -a "${_app}" -q >"${_tmp}" 2>"${_tmp}.err"
  _list_rc=$?
  set -e
  if [ "${_list_rc}" -ne 0 ]; then
    rm -f "${_tmp}" "${_tmp}.err"
    printf 'rollback=unconfirmed reason=provider_list_failed\n'
    return 1
  fi
  while IFS= read -r _mid; do
    [ -z "${_mid}" ] && continue
    case "${_mid}" in
      *[!a-zA-Z0-9]*|????|???|??|?)
        rm -f "${_tmp}" "${_tmp}.err"
        printf 'rollback=unconfirmed reason=malformed_machine_list\n'
        return 1
        ;;
    esac
    set +e
    fly_staging_provider_fly machine destroy -a "${_app}" --force "${_mid}" >/dev/null 2>&1
    _destroy_rc=$?
    set -e
    _destroy_count=$((_destroy_count + 1))
    if [ "${_destroy_rc}" -ne 0 ]; then
      _destroy_failed=1
    fi
  done <"${_tmp}"
  rm -f "${_tmp}" "${_tmp}.err"
  if [ "${_destroy_failed}" -eq 1 ]; then
    printf 'rollback=unconfirmed reason=destroy_failed destroy_attempts=%s\n' "${_destroy_count}"
    return 1
  fi
  _proof_tmp="$(mktemp)"
  set +e
  fly_staging_provider_fly machine list -a "${_app}" -q >"${_proof_tmp}" 2>"${_proof_tmp}.err"
  _proof_rc=$?
  set -e
  if [ "${_proof_rc}" -ne 0 ]; then
    rm -f "${_proof_tmp}" "${_proof_tmp}.err"
    printf 'rollback=unconfirmed reason=provider_list_failed\n'
    return 1
  fi
  set +e
  _proof_out="$(fly_staging_classify_quiet_machine_list_file "${_proof_tmp}" 1)"
  _proof_cls_rc=$?
  set -e
  rm -f "${_proof_tmp}" "${_proof_tmp}.err"
  if [ "${_proof_cls_rc}" -ne 0 ]; then
    printf 'rollback=unconfirmed reason=malformed_machine_list\n'
    return 1
  fi
  if ! printf '%s' "${_proof_out}" | grep -q 'machine_count=0'; then
    printf 'rollback=unconfirmed reason=nonzero_inventory_after_destroy\n'
    return 1
  fi
  printf 'rollback=confirmed destroy_count=%s exact_zero_machines=PASS\n' "${_destroy_count}"
  return 0
}

# Render-only rollback — destroy render process group Machines; preserve verify=1 render=0.
fly_staging_orchestrator_rollback_render_only() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _json_tmp="$(mktemp)"
  set +e
  if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
    printf '[{"id":"abcd1234abcd1234","region":"iad","config":{"metadata":{"fly_process_group":"verify"}}},{"id":"efgh5678efgh5678","region":"iad","config":{"metadata":{"fly_process_group":"render"}}}]\n' >"${_json_tmp}"
    _list_rc=0
  else
    fly_staging_provider_fly machine list -a "${_app}" --json >"${_json_tmp}" 2>"${_json_tmp}.err"
    _list_rc=$?
  fi
  set -e
  if [ "${_list_rc}" -ne 0 ]; then
    rm -f "${_json_tmp}" "${_json_tmp}.err"
    printf 'rollback=unconfirmed reason=provider_list_failed\n'
    return 1
  fi
  _render_ids="$(node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(rows)) process.exit(1);
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  if (meta.fly_process_group === "render" && typeof row.id === "string") {
    console.log(row.id);
  }
}
' "${_json_tmp}")"
  _destroy_failed=0
  _destroy_count=0
  for _mid in ${_render_ids}; do
    [ -z "${_mid}" ] && continue
    set +e
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      _destroy_rc=0
    else
      fly_staging_provider_fly machine destroy -a "${_app}" --force "${_mid}" >/dev/null 2>&1
      _destroy_rc=$?
    fi
    set -e
    _destroy_count=$((_destroy_count + 1))
    if [ "${_destroy_rc}" -ne 0 ]; then
      _destroy_failed=1
    fi
  done
  rm -f "${_json_tmp}" "${_json_tmp}.err"
  if [ "${_destroy_failed}" -eq 1 ]; then
    printf 'rollback=unconfirmed reason=destroy_failed destroy_attempts=%s\n' "${_destroy_count}"
    return 1
  fi
  set +e
  if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
    printf 'verify=1 render=0 other=0\n'
    _proof_rc=0
  else
    fly_staging_provider_fly machine list -a "${_app}" --json >"${_json_tmp}" 2>"${_json_tmp}.err"
    _proof_rc=$?
    if [ "${_proof_rc}" -eq 0 ]; then
      node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
let verify = 0, render = 0, other = 0;
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const g = meta.fly_process_group;
  if (g === "verify") verify += 1;
  else if (g === "render") render += 1;
  else other += 1;
}
if (verify !== 1 || render !== 0 || other !== 0) {
  console.error("verify_lost=1 verify=" + verify + " render=" + render);
  process.exit(1);
}
console.log("verify=1 render=0 other=0");
' "${_json_tmp}"
      _proof_rc=$?
    fi
  fi
  set -e
  rm -f "${_json_tmp}" "${_json_tmp}.err"
  if [ "${_proof_rc}" -ne 0 ]; then
    printf 'rollback=unconfirmed reason=verify_not_preserved\n'
    return 1
  fi
  printf 'rollback=confirmed render_destroy_count=%s verify_preserved=1\n' "${_destroy_count}"
  return 0
}

fly_staging_observe_render_runtime_logs() {
  _log_file="$1"
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _wait=0
  : >"${_log_file}"
  while [ "${_wait}" -lt 120 ]; do
    set +e
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      _scenario="${HEADLESS_FLY_STAGING_FIXTURE_SCENARIO:-render_loop_pass}"
      case "${_scenario}" in
        render_loop_not_started_rollback|render_loop_not_started)
          _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/runtime-logs-loop-not-started.txt"
          ;;
        *)
          _fixture="${FOOTIEBITZ_ROOT}/scripts/fly-staging/fixtures/runtime-logs-pass.txt"
          ;;
      esac
      if [ -f "${_fixture}" ]; then
        cat "${_fixture}" >>"${_log_file}"
      fi
    else
      fly_staging_provider_fly logs -a "${_app}" --no-tail >>"${_log_file}" 2>/dev/null
    fi
    set -e
    if grep -q 'hosted.loop.started' "${_log_file}" 2>/dev/null; then
      printf 'runtime_observation=PASS loop_readiness=started worker_mode=render\n'
      return 0
    fi
    if grep -Eq '"action":"(dispatch_sweep|claimed_and_acked|render_complete)"' "${_log_file}" 2>/dev/null; then
      printf 'runtime_observation=PASS loop_readiness=operational_heartbeat worker_mode=render\n'
      return 0
    fi
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      break
    fi
    sleep 5
    _wait=$((_wait + 5))
  done
  printf 'runtime_observation=FAIL reason=render_loop_not_started loop_readiness=not_started\n'
  return 1
}

fly_staging_die() {
  printf '%s\n' "$1" >&2
  exit 1
}

fly_staging_require_gate() {
  _gate_env="$1"
  _gate_id="$2"
  if [ "${HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED:-}" != "1" ]; then
    fly_staging_die "fail_class=master_execution_blocked gate=${_gate_id} provider_contact=blocked"
  fi
  eval "_gate_val=\${${_gate_env}:-}"
  if [ "${_gate_val}" != "1" ]; then
    fly_staging_die "fail_class=gate_blocked gate=${_gate_id} provider_contact=blocked"
  fi
}

fly_staging_forbid_env_local() {
  if [ -n "${HEADLESS_FLY_STAGING_ALLOW_ENV_LOCAL:-}" ]; then
    fly_staging_die "fail_class=env_local_fallback_forbidden"
  fi
}

fly_staging_require_app_name() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME:-}"
  case "${_app}" in
    shortforge-hw-staging-[a-z0-9][a-z0-9][a-z0-9][a-z0-9]*)
      ;;
    *)
      fly_staging_die "fail_class=invalid_staging_app_name"
      ;;
  esac
  case "${_app}" in
    *prod*|*live*)
      fly_staging_die "fail_class=production_name_rejected"
      ;;
  esac
}

fly_staging_bridge_cleanup() {
  set +e
  if [ -n "${HEADLESS_FLY_STAGING_BRIDGE_FILE:-}" ] && [ -f "${HEADLESS_FLY_STAGING_BRIDGE_FILE}" ]; then
    rm -f -- "${HEADLESS_FLY_STAGING_BRIDGE_FILE}"
  fi
  for _k in ${FLY_STAGING_SECRET_NAMES}; do
    unset "${_k}" 2>/dev/null || true
  done
  fly_staging_unset_public_environment
  fly_staging_unset_gate_env
  unset HEADLESS_FLY_STAGING_BRIDGE_FILE 2>/dev/null || true
  unset HEADLESS_WORKER_MODE 2>/dev/null || true
  set -e
}

# Trusted public staging [env] from digest-bound deployment pair authority — never from credential bridge.
fly_staging_deployment_pair_cli() {
  npx tsx "${FOOTIEBITZ_ROOT}/scripts/fly-staging/fly-staging-deployment-pair-cli.ts" "$@"
}

fly_staging_apply_public_environment_for_digest() {
  _digest="$1"
  if [ -z "${_digest}" ]; then
    fly_staging_die "fail_class=image_environment_authority_incoherent reason=missing_digest"
  fi
  _build_id="$(fly_staging_deployment_pair_cli resolve-public-env-build-id "${_digest}" 2>/dev/null)" || \
    fly_staging_die "fail_class=image_environment_authority_incoherent"
  export HEADLESS_ENV_NAME="staging"
  export HEADLESS_CHROME_PATH="/usr/bin/chromium"
  export HEADLESS_FFMPEG_PATH="/usr/bin/ffmpeg"
  export HEADLESS_FFPROBE_PATH="/usr/bin/ffprobe"
  export HEADLESS_RENDERER_BUILD_ID="${_build_id}"
  export HEADLESS_WORKER_CONCURRENCY="1"
  export HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS="25000"
  export HEADLESS_WORKER_WORKSPACE_ROOT="/tmp/footiebitz-headless-worker"
  export HEADLESS_HOSTED_IMAGE_CLASS="deployable_worker"
}

fly_staging_validate_image_environment_coherence() {
  _digest="$1"
  _build_id="$2"
  fly_staging_deployment_pair_cli validate-coherence "${_digest}" "${_build_id}" >/dev/null 2>&1 || \
    fly_staging_die "fail_class=image_environment_authority_incoherent"
}

fly_staging_materialized_config_identity_for_digest() {
  _kind="$1"
  _digest="$2"
  _sequence="$3"
  _prefix="$(printf '%s' "${_digest}" | cut -c1-8)"
  printf 'fly.staging.%s-%s-attempt-%s.materialized.toml' "${_kind}" "${_prefix}" "${_sequence}"
}

fly_staging_apply_public_environment() {
  _build_id="$(fly_staging_deployment_pair_cli resolve-current-build-id 2>/dev/null)" || \
    fly_staging_die "fail_class=image_environment_authority_incoherent"
  export HEADLESS_ENV_NAME="staging"
  export HEADLESS_CHROME_PATH="/usr/bin/chromium"
  export HEADLESS_FFMPEG_PATH="/usr/bin/ffmpeg"
  export HEADLESS_FFPROBE_PATH="/usr/bin/ffprobe"
  export HEADLESS_RENDERER_BUILD_ID="${_build_id}"
  export HEADLESS_WORKER_CONCURRENCY="1"
  export HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS="25000"
  export HEADLESS_WORKER_WORKSPACE_ROOT="/tmp/footiebitz-headless-worker"
  export HEADLESS_HOSTED_IMAGE_CLASS="deployable_worker"
}

fly_staging_unset_public_environment() {
  for _k in ${FLY_STAGING_PUBLIC_ENV_NAMES}; do
    unset "${_k}" 2>/dev/null || true
  done
}

fly_staging_unset_gate_env() {
  for _k in ${FLY_STAGING_GATE_ENV_NAMES}; do
    unset "${_k}" 2>/dev/null || true
  done
}

fly_staging_assert_bridge_has_no_public_keys() {
  _bridge="$1"
  for _k in ${FLY_STAGING_PUBLIC_ENV_NAMES}; do
    if grep -Eq "^${_k}=" "${_bridge}"; then
      fly_staging_die "fail_class=bridge_public_env_key key=${_k}"
    fi
  done
  if grep -Eq '^HEADLESS_WORKER_MODE=' "${_bridge}"; then
    fly_staging_die "fail_class=bridge_process_mode_key"
  fi
  for _k in ${FLY_STAGING_GATE_ENV_NAMES}; do
    if grep -Eq "^${_k}=" "${_bridge}"; then
      fly_staging_die "fail_class=bridge_gate_env_key key=${_k}"
    fi
  done
}

fly_staging_load_bridge() {
  if [ "${FLY_STAGING_BRIDGE_ACCEPTED:-0}" != "1" ]; then
    fly_staging_die "fail_class=bridge_not_accepted"
  fi
  if [ "${FLY_STAGING_BRIDGE_LOADED:-0}" = "1" ]; then
    fly_staging_die "fail_class=bridge_already_loaded"
  fi
  if [ "${HEADLESS_FLY_STAGING_FIXTURE_SCENARIO:-}" = "load_fail" ] && [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
    fly_staging_die "fail_class=bridge_load_simulated_fail"
  fi
  _bridge="${HEADLESS_FLY_STAGING_BRIDGE_FILE:-}"
  if [ -z "${_bridge}" ] || [ ! -f "${_bridge}" ]; then
    fly_staging_die "fail_class=bridge_missing"
  fi
  _mode="$(stat -f '%Lp' "${_bridge}" 2>/dev/null || stat -c '%a' "${_bridge}" 2>/dev/null || echo '')"
  if [ "${_mode}" != "600" ]; then
    fly_staging_die "fail_class=bridge_wrong_mode"
  fi
  # Membership check only — never print values.
  for _k in ${FLY_STAGING_SECRET_NAMES}; do
    if ! grep -Eq "^${_k}=.+" "${_bridge}"; then
      fly_staging_die "fail_class=bridge_missing_key key=${_k}"
    fi
  done
  fly_staging_assert_bridge_has_no_public_keys "${_bridge}"
  if grep -Eq '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|CLERK_|NEXT_PUBLIC_|VERCEL_)' "${_bridge}"; then
    fly_staging_die "fail_class=bridge_forbidden_key"
  fi
  if grep -Eq '\.env\.local' "${_bridge}"; then
    fly_staging_die "fail_class=env_local_fallback_forbidden"
  fi
  set -a
  # shellcheck disable=SC1090
  . "${_bridge}"
  set +a
  FLY_STAGING_BRIDGE_LOADED=1
  export FLY_STAGING_BRIDGE_LOADED
  printf 'phase=bridge_loaded\n'
}

fly_staging_assert_no_fly_invocation_without_gate() {
  # Marker for authority suites: scripts source this file and call require_gate first.
  :
}

# Prove exact secret-name membership from `fly secrets list` (names only).
# Accepts `* NAME` or unmarked `NAME`, Digests/Staged/Deployed columns, and
# Fly table headers. Never inspects or prints secret values.
fly_staging_assert_secret_names_present() {
  _list_file="$1"
  _parsed="$(mktemp)"
  awk '
    BEGIN { FS="" }
    {
      line=$0
      gsub(/\r/, "", line)
      # Strip box-drawing / pipe columns to spaces.
      gsub(/[│|]/, " ", line)
      sub(/^[[:space:]]*\*?[[:space:]]*/, "", line)
      if (line ~ /^NAME([[:space:]]|$)/) next
      if (line ~ /^-+/) next
      if (line ~ /^[[:space:]]*$/) next
      if (line ~ /^There are /) next
      n = line
      sub(/[[:space:]].*$/, "", n)
      if (n == "" || n == "DIGEST" || n == "STATUS") next
      print n
    }
  ' "${_list_file}" >"${_parsed}"

  _count="$(wc -l <"${_parsed}" | tr -d ' ')"
  if [ "${_count}" != "9" ]; then
    rm -f "${_parsed}"
    fly_staging_die "fail_class=secret_name_count_mismatch count=${_count}"
  fi
  if sort "${_parsed}" | uniq -d | grep -q .; then
    rm -f "${_parsed}"
    fly_staging_die "fail_class=secret_name_duplicate"
  fi
  for _k in ${FLY_STAGING_SECRET_NAMES}; do
    if ! grep -qx "${_k}" "${_parsed}"; then
      rm -f "${_parsed}"
      fly_staging_die "fail_class=secret_name_missing key=${_k}"
    fi
  done
  while IFS= read -r _n; do
    _known=0
    for _k in ${FLY_STAGING_SECRET_NAMES}; do
      if [ "${_n}" = "${_k}" ]; then _known=1; break; fi
    done
    if [ "${_known}" -ne 1 ]; then
      case "${_n}" in
        UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|DATABASE_URL_UNPOOLED|CLERK_*|VERCEL_*|NEXT_PUBLIC_*)
          rm -f "${_parsed}"
          fly_staging_die "fail_class=forbidden_secret_name_present"
          ;;
        *)
          rm -f "${_parsed}"
          fly_staging_die "fail_class=unknown_secret_name"
          ;;
      esac
    fi
  done <"${_parsed}"
  rm -f "${_parsed}"
}

# Classify quiet machine-list body from a file (fixture-friendly).
# Succeeds only for exact zero or prints machine_count=N for nonempty.
# Provider error / malformed → die (never treat as zero).
fly_staging_classify_quiet_machine_list_file() {
  _list_file="$1"
  _succeeded="${2:-1}"
  if [ "${_succeeded}" != "1" ]; then
    fly_staging_die "fail_class=machine_list_provider_error"
  fi
  if [ ! -f "${_list_file}" ]; then
    fly_staging_die "fail_class=malformed_machine_list"
  fi
  # Reject error prose / table headers.
  if grep -Eqi 'error|failed|could not|NAME|STATE|REGION' "${_list_file}"; then
    fly_staging_die "fail_class=malformed_machine_list"
  fi
  _ids="$(awk '
    {
      gsub(/\r/, "", $0)
      line=$0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line == "") next
      if (line !~ /^[a-zA-Z0-9]{8,}$/) { print "MALFORMED"; exit 2 }
      print line
    }
  ' "${_list_file}")" || true
  if printf '%s' "${_ids}" | grep -qx 'MALFORMED'; then
    fly_staging_die "fail_class=malformed_machine_list"
  fi
  if [ -z "${_ids}" ]; then
    printf 'machine_list=ok machine_count=0\n'
    return 0
  fi
  _count="$(printf '%s\n' "${_ids}" | awk 'NF{c++} END{print c+0}')"
  printf 'machine_list=ok machine_count=%s\n' "${_count}"
  printf '%s\n' "${_ids}"
  return 0
}

# Live: fly machine list -q must succeed; empty means zero. Failure ≠ zero.
fly_staging_assert_exact_zero_machines() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _tmp="$(mktemp)"
  set +e
  fly_staging_provider_fly machine list -a "${_app}" -q >"${_tmp}" 2>"${_tmp}.err"
  _rc=$?
  set -e
  if [ "${_rc}" -ne 0 ]; then
    rm -f "${_tmp}" "${_tmp}.err"
    fly_staging_die "fail_class=machine_list_provider_error"
  fi
  if [ -s "${_tmp}.err" ] && grep -Eqi 'error|failed|could not' "${_tmp}.err"; then
    rm -f "${_tmp}" "${_tmp}.err"
    fly_staging_die "fail_class=machine_list_provider_error"
  fi
  set +e
  _out="$(fly_staging_classify_quiet_machine_list_file "${_tmp}" 1)"
  _cls_rc=$?
  set -e
  rm -f "${_tmp}" "${_tmp}.err"
  if [ "${_cls_rc}" -ne 0 ]; then
    return "${_cls_rc}"
  fi
  if ! printf '%s' "${_out}" | grep -q 'machine_count=0'; then
    fly_staging_die "fail_class=unexpected_machine"
  fi
  printf 'exact_zero_machines=PASS\n'
}

# Classify `fly secrets list --json` from file — names/status only via TS authority.
fly_staging_classify_secrets_json_file() {
  _json_file="$1"
  _list_rc="${2:-0}"
  if [ ! -f "${_json_file}" ]; then
    fly_staging_die "fail_class=malformed_secret_list"
  fi
  if [ ! -f "${FLY_STAGING_SECRETS_JSON_CLI}" ]; then
    fly_staging_die "fail_class=secrets_classifier_missing"
  fi
  npx --yes tsx "${FLY_STAGING_SECRETS_JSON_CLI}" "${_json_file}" "${_list_rc}"
}

# Live secrets ledger — bounded aggregate + runtime_ready lines only.
fly_staging_fetch_secrets_ledger() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _tmp="$(mktemp)"
  set +e
  fly_staging_provider_fly secrets list -a "${_app}" --json >"${_tmp}" 2>"${_tmp}.err"
  _rc=$?
  set -e
  if [ "${_rc}" -ne 0 ]; then
    rm -f "${_tmp}" "${_tmp}.err"
    fly_staging_die "fail_class=secrets_list_provider_error"
  fi
  fly_staging_classify_secrets_json_file "${_tmp}" "${_rc}"
  _cls_rc=$?
  rm -f "${_tmp}" "${_tmp}.err"
  return "${_cls_rc}"
}

# Verify-first: exactly one `fly secrets deploy` when staged/partial; require all deployed.
fly_staging_verify_first_activate_staged_secrets() {
  _config="$1"
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _secrets_json="$(mktemp)"
  _machine_before="$(mktemp)"
  _machine_after="$(mktemp)"
  set +e
  fly_staging_provider_fly secrets list -a "${_app}" --json >"${_secrets_json}" 2>"${_secrets_json}.err"
  _list_rc=$?
  set -e
  if [ "${_list_rc}" -ne 0 ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_list_provider_error"
  fi
  set +e
  _before="$(fly_staging_classify_secrets_json_file "${_secrets_json}" "${_list_rc}")"
  _before_rc=$?
  set -e
  if [ "${_before_rc}" -ne 0 ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_ledger_invalid"
  fi
  _aggregate="$(printf '%s\n' "${_before}" | awk -F= '/^aggregate=/{print $2; exit}')"
  _runtime_ready="$(printf '%s\n' "${_before}" | awk -F= '/^runtime_ready=/{print $2; exit}')"
  if [ "${_aggregate}" = "deployed" ] && [ "${_runtime_ready}" = "true" ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    printf 'secrets_activation=SKIP aggregate=deployed runtime_ready=true\n'
    return 0
  fi
  if [ "${_aggregate}" != "staged" ] && [ "${_aggregate}" != "partial" ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_not_activatable aggregate=${_aggregate}"
  fi
  set +e
  fly_staging_provider_fly machine list -a "${_app}" --json >"${_machine_before}" 2>/dev/null
  set -e
  set +e
  fly_staging_provider_fly secrets deploy -a "${_app}" -c "${_config}"
  printf 'secrets_deploy_invoked=1\n'
  _deploy_rc=$?
  set -e
  if [ "${_deploy_rc}" -ne 0 ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_deploy_failed"
  fi
  _wait=0
  while [ "${_wait}" -lt 90 ]; do
    if [ "${HEADLESS_FLY_STAGING_DRY_RUN:-}" = "1" ]; then
      _wait=90
    else
      sleep 3
      _wait=$((_wait + 3))
    fi
    set +e
    fly_staging_provider_fly secrets list -a "${_app}" --json >"${_secrets_json}" 2>"${_secrets_json}.err"
    _list_rc=$?
    set -e
    if [ "${_list_rc}" -ne 0 ]; then
      continue
    fi
    set +e
    _after="$(fly_staging_classify_secrets_json_file "${_secrets_json}" "${_list_rc}")"
    _after_rc=$?
    set -e
    if [ "${_after_rc}" -ne 0 ]; then
      continue
    fi
    _after_agg="$(printf '%s\n' "${_after}" | awk -F= '/^aggregate=/{print $2; exit}')"
    if [ "${_after_agg}" = "deployed" ]; then
      break
    fi
  done
  set +e
  fly_staging_provider_fly machine list -a "${_app}" --json >"${_machine_after}" 2>/dev/null
  set -e
  set +e
  _final="$(fly_staging_classify_secrets_json_file "${_secrets_json}" "${_list_rc}")"
  _final_rc=$?
  set -e
  if [ "${_final_rc}" -ne 0 ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_ledger_invalid_after_deploy"
  fi
  _final_agg="$(printf '%s\n' "${_final}" | awk -F= '/^aggregate=/{print $2; exit}')"
  _final_ready="$(printf '%s\n' "${_final}" | awk -F= '/^runtime_ready=/{print $2; exit}')"
  if [ "${_final_agg}" != "deployed" ] || [ "${_final_ready}" != "true" ]; then
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=secrets_not_deployed_final aggregate=${_final_agg}"
  fi
  node -e '
const fs = require("fs");
const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(before) || !Array.isArray(after)) process.exit(1);
if (before.length !== 1 || after.length !== 1) process.exit(1);
const b = before[0], a = after[0];
if (!b || !a || b.id !== a.id) process.exit(1);
const bg = ((b.config && b.config.metadata) || b.metadata || {}).fly_process_group;
const ag = ((a.config && a.config.metadata) || a.metadata || {}).fly_process_group;
if (bg !== "verify" || ag !== "verify") process.exit(1);
if (b.region !== "iad" || a.region !== "iad") process.exit(1);
const digest = (m) => {
  const img = m.config && m.config.image;
  if (typeof img === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(img);
    if (match) return match[1].toLowerCase();
  }
  const ref = m.image_ref && m.image_ref.digest;
  return typeof ref === "string" ? ref.toLowerCase() : "";
};
if (digest(b) !== digest(a) || !digest(b)) process.exit(1);
' "${_machine_before}" "${_machine_after}" || {
    rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
    fly_staging_die "fail_class=machine_topology_changed_during_activation"
  }
  rm -f "${_secrets_json}" "${_secrets_json}.err" "${_machine_before}" "${_machine_after}"
  printf 'secrets_activation=PASS aggregate=deployed runtime_ready=true deploy_attempts=1\n'
}

# Destroy every Machine on the staging app; require exact zero afterward.
fly_staging_destroy_all_app_machines() {
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  _tmp="$(mktemp)"
  _destroy_failed=0
  set +e
  fly_staging_provider_fly machine list -a "${_app}" -q >"${_tmp}" 2>"${_tmp}.err"
  _rc=$?
  set -e
  if [ "${_rc}" -ne 0 ]; then
    rm -f "${_tmp}" "${_tmp}.err"
    fly_staging_die "fail_class=machine_list_provider_error"
  fi
  while IFS= read -r mid; do
    [ -z "${mid}" ] && continue
    case "${mid}" in
      *[!a-zA-Z0-9]*|????|???|??|?)
        rm -f "${_tmp}" "${_tmp}.err"
        fly_staging_die "fail_class=malformed_machine_list"
        ;;
    esac
    set +e
    fly_staging_provider_fly machine destroy -a "${_app}" --force "${mid}" >/dev/null 2>&1
    _destroy_rc=$?
    set -e
    if [ "${_destroy_rc}" -ne 0 ]; then
      _destroy_failed=1
    fi
  done <"${_tmp}"
  rm -f "${_tmp}" "${_tmp}.err"
  if [ "${_destroy_failed}" -eq 1 ]; then
    fly_staging_die "fail_class=machine_destroy_failed"
  fi
  fly_staging_assert_exact_zero_machines
}

# Capture verify=1/render=1 topology without requiring zero Machines.
fly_staging_capture_dual_consumer_topology_proof() {
  _out="$1"
  _machine_json="$2"
  _release_file="$3"
  _app="${HEADLESS_FLY_STAGING_APP_NAME}"
  set +e
  fly_staging_provider_fly machine list -a "${_app}" --json >"${_machine_json}" 2>"${_machine_json}.err"
  _list_rc=$?
  fly_staging_provider_fly releases -a "${_app}" --json >"${_release_file}" 2>"${_release_file}.err"
  _release_rc=$?
  set -e
  if [ "${_list_rc}" -ne 0 ] || [ "${_release_rc}" -ne 0 ]; then
    fly_staging_die "fail_class=topology_provider_error"
  fi
  node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const releases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(rows)) process.exit(2);
let verify = 0, render = 0, other = 0;
const ids = [];
const digests = [];
const digest = (m) => {
  const img = m.config && m.config.image;
  if (typeof img === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(img);
    if (match) return match[1].toLowerCase();
  }
  const ref = m.image_ref && m.image_ref.digest;
  return typeof ref === "string" ? ref.toLowerCase() : "";
};
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (typeof row.id === "string") ids.push(row.id);
  if (row.region !== "iad") process.exit(3);
  const state = row.state || row.Status || "";
  if (state && state !== "started" && state !== "running" && state !== "Started") process.exit(4);
  const d = digest(row);
  if (!d) process.exit(5);
  digests.push(d);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(6);
if (new Set(digests).size !== 1) process.exit(7);
const active = Array.isArray(releases) && releases.length > 0 ? releases[0] : null;
const activeVersion = active && typeof active.Version === "number" ? active.Version : (active && active.version) || "";
const lines = [
  "verify=1",
  "render=1",
  "other=0",
  "region=iad",
  "machine_count=2",
  "machine_ids=" + ids.sort().join(","),
  "unified_digest=" + digests[0],
  "active_release=" + String(activeVersion),
];
fs.writeFileSync(process.argv[3], lines.join("\n") + "\n");
' "${_machine_json}" "${_release_file}" "${_out}" || fly_staging_die "fail_class=topology_classification_failed"
}

fly_staging_assert_dual_consumer_topology_unchanged() {
  _before_json="$1"
  _after_json="$2"
  _before_release="$3"
  _after_release="$4"
  node -e '
const fs = require("fs");
const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const beforeRelease = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const afterRelease = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
if (!Array.isArray(before) || !Array.isArray(after)) process.exit(1);
if (before.length !== after.length) process.exit(2);
const key = (m) => {
  const meta = (m.config && m.config.metadata) || m.metadata || {};
  return [m.id, m.region, m.state, meta.fly_process_group, (m.config && m.config.image) || "", (m.image_ref && m.image_ref.digest) || ""].join("|");
};
const beforeKeys = before.map(key).sort();
const afterKeys = after.map(key).sort();
if (beforeKeys.length !== afterKeys.length) process.exit(3);
for (let i = 0; i < beforeKeys.length; i += 1) {
  if (beforeKeys[i] !== afterKeys[i]) process.exit(4);
}
const activeVersion = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const active = rows[0];
  return String((active && active.Version) || (active && active.version) || "");
};
if (activeVersion(beforeRelease) !== activeVersion(afterRelease)) process.exit(5);
' "${_before_json}" "${_after_json}" "${_before_release}" "${_after_release}" || fly_staging_die "fail_class=topology_mutated_during_bridge_build_only"
  printf 'topology_unchanged=PASS\n'
}

# Fixture-friendly: classify build-only push log file.
fly_staging_classify_image_push_log_file() {
  _log="$1"
  if [ ! -f "${_log}" ]; then
    fly_staging_die "fail_class=hostile_input"
  fi
  if ! grep -q 'Building image done' "${_log}"; then
    fly_staging_die "fail_class=push_not_proven"
  fi
  if ! grep -Eq 'image:[[:space:]]*registry\.fly\.io/' "${_log}"; then
    fly_staging_die "fail_class=push_not_proven"
  fi
  if ! grep -Eq 'exporting manifest sha256:[a-f0-9]{64}' "${_log}"; then
    fly_staging_die "fail_class=push_not_proven"
  fi
  _digest="$(awk 'match($0, /exporting manifest sha256:[a-f0-9]{64}/) {
    s=substr($0, RSTART, RLENGTH); sub(/.*sha256:/, "", s); print s; exit
  }' "${_log}")"
  _noise=0
  if grep -q 'No machines configured for this app' "${_log}" \
    && grep -q 'could not create a fly.toml from any machines' "${_log}"; then
    _noise=1
  fi
  if [ "${_noise}" = "1" ]; then
    printf 'push=PASS noise=tolerated manifest_sha256=%s\n' "${_digest}"
  else
    printf 'push=PASS noise=absent manifest_sha256=%s\n' "${_digest}"
  fi
}

# Toml/config text must not expose public services.
fly_staging_assert_no_public_services_text() {
  _text_file="$1"
  if grep -Eq '^\[\[services\]\]|^\[http_service\]' "${_text_file}"; then
    fly_staging_die "fail_class=public_service_exposure"
  fi
  printf 'public_services=none\n'
}
