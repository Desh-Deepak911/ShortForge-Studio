# Sprint 11E Phase 2E.2D.5B — Repository-root corrected Fly staging zero-consumer release

**Status:** FAIL  
**Fail class:** `image_deploy_failed` (Fly CLI post-push zero-Machine config sync after successful remote build/push)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T08:16:23Z`  
**End (UTC):** `2026-07-22T08:18:03Z`  

## Prior FAIL archive (byte-for-byte)

| Item | Value |
|------|--------|
| Archive path | `docs/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.pre-2e2d5b-FAIL.md` |
| SHA-256 | `4b5df80f9d5bfd384ac0a2d987fba432e022f187a9e6bd2eea85e3af31589c5e` |
| Prior fail class | `image_deploy_failed` (Dockerfile resolved relative to `.tmp/` materialized config) |

## Authorization scope

| Item | Value |
|------|--------|
| App name | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Region | `iad` |
| Authorized gates | execution, app create, secrets install, image deploy, rollback, teardown |
| Verify / render scale-up | NOT AUTHORIZED / NOT RUN |
| Hosted consumers / render / 4K / routes | NOT AUTHORIZED / NOT RUN |
| `.env.local` / commit / push | NOT DONE |
| Retry after this failure | NOT PERFORMED |

## Pre-provider authority

| Check | Result |
|------|--------|
| Branch `feature/sprint-11-headless-renderer` | PASS (dirty tree preserved) |
| Prior FAIL archived + SHA verified | PASS |
| `git diff --check` | PASS |
| Local authority suite (matcher, exact-nine, repo-root materialize, no `.tmp/` Dockerfile, gitignore) | PASS (12) |
| Local materialize at `<repo-root>/fly.staging.materialized.toml` | PASS |
| `dockerfile = "deploy/headless-worker/Dockerfile"` resolves from repo root | PASS |
| Build context = repository root | PASS |
| Region `iad`; no services/http; verify/render topology matches 2E.2D.4 | PASS |
| `fly config validate` (no provider resources) | PASS |
| Materialized file deleted after local validation | PASS |
| Accepted artifact / Dockerfile hashes unchanged | PASS |
| Bridge path/mode/exact-nine/forbidden-key absence | PASS (values not printed) |
| Bridge/env/gate cleanup registered before source | PASS |

## Accepted input hashes (reconfirmed)

| Artifact | SHA-256 | Result |
|----------|---------|--------|
| 2E.2D.3 sandbox evidence | `083e3d27cac72a1537a15dc2189a321deb54b6efc1d8c668345595dbbdfc3d17` | MATCH |
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` | MATCH |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` | MATCH |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` | MATCH |
| Dockerfile | `13c36f2c18c43cf70b144b2bf42f0088f54b68c4a8a1e67e32b1eade36c59b3a` | MATCH |

## Local classification + schema preflight

| Check | Result |
|------|--------|
| Neon / R2 / Upstash TCP / hosted | all `configured` |
| Schema preflight | **PASS** |
| Migration IDs | `000_headless_schema_migrations`, `001_headless_project_ownership`, `002_headless_jobs`, `004_headless_owned_objects`, `005_headless_cleanup_intents`, `006_headless_render_dispatch_outbox` |
| Checksum prefixes | `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451` |
| Migrations / DDL | NOT RUN |

## Repo-root Dockerfile / config proof (this run)

| Check | Result |
|------|--------|
| Materialized path | `<repo-root>/fly.staging.materialized.toml` |
| `app` | `shortforge-hw-staging-4def8fa0` |
| Dockerfile resolution | `deploy/headless-worker/Dockerfile` exists at repo root — **PASS** |
| Fly remote build used that Dockerfile (layers cached; Node 24 bookworm; deployable_worker BUILD_INFO checks) | **PASS** |
| No `.tmp/deploy/...` Dockerfile miss | **PASS** (5A root cause cleared) |
| Materialized config deleted in success/failure cleanup | **PASS** |

## Fly release steps

| Step | Result |
|------|--------|
| Fly auth / org `personal` / region `iad` / app absence | PASS |
| App create | **PASS** |
| Zero Machines after create | PASS |
| Public services | none |
| Secrets install (exact nine, once) | **PASS** |
| Corrected secret-name matcher on live `fly secrets list` | **PASS** (nine names, Staged `* NAME`) |
| Zero Machines after secrets | PASS |
| Image deploy authority once (repo-root config, remote-only, build-only, push, verify=0/render=0) | **FAIL** after successful push |
| Remote build + registry push | **PASS** (image built and pushed) |
| Manifest digest (immutable, credentials redacted) | `sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Fly CLI exit after push | **FAIL** — `failed to grab app config from existing machines` / `could not create a fly.toml from any machines` / `No machines configured for this app` |
| Final verify/render / Machine counts | NOT REACHED as success criteria (Machines remained 0 until teardown) |

## Root cause

Not a Fly account, credential, schema, Dockerfile-path, or image-content defect.

`fly deploy --remote-only --build-only --push` completed remote build and registry push against the repository-root materialized config, then the Fly CLI failed closed while attempting to synthesize/sync app config from Machines on a deliberately zero-Machine staging app. The zero-consumer mechanism requires no Machines at this phase; the CLI post-push path is incompatible with that invariant unless locally tolerated after proven push.

## Failure handling

| Action | Result |
|------|--------|
| Best-effort zero-scale rollback | best_effort (no Machines) |
| Authoritative zero-Machine verification | PASS |
| Teardown only `shortforge-hw-staging-4def8fa0` | **PASS** (app absent verified) |
| Bridge deleted | PASS |
| Materialized config deleted | PASS |
| Credentials / gates unset | PASS |
| Retry | NOT PERFORMED |

## Post-failure hygiene (local only)

`scripts/fly-staging/fly-staging-image-deploy.sh` will tolerate the specific post-push Fly CLI error when remote build+push is proven and Machine count remains zero, then continue explicit `verify=0 render=0` enforcement. No second provider attempt in this phase.

## Eligibility verdict

**Not eligible** for a separately authorized `verify=1` scale-up.

Provider boundaries cleared through secrets + proven image push, but the release did not finish as a preserved zero-consumer success state; the staging app was torn down. Operator must supply a **new** 0600 bridge and explicitly re-authorize another zero-consumer release after the post-push CLI hygiene fix.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
