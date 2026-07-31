#!/bin/sh
# Build-only push for the schema-008 rollback bridge on an existing verify=1/render=1 app.
# Does NOT deploy to Machines, restart, scale, migrate, or mutate secrets/routes.
# Does NOT use the zero-Machine first-deploy image-deploy script.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_BRIDGE_BUILD_ONLY bridge_build_only
fly_staging_require_app_name

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-topology-before.XXXXXX")"
TOPOLOGY_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-topology-after.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-machines-before.XXXXXX")"
MACHINE_JSON_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-machines-after.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-release-before.XXXXXX")"
RELEASE_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-release-after.XXXXXX")"
MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.bridge-build-only.materialized.toml"
DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-bridge-build-only.XXXXXX")"

cleanup() {
  rm -f "${TOPOLOGY_BEFORE}" "${TOPOLOGY_AFTER}" \
    "${MACHINE_JSON_BEFORE}" "${MACHINE_JSON_AFTER}" \
    "${RELEASE_BEFORE}" "${RELEASE_AFTER}" \
    "${MATERIALIZED}" "${DEPLOY_LOG}"
}
trap cleanup EXIT

fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}"
cat "${TOPOLOGY_BEFORE}"

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-build-materialize-cli.ts" \
  write "${MATERIALIZED}" "${HEADLESS_FLY_STAGING_APP_NAME}"
fly_staging_assert_no_public_services_text "${MATERIALIZED}"

if [ "${HEADLESS_FLY_STAGING_BRIDGE_BUILD_ONLY_ATTEMPTED:-0}" = "1" ]; then
  fly_staging_die "fail_class=second_forward_build_attempt_forbidden"
fi
export HEADLESS_FLY_STAGING_BRIDGE_BUILD_ONLY_ATTEMPTED=1

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
  fly_staging_die "fail_class=bridge_build_only_push_failed"
fi
printf '%s\n' "${PUSH_CLASS}"

MANIFEST_DIGEST="$(printf '%s\n' "${PUSH_CLASS}" | sed -n 's/.*manifest_sha256=\([a-f0-9]\{64\}\).*/\1/p')"
if [ -z "${MANIFEST_DIGEST}" ]; then
  fly_staging_die "fail_class=manifest_digest_missing"
fi
case "${MANIFEST_DIGEST}" in
  [a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]*) ;;
  *) fly_staging_die "fail_class=manifest_digest_malformed" ;;
esac
if [ "${MANIFEST_DIGEST}" = "0000000000000000000000000000000000000000000000000000000000000000" ]; then
  fly_staging_die "fail_class=placeholder_digest_forbidden"
fi
if [ "${MANIFEST_DIGEST}" = "d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68" ]; then
  fly_staging_die "fail_class=bridge_digest_matches_deployed_2g24"
fi

IMAGE_REF="registry.fly.io/${HEADLESS_FLY_STAGING_APP_NAME}@sha256:${MANIFEST_DIGEST}"
printf 'bridge_image_ref=%s\n' "${IMAGE_REF}"
ARCH="$(grep -Eo 'linux/[a-z0-9_+-]+' "${DEPLOY_LOG}" | tail -1 || true)"
if [ -n "${ARCH}" ]; then
  printf 'bridge_image_arch=%s\n' "${ARCH}"
fi
SIZE_LINE="$(grep -Ei 'image size|exporting layers' "${DEPLOY_LOG}" | tail -1 || true)"
if [ -n "${SIZE_LINE}" ]; then
  printf 'bridge_image_size_hint=%s\n' "${SIZE_LINE}"
fi

if [ "${DEPLOY_RC}" -ne 0 ]; then
  if ! printf '%s' "${PUSH_CLASS}" | grep -q 'noise=tolerated'; then
    fly_staging_die "fail_class=bridge_build_only_push_failed"
  fi
  printf 'fly_cli_post_push_noise=tolerated\n'
fi

fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_AFTER}" "${MACHINE_JSON_AFTER}" "${RELEASE_AFTER}"
fly_staging_assert_dual_consumer_topology_unchanged \
  "${MACHINE_JSON_BEFORE}" \
  "${MACHINE_JSON_AFTER}" \
  "${RELEASE_BEFORE}" \
  "${RELEASE_AFTER}"
cat "${TOPOLOGY_AFTER}"

printf 'gate=bridge_build_only result=PASS manifest_sha256=%s mechanism=build_only_push_existing_topology\n' "${MANIFEST_DIGEST}"
