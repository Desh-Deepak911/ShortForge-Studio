#!/bin/sh
# Gate: pre-/post-first-deploy rollback via exact Machine destruction.
# Never requires Launch scale metadata. App preserve vs teardown is caller's gate.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
fly_staging_require_app_name

# Exact-list → destroy staging-app Machines → exact-list zero.
fly_staging_destroy_all_app_machines

PRIOR_LABEL="${HEADLESS_FLY_STAGING_PRIOR_IMAGE_LABEL:-}"
if [ -n "${PRIOR_LABEL}" ]; then
  # Re-register prior image without seeding Machines (build-only push).
  MATERIALIZED="${FOOTIEBITZ_ROOT}/fly.staging.materialized.toml"
  sed "s/REPLACE_WITH_STAGING_APP_NAME/${HEADLESS_FLY_STAGING_APP_NAME}/g" \
    "${FLY_STAGING_TEMPLATE}" > "${MATERIALIZED}"
  set +e
  fly deploy \
    --config "${MATERIALIZED}" \
    --app "${HEADLESS_FLY_STAGING_APP_NAME}" \
    --image-label "${PRIOR_LABEL}" \
    --remote-only \
    --build-only \
    --push \
    --yes \
    "${FOOTIEBITZ_ROOT}" >/tmp/fly-staging-rollback-deploy.log 2>&1
  DEPLOY_RC=$?
  set -e
  rm -f "${MATERIALIZED}"
  if [ "${DEPLOY_RC}" -ne 0 ]; then
    # Tolerate only proven push + zero-Machine CLI noise; otherwise fail closed.
    if [ -f /tmp/fly-staging-rollback-deploy.log ]; then
      set +e
      fly_staging_classify_image_push_log_file /tmp/fly-staging-rollback-deploy.log >/dev/null
      CLS_RC=$?
      set -e
      if [ "${CLS_RC}" -ne 0 ]; then
        rm -f /tmp/fly-staging-rollback-deploy.log
        fly_staging_die "fail_class=rollback_prior_image_failed"
      fi
      if ! grep -q 'No machines configured for this app' /tmp/fly-staging-rollback-deploy.log; then
        rm -f /tmp/fly-staging-rollback-deploy.log
        fly_staging_die "fail_class=rollback_prior_image_failed"
      fi
    else
      fly_staging_die "fail_class=rollback_prior_image_failed"
    fi
  fi
  rm -f /tmp/fly-staging-rollback-deploy.log
  fly_staging_assert_exact_zero_machines
  printf 'gate=rollback result=PASS machines_zeroed=PASS prior_image=PASS\n'
else
  printf 'gate=rollback result=PASS machines_zeroed=PASS prior_image=SKIPPED\n'
fi
