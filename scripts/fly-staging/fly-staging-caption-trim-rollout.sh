#!/bin/sh
# Caption/trim parity Machine rollout. Unusable until the candidate digest is sealed.
# Prompt 3A must not execute this script.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${FLY_STAGING_COMMON_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

export FLY_STAGING_COMMON_DIR
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local

EXPECTED_APP="shortforge-hw-staging-4def8fa0"
EXPECTED_VERIFY_MACHINE="d895d12a240938"
EXPECTED_RENDER_MACHINE="d895d16f264918"
ROLLBACK_DIGEST="b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe"
PLACEHOLDER_DIGEST="0000000000000000000000000000000000000000000000000000000000000000"
EXPECTED_BUILD_ID="headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity"

export HEADLESS_FLY_STAGING_APP_NAME="${HEADLESS_FLY_STAGING_APP_NAME:-${EXPECTED_APP}}"
if [ "${HEADLESS_FLY_STAGING_APP_NAME}" != "${EXPECTED_APP}" ]; then
  fly_staging_die "fail_class=wrong_app"
fi
fly_staging_require_app_name

ORG="${HEADLESS_FLY_STAGING_ORG:-personal}"
REGION="${HEADLESS_FLY_STAGING_PRIMARY_REGION:-iad}"
if [ "${ORG}" != "personal" ] || [ "${REGION}" != "iad" ]; then
  fly_staging_die "fail_class=wrong_org_or_region"
fi

SEALED="$(npx tsx -e "import { isHeadlessFlyStagingCaptionTrimCandidateSealed, HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST } from './src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-caption-trim-parity-authority.ts'; console.log(isHeadlessFlyStagingCaptionTrimCandidateSealed() ? HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST : '')")"
if [ -z "${SEALED}" ] || [ "${SEALED}" = "${PLACEHOLDER_DIGEST}" ]; then
  fly_staging_die "fail_class=caption_trim_candidate_not_sealed"
fi
if [ "${SEALED}" = "${ROLLBACK_DIGEST}" ]; then
  fly_staging_die "fail_class=deployed_digest_forbidden"
fi

ACTION="${1:-}"
case "${ACTION}" in
  forward)
    fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLOUT caption_trim_rollout
    TARGET_DIGEST="${SEALED}"
    TARGET_KIND="forward"
    ;;
  rollback)
    fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLBACK caption_trim_rollback
    TARGET_DIGEST="${ROLLBACK_DIGEST}"
    TARGET_KIND="rollback"
    ;;
  certify)
    fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_CERTIFY caption_trim_certify
    TARGET_DIGEST="${SEALED}"
    TARGET_KIND="forward"
    ;;
  *)
    fly_staging_die "fail_class=hostile_input"
    ;;
esac

npx tsx -e '
import { classifyHeadlessFlyStagingCaptionTrimRolloutGate, isHeadlessFlyStagingCaptionTrimCandidateSealed } from "./src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-caption-trim-parity-authority.ts";
const classified = classifyHeadlessFlyStagingCaptionTrimRolloutGate({
  sealed: isHeadlessFlyStagingCaptionTrimCandidateSealed(),
  digest: process.argv[1],
  kind: process.argv[2] === "rollback" ? "rollback" : "forward",
});
if (!classified.ok) process.exit(1);
' "${TARGET_DIGEST}" "${TARGET_KIND}" || fly_staging_die "fail_class=caption_trim_rollout_digest_refused"

MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.caption-trim-rollout.materialized.toml"
MACHINE_JSON="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-rollout-machines.XXXXXX")"
TOPOLOGY_PROOF="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-rollout-topology.XXXXXX")"
RELEASE_PROOF="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-rollout-release.XXXXXX")"
DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-rollout-deploy.XXXXXX")"

cleanup() {
  rm -f "${MATERIALIZED}" "${MACHINE_JSON}" "${MACHINE_JSON}.err" \
    "${TOPOLOGY_PROOF}" "${RELEASE_PROOF}" "${RELEASE_PROOF}.err" "${DEPLOY_LOG}"
}
trap cleanup EXIT

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-caption-trim-build-materialize-cli.ts" \
  write "${MATERIALIZED}" "${EXPECTED_APP}"
fly_staging_assert_no_public_services_text "${MATERIALIZED}"
if ! grep -q "${EXPECTED_BUILD_ID}" "${MATERIALIZED}"; then
  fly_staging_die "fail_class=wrong_renderer_build_id"
fi

require_idle_pair() {
  fly_staging_provider_fly machine list -a "${EXPECTED_APP}" --json >"${MACHINE_JSON}"
  node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3] };
let verify = 0, render = 0, other = 0;
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (row.id !== expected.verify && group === "verify") process.exit(1);
  if (row.id !== expected.render && group === "render") process.exit(1);
  if (row.region !== "iad") process.exit(2);
  if (row.state !== "stopped" && row.state !== "created") process.exit(6);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
console.log("idle_topology=PASS verify=" + expected.verify + " render=" + expected.render);
' "${MACHINE_JSON}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" \
    || fly_staging_die "fail_class=machines_not_idle_or_wrong_topology"
}

accept_topology_digest() {
  _expected_digest="$1"
  fly_staging_provider_fly machine list -a "${EXPECTED_APP}" --json >"${MACHINE_JSON}"
  node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = { verify: process.argv[2], render: process.argv[3], digest: process.argv[4] };
let verify = 0, render = 0, other = 0;
const digest = (m) => {
  const img = (m.config && m.config.image) || (m.image_ref && m.image_ref.digest) || "";
  const match = /sha256:([a-f0-9]{64})/i.exec(typeof img === "string" ? img : "");
  return match ? match[1].toLowerCase() : "";
};
const digests = [];
for (const row of rows) {
  const meta = (row.config && row.config.metadata) || row.metadata || {};
  const group = meta.fly_process_group;
  if (group === "verify") verify += 1;
  else if (group === "render") render += 1;
  else other += 1;
  if (row.id !== expected.verify && group === "verify") process.exit(1);
  if (row.id !== expected.render && group === "render") process.exit(1);
  if (row.region !== "iad") process.exit(2);
  const d = digest(row);
  if (!d) process.exit(3);
  digests.push(d);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
console.log("topology_digest=PASS unified_digest=" + digests[0]);
' "${MACHINE_JSON}" "${EXPECTED_VERIFY_MACHINE}" "${EXPECTED_RENDER_MACHINE}" "${_expected_digest}" \
    || return 1
}

rollback_to_phase2g25() {
  if [ "${HEADLESS_FLY_STAGING_CAPTION_TRIM_ROLLBACK_ATTEMPTED:-0}" = "1" ]; then
    fly_staging_die "fail_class=rollback_already_attempted"
  fi
  export HEADLESS_FLY_STAGING_CAPTION_TRIM_ROLLBACK_ATTEMPTED=1
  fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLBACK caption_trim_rollback
  printf 'phase=rollback_phase2g25\n'
  ROLLBACK_IMAGE_REF="registry.fly.io/${EXPECTED_APP}@sha256:${ROLLBACK_DIGEST}"
  fly_staging_provider_fly deploy \
    --config "${MATERIALIZED}" \
    --app "${EXPECTED_APP}" \
    --primary-region "${REGION}" \
    --image "${ROLLBACK_IMAGE_REF}" \
    --strategy rolling \
    --yes
  accept_topology_digest "${ROLLBACK_DIGEST}" || fly_staging_die "fail_class=rollback_topology_unconfirmed"
}

require_idle_pair
fly_staging_capture_dual_consumer_topology_proof "${TOPOLOGY_PROOF}" "${MACHINE_JSON}" "${RELEASE_PROOF}"
cat "${TOPOLOGY_PROOF}"

if [ "${ACTION}" = "rollback" ]; then
  rollback_to_phase2g25
  printf 'gate=caption_trim_rollback result=PASS digest=%s\n' "${ROLLBACK_DIGEST}"
  exit 0
fi

if [ "${HEADLESS_FLY_STAGING_CAPTION_TRIM_FORWARD_ATTEMPTED:-0}" = "1" ]; then
  fly_staging_die "fail_class=second_forward_attempt_forbidden"
fi
export HEADLESS_FLY_STAGING_CAPTION_TRIM_FORWARD_ATTEMPTED=1

FORWARD_IMAGE_REF="registry.fly.io/${EXPECTED_APP}@sha256:${SEALED}"
printf 'phase=forward_deploy image=%s\n' "${FORWARD_IMAGE_REF}"
set +e
fly_staging_provider_fly deploy \
  --config "${MATERIALIZED}" \
  --app "${EXPECTED_APP}" \
  --primary-region "${REGION}" \
  --image "${FORWARD_IMAGE_REF}" \
  --strategy rolling \
  --yes \
  >"${DEPLOY_LOG}" 2>&1
FORWARD_RC=$?
set -e
sed -E 's/(DATABASE_URL|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|UPSTASH_REDIS_TCP_URL|FLY_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)[=:][^[:space:]]+/\1=REDACTED/g' "${DEPLOY_LOG}"

if [ "${FORWARD_RC}" -ne 0 ]; then
  rollback_to_phase2g25
  fly_staging_die "fail_class=forward_acceptance_failed rollback=confirmed"
fi
accept_topology_digest "${SEALED}" || {
  rollback_to_phase2g25
  fly_staging_die "fail_class=forward_topology_unconfirmed rollback=confirmed"
}

if ! grep -q "${EXPECTED_BUILD_ID}" "${MATERIALIZED}"; then
  rollback_to_phase2g25
  fly_staging_die "fail_class=wrong_renderer_build_id rollback=confirmed"
fi

if [ "${ACTION}" = "certify" ]; then
  export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=verify
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-preflight-cli.ts" \
    || { rollback_to_phase2g25; fly_staging_die "fail_class=verify_preflight_failed rollback=confirmed"; }
  export HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE=render
  npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-cleanup-runtime-rollout-preflight-cli.ts" \
    || { rollback_to_phase2g25; fly_staging_die "fail_class=render_preflight_failed rollback=confirmed"; }
fi

printf 'gate=caption_trim_rollout result=PASS digest=%s renderer_build_id=%s secrets_preserved=PASS production_untouched=PASS\n' \
  "${SEALED}" "${EXPECTED_BUILD_ID}"
