#!/bin/sh
# Build-only push for the 2G.25 cleanup-runtime worker on an existing verify=1/render=1 app.
# Does NOT deploy, restart, scale, migrate, enable maintenance, or mutate R2 lifecycle.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CLEANUP_RUNTIME_BUILD_ONLY cleanup_runtime_build_only
fly_staging_require_app_name

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

BRIDGE_DIGEST="7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206"
ROLLBACK_FORBIDDEN_DIGEST="d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68"
REJECTED_PART_A_DIGEST="9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60"
REJECTED_LIVE_FINALIZATION_DIGEST="e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916"

TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-topology-before.XXXXXX")"
TOPOLOGY_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-topology-after.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-machines-before.XXXXXX")"
MACHINE_JSON_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-machines-after.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-release-before.XXXXXX")"
RELEASE_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-release-after.XXXXXX")"
MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.cleanup-runtime-build-only.materialized.toml"
DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-build-only.XXXXXX")"

cleanup() {
  rm -f "${TOPOLOGY_BEFORE}" "${TOPOLOGY_AFTER}" \
    "${MACHINE_JSON_BEFORE}" "${MACHINE_JSON_AFTER}" \
    "${RELEASE_BEFORE}" "${RELEASE_AFTER}" \
    "${MATERIALIZED}" "${DEPLOY_LOG}"
}
trap cleanup EXIT

printf 'phase=read_only_preflight\n'
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-qa-master
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" validate-surfaces

WORKER_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-worker-bridge.XXXXXX")"
NEON_READ_BRIDGE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-cleanup-neon-read.XXXXXX")"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-worker-bridge "${WORKER_BRIDGE}"
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" materialize-neon-read-env "${NEON_READ_BRIDGE}"
export HEADLESS_FLY_STAGING_BRIDGE_FILE="${WORKER_BRIDGE}"
fly_staging_accept_bridge
fly_staging_load_bridge
fly_staging_apply_public_environment

fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_BEFORE}" "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}"
cat "${TOPOLOGY_BEFORE}"

node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3], digest: process.argv[4] };
let verify = 0, render = 0, other = 0;
const digest = (m) => {
  const img = m.config && m.config.image;
  if (typeof img === "string") {
    const match = /@sha256:([a-f0-9]{64})/i.exec(img);
    if (match) return match[1].toLowerCase();
  }
  return "";
};
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (row.id !== expected.verify && group === "verify") process.exit(1);
  if (row.id !== expected.render && group === "render") process.exit(1);
  if (row.region !== "iad") process.exit(2);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
const digests = rows.map(digest).filter(Boolean);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
console.log("topology_digest=PASS unified_digest=" + digests[0]);
' "${MACHINE_JSON_BEFORE}" "d895d12a240938" "d895d16f264918" "${BRIDGE_DIGEST}" \
  || fly_staging_die "fail_class=baseline_not_on_bridge_digest"

set -a
# shellcheck disable=SC1090
. "${NEON_READ_BRIDGE}"
set +a
npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-precontact-cli.ts" post-migrate \
  || fly_staging_die "fail_class=precontact_failed"

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-build-materialize-cli.ts" \
  write "${MATERIALIZED}" "${HEADLESS_FLY_STAGING_APP_NAME}"
fly_staging_assert_no_public_services_text "${MATERIALIZED}"

if [ "${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_ONLY_ATTEMPTED:-0}" = "1" ]; then
  fly_staging_die "fail_class=second_cleanup_build_attempt_forbidden"
fi
export HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_ONLY_ATTEMPTED=1

printf 'phase=build_only_push\n'
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
  fly_staging_die "fail_class=cleanup_runtime_build_only_push_failed"
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
if [ "${MANIFEST_DIGEST}" = "${BRIDGE_DIGEST}" ]; then
  fly_staging_die "fail_class=cleanup_digest_matches_deployed_bridge"
fi
if [ "${MANIFEST_DIGEST}" = "${ROLLBACK_FORBIDDEN_DIGEST}" ]; then
  fly_staging_die "fail_class=cleanup_digest_matches_forbidden_2g24"
fi
if [ "${MANIFEST_DIGEST}" = "${REJECTED_PART_A_DIGEST}" ]; then
  fly_staging_die "fail_class=cleanup_digest_matches_rejected_part_a"
fi
if [ "${MANIFEST_DIGEST}" = "${REJECTED_LIVE_FINALIZATION_DIGEST}" ]; then
  fly_staging_die "fail_class=cleanup_digest_matches_rejected_live_finalization"
fi

IMAGE_REF="registry.fly.io/${HEADLESS_FLY_STAGING_APP_NAME}@sha256:${MANIFEST_DIGEST}"
printf 'cleanup_runtime_image_ref=%s\n' "${IMAGE_REF}"
ARCH="$(grep -Eo 'linux/[a-z0-9_+-]+' "${DEPLOY_LOG}" | tail -1 || true)"
if [ -n "${ARCH}" ]; then
  printf 'cleanup_runtime_image_arch=%s\n' "${ARCH}"
fi
SIZE_LINE="$(grep -Ei 'image size|exporting layers' "${DEPLOY_LOG}" | tail -1 || true)"
if [ -n "${SIZE_LINE}" ]; then
  printf 'cleanup_runtime_image_size_hint=%s\n' "${SIZE_LINE}"
fi

if [ "${DEPLOY_RC}" -ne 0 ]; then
  if ! printf '%s' "${PUSH_CLASS}" | grep -q 'noise=tolerated'; then
    fly_staging_die "fail_class=cleanup_runtime_build_only_push_failed"
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

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-bridge-rollout-credential-cli.ts" \
  cleanup "${WORKER_BRIDGE}" "${NEON_READ_BRIDGE}" >/dev/null 2>&1 || true

printf 'gate=cleanup_runtime_build_only result=PASS manifest_sha256=%s mechanism=build_only_push_existing_topology\n' "${MANIFEST_DIGEST}"
