#!/bin/sh
# Gate: render-only rollback — destroys render Machines, preserves verify=1.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK rollback
fly_staging_require_app_name

fly_staging_orchestrator_rollback_render_only
printf 'gate=render_rollback result=PASS verify_preserved=1 render=0\n'
