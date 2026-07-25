#!/bin/sh
# Provider-free claimed-render diagnostic bootstrap wrapper — not verify/render production worker.
set -eu

CRD_APP_ROOT="${HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_APP_ROOT:-/app}"
CRD_BOOTSTRAP_NAME="hosted.claimed_render_diagnostic_bootstrap"
CRD_EVIDENCE_ROOT="/tmp/shortforge-claimed-render-diagnostic"
CRD_EVIDENCE_FILE="${CRD_EVIDENCE_ROOT}/evidence.jsonl"

_crd_hold_raw="${HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC:-300}"
case "$_crd_hold_raw" in
  ''|*[!0-9]*) CRD_HOLD_MAX_SEC=300 ;;
  *) CRD_HOLD_MAX_SEC="$_crd_hold_raw" ;;
esac
if [ "$CRD_HOLD_MAX_SEC" -gt 300 ]; then
  CRD_HOLD_MAX_SEC=300
fi

crd_assert_evidence_path_fixed() {
  case "$CRD_EVIDENCE_ROOT" in
    /tmp/shortforge-claimed-render-diagnostic) ;;
    *) exit 1 ;;
  esac
  if [ -L "$CRD_EVIDENCE_ROOT" ] || [ -L "$CRD_EVIDENCE_FILE" ]; then
    exit 1
  fi
}

crd_emit_lifecycle() {
  _stage="$1"
  _status="${2:-ok}"
  _reason="${3:-}"
  if [ -z "$_reason" ]; then
    _line="{\"name\":\"${CRD_BOOTSTRAP_NAME}\",\"lifecycle_stage\":\"${_stage}\",\"status\":\"${_status}\",\"reason_id\":null}"
  else
    _line="{\"name\":\"${CRD_BOOTSTRAP_NAME}\",\"lifecycle_stage\":\"${_stage}\",\"status\":\"${_status}\",\"reason_id\":\"${_reason}\"}"
  fi
  printf '%s\n' "$_line"
  crd_assert_evidence_path_fixed
  mkdir -p "$CRD_EVIDENCE_ROOT"
  printf '%s\n' "$_line" >> "$CRD_EVIDENCE_FILE"
  sync "$CRD_EVIDENCE_FILE" 2>/dev/null || sync
}

CRD_CHILD_PID=""
CRD_CHILD_EXIT=0
CRD_HOLD_ACTIVE=""
crd_forward_signal() {
  if [ -n "$CRD_CHILD_PID" ] && kill -0 "$CRD_CHILD_PID" 2>/dev/null; then
    kill -TERM "$CRD_CHILD_PID" 2>/dev/null || true
    return
  fi
  if [ -n "$CRD_HOLD_ACTIVE" ]; then
    crd_emit_lifecycle evidence_hold_completed failed signal_interrupted
    exit "$CRD_CHILD_EXIT"
  fi
}
trap crd_forward_signal TERM INT

crd_assert_evidence_path_fixed
mkdir -p "$CRD_EVIDENCE_ROOT"
: >> "$CRD_EVIDENCE_FILE"

crd_emit_lifecycle shell_entrypoint_started

if [ ! -r "${CRD_APP_ROOT}/claimed-render-diagnostic.js" ]; then
  crd_emit_lifecycle node_process_starting failed bundle_unreadable
  crd_emit_lifecycle shell_child_exit failed bundle_unreadable
  exit 1
fi

crd_emit_lifecycle node_process_starting

mkdir -p "${HEADLESS_WORKER_WORKSPACE_ROOT:-/tmp/footiebitz-headless-worker}"
export HEADLESS_PAGE_BUNDLE_PATH="${CRD_APP_ROOT}/page-render.iife.js"
export HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_ROOT="${CRD_APP_ROOT}"

if [ -x /usr/bin/tini ]; then
  /usr/bin/tini -s -- node "${CRD_APP_ROOT}/claimed-render-diagnostic.js" &
else
  node "${CRD_APP_ROOT}/claimed-render-diagnostic.js" &
fi
CRD_CHILD_PID=$!
set +e
wait "$CRD_CHILD_PID"
CRD_CHILD_EXIT=$?
set -e
CRD_CHILD_PID=""

if [ "$CRD_CHILD_EXIT" -eq 0 ]; then
  crd_emit_lifecycle shell_child_exit ok
else
  crd_emit_lifecycle shell_child_exit failed nonzero_exit
fi

crd_emit_lifecycle evidence_hold_started
CRD_HOLD_ACTIVE=1
CRD_HOLD_END=$(( $(date +%s) + CRD_HOLD_MAX_SEC ))
while [ "$(date +%s)" -lt "$CRD_HOLD_END" ]; do
  sleep 1
done
CRD_HOLD_ACTIVE=""
crd_emit_lifecycle evidence_hold_completed

exit "$CRD_CHILD_EXIT"
