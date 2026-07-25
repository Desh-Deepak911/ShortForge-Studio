#!/bin/sh
# Gate: complete staging teardown — exact Machine destruction then app destroy.
# Does not depend on Fly Launch scale metadata.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_TEARDOWN teardown
fly_staging_require_app_name

# Safety: only destroy apps under the staging prefix.
case "${HEADLESS_FLY_STAGING_APP_NAME}" in
  shortforge-hw-staging-*)
    ;;
  *)
    fly_staging_die "fail_class=teardown_prefix_rejected"
    ;;
esac

fly_staging_destroy_all_app_machines
fly apps destroy "${HEADLESS_FLY_STAGING_APP_NAME}" -y
printf 'gate=teardown result=PASS app_destroyed=PASS machines_zeroed=PASS\n'
