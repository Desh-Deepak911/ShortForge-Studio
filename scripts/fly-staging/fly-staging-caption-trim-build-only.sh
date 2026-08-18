#!/bin/sh
# Build-only push of the caption/trim parity candidate image.
# Never updates, starts, stops, scales, or destroys Machines.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${FLY_STAGING_COMMON_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

CAPTION_TRIM_MERGE="f6e2bbfb3af3ab86ac71aa5ef254a9e968357861"
EXPECTED_APP="shortforge-hw-staging-4def8fa0"
ROLLBACK_DIGEST="b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe"
PLACEHOLDER_DIGEST="0000000000000000000000000000000000000000000000000000000000000000"

if [ -n "$(git status --porcelain)" ]; then
  printf '%s\n' "fail_class=dirty_worktree" >&2
  exit 1
fi
if ! git merge-base --is-ancestor "${CAPTION_TRIM_MERGE}" HEAD; then
  printf '%s\n' "fail_class=wrong_ancestry" >&2
  exit 1
fi

printf 'phase=build_worker\n'
npm run build:headless-worker

export FLY_STAGING_COMMON_DIR
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_BUILD_ONLY caption_trim_build_only
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

npx tsx -e '
import { classifyHeadlessHostedWorkerEnvironment } from "./src/features/headless-renderer/worker/hosted/hosted-environment.ts";
import { HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID, HEADLESS_PHASE3_RENDERER_BUILD_ID, HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID } from "./src/features/headless-renderer/worker/runtime/renderer-build-id.ts";
const base = {
  HEADLESS_WORKER_MODE: "render",
  HEADLESS_ENV_NAME: "staging",
  DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "AKIABBBBBBBBBBBBBBBB",
  R2_SECRET_ACCESS_KEY: "secretvaluecccccccccccccccccccc",
  R2_BUCKET_ASSETS: "footie-assets-staging",
  R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
  R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
  HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
  UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
  HEADLESS_CHROME_PATH: "/usr/bin/chromium",
  HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
  HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
  HEADLESS_WORKER_CONCURRENCY: "1",
};
for (const id of [HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID, HEADLESS_PHASE3_RENDERER_BUILD_ID, HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID]) {
  const c = classifyHeadlessHostedWorkerEnvironment({ ...base, HEADLESS_RENDERER_BUILD_ID: id });
  if (c.status !== "configured") process.exit(1);
}
const unknown = classifyHeadlessHostedWorkerEnvironment({ ...base, HEADLESS_RENDERER_BUILD_ID: "unknown-build" });
if (unknown.reasonId !== "invalid_renderer_build_id") process.exit(2);
console.log("build_id_acceptance=PASS");
'

npx tsx -e '
import { readFileSync } from "node:fs";
import { classifyHeadlessFlyStagingCaptionTrimPageBundle } from "./src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-caption-trim-parity-authority.ts";
const source = readFileSync("dist/headless-worker/page-render.iife.js", "utf8");
const classified = classifyHeadlessFlyStagingCaptionTrimPageBundle(source);
if (!classified.ok) process.exit(1);
console.log("page_bundle_capabilities=PASS");
'

MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.caption-trim-build-only.materialized.toml"
TOPOLOGY_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-topology-before.XXXXXX")"
TOPOLOGY_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-topology-after.XXXXXX")"
MACHINE_JSON_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-machines-before.XXXXXX")"
MACHINE_JSON_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-machines-after.XXXXXX")"
RELEASE_BEFORE="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-release-before.XXXXXX")"
RELEASE_AFTER="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-release-after.XXXXXX")"
DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/fly-staging-caption-trim-build-only.XXXXXX")"

cleanup() {
  rm -f "${MATERIALIZED}" "${TOPOLOGY_BEFORE}" "${TOPOLOGY_AFTER}" \
    "${MACHINE_JSON_BEFORE}" "${MACHINE_JSON_AFTER}" \
    "${RELEASE_BEFORE}" "${RELEASE_AFTER}" "${DEPLOY_LOG}" \
    "${MACHINE_JSON_BEFORE}.err" "${MACHINE_JSON_AFTER}.err" \
    "${RELEASE_BEFORE}.err" "${RELEASE_AFTER}.err"
}
trap cleanup EXIT

npx tsx "${FLY_STAGING_COMMON_DIR}/fly-staging-caption-trim-build-materialize-cli.ts" \
  write "${MATERIALIZED}" "${EXPECTED_APP}"
fly_staging_assert_no_public_services_text "${MATERIALIZED}"
if ! grep -q 'headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity' "${MATERIALIZED}"; then
  fly_staging_die "fail_class=wrong_renderer_build_id"
fi

printf 'phase=read_only_preflight\n'
# Historical dual-consumer capture requires started Machines. This release
# must keep the pair stopped, so capture idle topology locally.
set +e
fly_staging_provider_fly machine list -a "${EXPECTED_APP}" --json >"${MACHINE_JSON_BEFORE}" 2>"${MACHINE_JSON_BEFORE}.err"
_list_rc=$?
fly_staging_provider_fly releases -a "${EXPECTED_APP}" --json >"${RELEASE_BEFORE}" 2>"${RELEASE_BEFORE}.err"
_release_rc=$?
set -e
if [ "${_list_rc}" -ne 0 ] || [ "${_release_rc}" -ne 0 ]; then
  fly_staging_die "fail_class=topology_provider_error"
fi

node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const releases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const expected = { verify: process.argv[3], render: process.argv[4], digest: process.argv[5] };
let verify = 0, render = 0, other = 0;
const ids = [];
const digest = (m) => {
  const ref = m.image_ref && m.image_ref.digest;
  if (typeof ref === "string") {
    const match = /sha256:([a-f0-9]{64})/i.exec(ref);
    if (match) return match[1].toLowerCase();
  }
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
  if (row.state !== "stopped" && row.state !== "created") process.exit(6);
  ids.push(row.id);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
const digests = rows.map(digest).filter(Boolean);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
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
  "machine_state=stopped",
  "active_release=" + String(activeVersion),
];
fs.writeFileSync(process.argv[6], lines.join("\n") + "\n");
console.log("topology_digest=PASS unified_digest=" + digests[0] + " state=stopped");
' "${MACHINE_JSON_BEFORE}" "${RELEASE_BEFORE}" "d895d12a240938" "d895d16f264918" "${ROLLBACK_DIGEST}" "${TOPOLOGY_BEFORE}" \
  || fly_staging_die "fail_class=baseline_not_on_rollback_digest"
cat "${TOPOLOGY_BEFORE}"

if [ "${HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_ATTEMPTED:-0}" = "1" ]; then
  fly_staging_die "fail_class=second_caption_trim_build_attempt_forbidden"
fi
export HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_ATTEMPTED=1

printf 'phase=build_only_push\n'
set +e
fly deploy \
  --config "${MATERIALIZED}" \
  --app "${EXPECTED_APP}" \
  --primary-region "${REGION}" \
  --remote-only \
  --build-only \
  --push \
  --yes \
  "${FOOTIEBITZ_ROOT}" >"${DEPLOY_LOG}" 2>&1
DEPLOY_RC=$?
set -e
# Never print credential-shaped assignments from the deploy log.
sed -E 's/(DATABASE_URL|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|UPSTASH_REDIS_TCP_URL|FLY_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)[=:][^[:space:]]+/\1=REDACTED/g' "${DEPLOY_LOG}"

set +e
PUSH_CLASS="$(fly_staging_classify_image_push_log_file "${DEPLOY_LOG}")"
PUSH_RC=$?
set -e
if [ "${PUSH_RC}" -ne 0 ]; then
  fly_staging_die "fail_class=caption_trim_build_only_push_failed"
fi
printf '%s\n' "${PUSH_CLASS}"

MANIFEST_DIGEST="$(printf '%s\n' "${PUSH_CLASS}" | sed -n 's/.*manifest_sha256=\([a-f0-9]\{64\}\).*/\1/p')"
if [ -z "${MANIFEST_DIGEST}" ]; then
  fly_staging_die "fail_class=manifest_digest_missing"
fi
if [ "${MANIFEST_DIGEST}" = "${PLACEHOLDER_DIGEST}" ]; then
  fly_staging_die "fail_class=placeholder_digest_forbidden"
fi
if [ "${MANIFEST_DIGEST}" = "${ROLLBACK_DIGEST}" ]; then
  fly_staging_die "fail_class=deployed_digest_forbidden"
fi
case "${MANIFEST_DIGEST}" in
  9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60|\
  e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916|\
  41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde|\
  7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206|\
  d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68)
    fly_staging_die "fail_class=rejected_digest"
    ;;
esac

printf 'caption_trim_image_ref=registry.fly.io/%s@sha256:%s\n' "${EXPECTED_APP}" "${MANIFEST_DIGEST}"
ARCH="$(grep -Eo 'linux/[a-z0-9_+-]+' "${DEPLOY_LOG}" | tail -1 || true)"
if [ -n "${ARCH}" ]; then
  printf 'caption_trim_image_arch=%s\n' "${ARCH}"
fi

if [ "${DEPLOY_RC}" -ne 0 ]; then
  if ! printf '%s' "${PUSH_CLASS}" | grep -q 'noise=tolerated'; then
    fly_staging_die "fail_class=caption_trim_build_only_push_failed"
  fi
  printf 'fly_cli_post_push_noise=tolerated\n'
fi

set +e
fly_staging_provider_fly machine list -a "${EXPECTED_APP}" --json >"${MACHINE_JSON_AFTER}" 2>"${MACHINE_JSON_AFTER}.err"
_list_after_rc=$?
fly_staging_provider_fly releases -a "${EXPECTED_APP}" --json >"${RELEASE_AFTER}" 2>"${RELEASE_AFTER}.err"
_release_after_rc=$?
set -e
if [ "${_list_after_rc}" -ne 0 ] || [ "${_release_after_rc}" -ne 0 ]; then
  fly_staging_die "fail_class=topology_provider_error"
fi
node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const releases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const expected = { verify: process.argv[3], render: process.argv[4], digest: process.argv[5] };
let verify = 0, render = 0, other = 0;
const ids = [];
const digest = (m) => {
  const ref = m.image_ref && m.image_ref.digest;
  if (typeof ref === "string") {
    const match = /sha256:([a-f0-9]{64})/i.exec(ref);
    if (match) return match[1].toLowerCase();
  }
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
  if (row.state !== "stopped" && row.state !== "created") process.exit(6);
  ids.push(row.id);
}
if (verify !== 1 || render !== 1 || other !== 0) process.exit(4);
const digests = rows.map(digest).filter(Boolean);
if (new Set(digests).size !== 1 || digests[0] !== expected.digest) process.exit(5);
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
  "machine_state=stopped",
  "active_release=" + String(activeVersion),
];
fs.writeFileSync(process.argv[6], lines.join("\n") + "\n");
console.log("topology_after=PASS unified_digest=" + digests[0] + " state=stopped");
' "${MACHINE_JSON_AFTER}" "${RELEASE_AFTER}" "d895d12a240938" "d895d16f264918" "${ROLLBACK_DIGEST}" "${TOPOLOGY_AFTER}" \
  || fly_staging_die "fail_class=topology_mutated_after_build_only"
fly_staging_assert_dual_consumer_topology_unchanged \
  "${MACHINE_JSON_BEFORE}" \
  "${MACHINE_JSON_AFTER}" \
  "${RELEASE_BEFORE}" \
  "${RELEASE_AFTER}"
cat "${TOPOLOGY_AFTER}"

printf 'gate=caption_trim_build_only result=PASS manifest_sha256=%s mechanism=build_only_push_existing_topology machines_untouched=PASS\n' "${MANIFEST_DIGEST}"
