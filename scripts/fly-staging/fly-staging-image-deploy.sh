#!/bin/sh
# Gate: build-only image push with exact zero Machine authority.
# Mechanism: build_only_release_then_exact_zero_machine_authority
# Pre-first-deploy: do NOT call Launch scale metadata commands.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_IMAGE_DEPLOY image_deploy
fly_staging_require_app_name

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

# Materialize at repo root so dockerfile paths resolve against the build context.
MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.materialized.toml"
sed "s/REPLACE_WITH_STAGING_APP_NAME/${HEADLESS_FLY_STAGING_APP_NAME}/g" \
  "${FLY_STAGING_TEMPLATE}" > "${MATERIALIZED}"

cleanup_materialized() {
  rm -f "${MATERIALIZED}"
}
trap cleanup_materialized EXIT

fly_staging_assert_no_public_services_text "${MATERIALIZED}"

DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-image-deploy.XXXXXX")"
set +e
fly deploy \
  --config "${MATERIALIZED}" \
  --app "${HEADLESS_FLY_STAGING_APP_NAME}" \
  --primary-region "${REGION}" \
  --remote-only \
  --build-only \
  --push \
  --yes \
  "${FOOTIEBITZ_ROOT}" >"${DEPLOY_LOG}" 2>&1
DEPLOY_RC=$?
set -e
cat "${DEPLOY_LOG}"

set +e
PUSH_CLASS="$(fly_staging_classify_image_push_log_file "${DEPLOY_LOG}")"
PUSH_RC=$?
set -e
if [ "${PUSH_RC}" -ne 0 ]; then
  rm -f "${DEPLOY_LOG}"
  fly_staging_die "fail_class=image_deploy_failed"
fi
printf '%s\n' "${PUSH_CLASS}"

if [ "${DEPLOY_RC}" -ne 0 ]; then
  if ! printf '%s' "${PUSH_CLASS}" | grep -q 'noise=tolerated'; then
    rm -f "${DEPLOY_LOG}"
    fly_staging_die "fail_class=image_deploy_failed"
  fi
  printf 'fly_cli_post_push_zero_machine_noise=tolerated\n'
fi
rm -f "${DEPLOY_LOG}"

# Exact Machine list authority — provider error / malformed ≠ zero.
# Public-service / region authority is local materialized config only
# (Phase 2E.2D.5E). Do not call remote config-show observers pre-first-Machine.
fly_staging_assert_exact_zero_machines

printf 'gate=image_deploy result=PASS zero_consumer=PASS mechanism=build_only_release_then_exact_zero_machine_authority region_authority=configured_local_not_remotely_observed\n'
