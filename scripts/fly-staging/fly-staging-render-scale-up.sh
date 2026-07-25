#!/bin/sh
# Gate: later render activation (separately authorized).
# Requires exactly one verify Machine already present; must not run at verify-first boundary.
# Uses full topology template + immutable image — not Launch scale count from zero.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP render_scale_up
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

# Boundary: verify must already be exactly one; render must be zero.
JSON_TMP="$(mktemp)"
set +e
fly machine list -a "${HEADLESS_FLY_STAGING_APP_NAME}" --json >"${JSON_TMP}" 2>"${JSON_TMP}.err"
LIST_RC=$?
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
if (!Array.isArray(rows)) {
  console.error("fail_class=malformed_machine_list");
  process.exit(1);
}
let verify = 0, render = 0, other = 0;
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const g = meta.fly_process_group;
  if (g === "verify") verify += 1;
  else if (g === "render") render += 1;
  else other += 1;
}
if (verify !== 1 || render !== 0 || other !== 0) {
  console.error("fail_class=verify_required_before_render verify=" + verify + " render=" + render);
  process.exit(1);
}
console.log("pre_render_boundary=PASS verify=1 render=0");
' "${JSON_TMP}"
rm -f "${JSON_TMP}" "${JSON_TMP}.err"

MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.materialized.toml"
sed "s/REPLACE_WITH_STAGING_APP_NAME/${HEADLESS_FLY_STAGING_APP_NAME}/g" \
  "${FLY_STAGING_TEMPLATE}" > "${MATERIALIZED}"

cleanup_materialized() {
  rm -f "${MATERIALIZED}"
}
trap cleanup_materialized EXIT

fly_staging_assert_no_public_services_text "${MATERIALIZED}"

# Separately reviewed transition: introduce render via full topology + same image.
fly deploy \
  --config "${MATERIALIZED}" \
  --app "${HEADLESS_FLY_STAGING_APP_NAME}" \
  --primary-region "${REGION}" \
  --image "${IMAGE_REF}" \
  --ha=false \
  --yes

JSON_TMP2="$(mktemp)"
set +e
fly machine list -a "${HEADLESS_FLY_STAGING_APP_NAME}" --json >"${JSON_TMP2}" 2>"${JSON_TMP2}.err"
LIST_RC2=$?
set -e
if [ "${LIST_RC2}" -ne 0 ]; then
  rm -f "${JSON_TMP2}" "${JSON_TMP2}.err"
  fly_staging_die "fail_class=machine_list_provider_error"
fi

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
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const g = meta.fly_process_group;
  if (g === "verify") verify += 1;
  else if (g === "render") render += 1;
  else other += 1;
}
if (verify !== 1 || render !== 1 || other !== 0) {
  console.error("fail_class=render_activation_inventory_mismatch verify=" + verify + " render=" + render);
  process.exit(1);
}
console.log("verify_count=1 render_count=1");
' "${JSON_TMP2}"
rm -f "${JSON_TMP2}" "${JSON_TMP2}.err"

printf 'gate=render_scale_up result=PASS verify=1 render=1 transition=full_topology_immutable_image\n'
