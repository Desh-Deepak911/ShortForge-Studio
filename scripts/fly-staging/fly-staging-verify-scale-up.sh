#!/bin/sh
# Internal deploy step — invoke only from fly-staging-verify-first.sh (canonical orchestrator).
# Gate: first verify activation — verify-only first deploy from immutable image.
# Model: verify_only_first_deploy_from_immutable_image
# Creates exactly one verify Machine; render must remain absent.
# Requires HEADLESS_FLY_STAGING_IMAGE_REF (registry ref including digest).
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP verify_scale_up
fly_staging_require_app_name

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

IMAGE_REF="${HEADLESS_FLY_STAGING_IMAGE_REF:-}"
if [ -z "${IMAGE_REF}" ]; then
  fly_staging_die "fail_class=missing_immutable_image_ref"
fi
case "${IMAGE_REF}" in
  *sha256:[a-f0-9][a-f0-9][a-f0-9][a-f0-9]*)
    ;;
  *)
    fly_staging_die "fail_class=image_ref_missing_digest"
    ;;
esac

# Precondition: zero Machines (post zero-consumer release).
fly_staging_assert_exact_zero_machines

MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.verify-first.materialized.toml"
sed "s/REPLACE_WITH_STAGING_APP_NAME/${HEADLESS_FLY_STAGING_APP_NAME}/g" \
  "${FLY_STAGING_VERIFY_FIRST_TEMPLATE}" > "${MATERIALIZED}"

cleanup_materialized() {
  rm -f "${MATERIALIZED}"
}
if [ -z "${HEADLESS_FLY_STAGING_ORCHESTRATOR_ACTIVE:-}" ]; then
  trap cleanup_materialized EXIT
fi

fly_staging_assert_no_public_services_text "${MATERIALIZED}"
if grep -Eq 'render\s*=\s*"render"|processes\s*=\s*\["render"\]' "${MATERIALIZED}"; then
  fly_staging_die "fail_class=render_process_in_verify_first_config"
fi

# First deploy seeds exactly one verify Machine from the accepted image — no rebuild.
fly_staging_provider_fly deploy \
  --config "${MATERIALIZED}" \
  --app "${HEADLESS_FLY_STAGING_APP_NAME}" \
  --primary-region "${REGION}" \
  --image "${IMAGE_REF}" \
  --ha=false \
  --yes

# Exact inventory: one verify, zero render (JSON list).
JSON_TMP="$(mktemp)"
set +e
fly_staging_provider_fly machine list -a "${HEADLESS_FLY_STAGING_APP_NAME}" --json >"${JSON_TMP}" 2>"${JSON_TMP}.err"
LIST_RC=$?
set -e
if [ "${LIST_RC}" -ne 0 ]; then
  rm -f "${JSON_TMP}" "${JSON_TMP}.err"
  fly_staging_die "fail_class=machine_list_provider_error"
fi

# Local node parse — no secret values; process group metadata only.
node -e '
const fs = require("fs");
const path = process.argv[1];
let rows;
try { rows = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { console.error("fail_class=malformed_machine_list"); process.exit(1); }
if (!Array.isArray(rows)) {
  console.error("fail_class=malformed_machine_list");
  process.exit(1);
}
let verify = 0, render = 0, other = 0;
for (const row of rows) {
  const id = row && row.id;
  if (typeof id !== "string" || !/^[a-z0-9]{8,}$/i.test(id)) {
    console.error("fail_class=malformed_machine_list");
    process.exit(1);
  }
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const g = meta.fly_process_group;
  if (g === "verify") verify += 1;
  else if (g === "render") render += 1;
  else other += 1;
}
if (verify !== 1 || render !== 0 || other !== 0 || rows.length !== 1) {
  console.error("fail_class=verify_first_inventory_mismatch verify=" + verify + " render=" + render + " other=" + other);
  process.exit(1);
}
console.log("verify_count=1 render_count=0");
' "${JSON_TMP}"
rm -f "${JSON_TMP}" "${JSON_TMP}.err"

# Phase 2E.2D.6E — staged/partial exact-nine requires exactly one secrets deploy
# before runtime readiness; never infer from Machine creation or local preflight.
fly_staging_verify_first_activate_staged_secrets "${MATERIALIZED}"

# Optional post-first-Machine diagnostic only (2E.2D.5E). Absence, failure,
# or unexpected formatting must never invalidate verify-first success.
# Remote region observation comes from Machine inventory/status, not config show.
set +e
fly_staging_provider_fly config show -a "${HEADLESS_FLY_STAGING_APP_NAME}" >/dev/null 2>&1 || true
set -e

printf 'gate=verify_scale_up result=PASS model=verify_only_first_deploy_from_immutable_image verify=1 render=0 region_observation=from_verify_machine_inventory secrets_deployed=required\n'
