#!/bin/sh
# Gate: secret installation from 0600 bridge. Must not start consumers.
# Pre-first-deploy: exact Machine list only — no Launch scale metadata.
set -eu
FLY_STAGING_COMMON_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
. "${FLY_STAGING_COMMON_DIR}/fly-staging-common.sh"
trap fly_staging_bridge_cleanup EXIT INT TERM HUP
fly_staging_forbid_env_local
fly_staging_require_gate HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL secrets_install
fly_staging_require_app_name
fly_staging_load_bridge

# Precondition: zero Machines before any secret mutation.
fly_staging_assert_exact_zero_machines

# Import decoded values via stdin — never pipe the raw shell-source bridge file.
fly_staging_emit_decoded_secrets_import_stream \
  | fly secrets import -a "${HEADLESS_FLY_STAGING_APP_NAME}"

# Fail closed if any Machine appeared (secrets must not start consumers).
fly_staging_assert_exact_zero_machines

# Name-only membership (Staged or Deployed). Never print values.
LIST_FILE="$(mktemp)"
fly secrets list -a "${HEADLESS_FLY_STAGING_APP_NAME}" >"${LIST_FILE}" 2>/dev/null || true
fly_staging_assert_secret_names_present "${LIST_FILE}"
rm -f "${LIST_FILE}"

printf 'gate=secrets_install result=PASS secret_values=redacted secret_names=PASS consumers_started=false import_source=decoded_values\n'
