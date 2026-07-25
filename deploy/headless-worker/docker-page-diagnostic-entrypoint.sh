#!/bin/sh
# Provider-free page diagnostic entry — not verify/render production worker.
set -eu

if [ "${HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC:-}" != "1" ]; then
  echo '{"name":"hosted.page_diagnostic","status":"failed","diagnostic_stage":"diagnostic_environment","page_substage":"diagnostic_environment","reason_id":"gate_off","file_present_class":"not_applicable","script_loaded_class":"not_applicable","contract_global_class":"not_applicable","contract_version_class":"not_applicable","response_class":"not_reached","chromium_exit_class":"not_applicable","bounded_duration_ms":null,"cleanup_status":"not_run"}'
  exit 1
fi

if [ "${HEADLESS_WORKER_MODE:-}" = "verify" ] || [ "${HEADLESS_WORKER_MODE:-}" = "render" ]; then
  echo '{"name":"hosted.page_diagnostic","status":"failed","diagnostic_stage":"diagnostic_environment","page_substage":"diagnostic_environment","reason_id":"forbidden_worker_mode","file_present_class":"not_applicable","script_loaded_class":"not_applicable","contract_global_class":"not_applicable","contract_version_class":"not_applicable","response_class":"runtime_exception","chromium_exit_class":"failed","bounded_duration_ms":null,"cleanup_status":"not_run"}'
  exit 1
fi

mkdir -p "${HEADLESS_WORKER_WORKSPACE_ROOT:-/tmp/footiebitz-headless-worker}"
export HEADLESS_PAGE_DIAGNOSTIC_ROOT=/app

exec /usr/bin/tini -- node /app/page-diagnostic.js
