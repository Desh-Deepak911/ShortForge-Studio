# Sprint 11E Phase 2E.2D.5A — Corrected Fly staging zero-consumer release

**Status:** FAIL  
**Fail class:** `image_deploy_failed` (Fly resolved Dockerfile relative to `.tmp/` config path)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T07:21:03Z`  
**End (UTC):** `2026-07-22T07:22:22Z`  

## Prior FAIL archive (byte-for-byte)

| Item | Value |
|------|--------|
| Archive path | `docs/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.pre-2e2d5a-FAIL.md` |
| SHA-256 | `a1b544db644040ee7fe709b2391ee85cea5ed17e4d2fa0405d86e20c70a43cf1` |
| Prior fail class | `secret_name_missing` (local parser vs Fly `* NAME` staged list) |

## Authorization scope

| Item | Value |
|------|--------|
| App name | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Region | `iad` |
| Verify / render scale-up | NOT AUTHORIZED / NOT RUN |
| Hosted consumers / render / 4K / routes | NOT AUTHORIZED / NOT RUN |
| `.env.local` / commit / push | NOT DONE |
| Retry after this failure | NOT PERFORMED |

## Matcher correction (pre-provider)

| Check | Result |
|------|--------|
| Accepts `* NAME` staged rows | PASS |
| Accepts unmarked `NAME` | PASS |
| Tolerates Fly headers / columns / “not deployed” notice | PASS |
| Requires exact nine names | PASS |
| Rejects missing / duplicate / unknown / forbidden | PASS |
| Never inspects secret values | PASS |
| `test:headless-fly-staging-deployment-authority-2e2d4` | PASS (12) |

## Accepted input hashes (reconfirmed)

| Artifact | SHA-256 | Result |
|----------|---------|--------|
| 2E.2D.3 sandbox evidence | `083e3d27cac72a1537a15dc2189a321deb54b6efc1d8c668345595dbbdfc3d17` | MATCH |
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` | MATCH |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` | MATCH |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` | MATCH |
| Dockerfile | `13c36f2c18c43cf70b144b2bf42f0088f54b68c4a8a1e67e32b1eade36c59b3a` | MATCH |

## Bridge verification

| Check | Result |
|------|--------|
| Path / mode `0600` | PASS |
| Exact nine non-empty keys | PASS |
| No forbidden / `.env.local` / duplicates | PASS |
| Deleted on EXIT | PASS |

## Local classification + schema preflight

| Check | Result |
|------|--------|
| Neon / R2 / Upstash TCP / hosted | all `configured` |
| Schema preflight | **PASS** |
| Migration IDs | `000`, `001`, `002`, `004`, `005`, `006` |
| Checksum prefixes | `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451` |
| Migrations / DDL | NOT RUN |

## Fly release steps

| Step | Result |
|------|--------|
| App create | **PASS** |
| Zero Machines after create | PASS |
| Public services | none |
| Secrets install | **PASS** |
| Corrected secret-name matcher on live `fly secrets list` | **PASS** (nine names, Staged) |
| Zero Machines after secrets | PASS |
| Image build/push | **FAIL** — config under `.tmp/` made Fly look for Dockerfile at `.tmp/deploy/headless-worker/Dockerfile` |
| Safe image digest | NOT CAPTURED |
| Final verify/render / Machine counts | NOT REACHED (Machines remained 0 until teardown) |

## Failure handling

| Action | Result |
|------|--------|
| Best-effort rollback | best_effort (no Machines) |
| Independent zero-Machine proof | PASS |
| Teardown `shortforge-hw-staging-4def8fa0` only | **PASS** (app absent verified) |
| Retry | NOT PERFORMED |

## Post-failure hygiene (local only)

`scripts/fly-staging/fly-staging-image-deploy.sh` (and rollback) now materialize `fly.staging.materialized.toml` at **repository root** so dockerfile paths resolve against the build context. Authority suite asserts `.tmp/` materialization is rejected. No second provider attempt in this phase.

## Eligibility verdict

**Not eligible** for a separately authorized `verify=1` scale-up.

The secret-name false-fail is cleared, but the corrected zero-consumer release did not complete image push; the staging app was torn down. Operator must supply a **new** 0600 bridge and explicitly re-authorize another zero-consumer release after the root-path materialization fix.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
