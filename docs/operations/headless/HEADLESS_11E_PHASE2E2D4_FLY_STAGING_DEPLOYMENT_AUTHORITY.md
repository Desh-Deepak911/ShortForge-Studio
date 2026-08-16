# Sprint 11E Phase 2E.2D.4 — Fly staging deployment authority (local)

**Status:** PASS (local authority; corrected by 2E.2D.5C)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Fly sandbox capability (accepted input):** `docs/operations/headless/HEADLESS_11E_PHASE2E2D3_FLY_SANDBOX_PROBE.md`  
**Sandbox evidence SHA-256:** `083e3d27cac72a1537a15dc2189a321deb54b6efc1d8c668345595dbbdfc3d17`  
**Lifecycle correction:** `docs/architecture/headless/HEADLESS_11E_PHASE2E2D5C_FLY_STAGING_ZERO_MACHINE_LIFECYCLE.md`  
**Observation correction:** `docs/architecture/headless/HEADLESS_11E_PHASE2E2D5E_PRE_FIRST_MACHINE_OBSERVATION_AUTHORITY.md`

## Authorization scope

| Item | Value |
|------|--------|
| Organization (future) | `personal` |
| Primary region | `iad` (pinned in template) |
| Permanent Fly staging app | **NOT CREATED** in this authority phase |
| Fly secrets | **NOT SET** in this authority phase |
| Machine deployment / consumers | **NOT RUN** in this authority phase |
| 4K render | **NOT RUN** |
| Production routes | CONFIGURATION-BLOCKED |
| `.env.local` | unchanged |
| Commit / push | NOT DONE |

## Final topology

| Item | Value |
|------|--------|
| Image | one immutable `deployable_worker` image |
| Process groups (full topology) | `verify`, `render` |
| Region | `iad` |
| Verify VM | shared CPU, 1 CPU, 2048 MB, concurrency 1 |
| Render VM | performance CPU, 4 CPUs, 8192 MB, concurrency 1 |
| Public services / HTTP | none |
| Kill | `SIGTERM` + `kill_timeout=30` (graceful drain 25000 ms) |
| Mode injection | process command only (`verify` / `render`) — not `[env]` |

## App-name rule

`shortforge-hw-staging-<suffix>`

- lowercase + dash-safe prefix
- suffix: `[a-z0-9]{4,24}` operator-supplied at execution
- staging-only; production names / prod tokens rejected
- max length 63

## Non-secret env ledger (`HEADLESS_FLY_STAGING_PUBLIC_ENV`)

| Name | Value |
|------|--------|
| `HEADLESS_ENV_NAME` | `staging` |
| `HEADLESS_CHROME_PATH` | `/usr/bin/chromium` |
| `HEADLESS_FFMPEG_PATH` | `/usr/bin/ffmpeg` |
| `HEADLESS_FFPROBE_PATH` | `/usr/bin/ffprobe` |
| `HEADLESS_RENDERER_BUILD_ID` | `headless-local-chromium-ffmpeg-11d-phase3.2` |
| `HEADLESS_WORKER_CONCURRENCY` | `1` |
| `HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS` | `25000` |
| `HEADLESS_WORKER_WORKSPACE_ROOT` | `/tmp/footiebitz-headless-worker` |
| `HEADLESS_HOSTED_IMAGE_CLASS` | `deployable_worker` |

`HEADLESS_WORKER_MODE` is **absent** from public env (process-command only).

## Secret-name ledger (names only; no values)

`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ASSETS`, `R2_BUCKET_ARTIFACTS`, `R2_ENDPOINT`, `HEADLESS_ALLOWED_ORIGINS`, `UPSTASH_REDIS_TCP_URL`

Forbidden on workers: Upstash REST, Clerk, Vercel, `NEXT_PUBLIC_*`, `DATABASE_URL_UNPOOLED`.

## Zero-consumer deployment mechanism

`build_only_release_then_exact_zero_machine_authority`

1. Local materialized config validates; local `primary_region=iad`; local topology exact; no public services in local config  
2. App create (no Machines)  
3. Secrets install from 0600 bridge (exact Machine list must stay empty)  
4. `fly deploy --remote-only --build-only --push` from repo-root materialized config  
5. Tolerate only bounded post-push zero-Machine CLI noise when push + immutable digest are proven  
6. Require successful `fly machine list` with **zero** entries (provider error / malformed ≠ zero)  
7. Non-consuming schema preflight: local / one-shot — **not** verify/render consumers  

**Removed false claims (pre-first Machine):**

- Persisted Launch `verify=0 render=0` via `fly scale count` / `fly scale show`  
- Requiring `fly config show` to contain `iad` or prove public-service absence  

**Region:** zero-consumer records `configured_local_not_remotely_observed`. Remote placement in `iad` is established only from the first verify Machine’s authoritative status during separately authorized verify-first activation.

## Activation authorization boundaries

| Gate | Env (must be `1`) | Effect |
|------|-------------------|--------|
| Master | `HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED` | Required for any provider contact |
| App create | `…_AUTHORIZE_APP_CREATE` | Create staging app only |
| Secrets | `…_AUTHORIZE_SECRETS_INSTALL` | Import bridge secrets; Machines must stay 0 |
| Image deploy | `…_AUTHORIZE_IMAGE_DEPLOY` | Push image; exact zero Machines |
| Verify first | `…_AUTHORIZE_VERIFY_SCALE_UP` | Verify-only first deploy from immutable image (`--ha=false`); render absent |
| Render | `…_AUTHORIZE_RENDER_SCALE_UP` | Later full-topology transition; requires verify=1 render=0 first |
| Rollback | `…_AUTHORIZE_ROLLBACK` | Destroy Machines to exact zero; optional build-only prior image |
| Teardown | `…_AUTHORIZE_TEARDOWN` | Destroy Machines; destroy staging-prefixed app |

Verify-first model: `verify_only_first_deploy_from_immutable_image`  
Requires operator `HEADLESS_FLY_STAGING_IMAGE_REF` (registry ref including digest).

All gates default **blocked** unless explicitly authorized.

## Rollback / teardown

- Rollback: exact Machine list → destroy → exact zero; optional prior image via build-only push; **no** `fly scale count`  
- Machine destroy: `fly machine destroy -a <staging-app> --force <ID>` — **never** `-y` (Phase 2E.2D.6E)  
- Teardown: exact Machine list → destroy → prove zero → `fly apps destroy` only `shortforge-hw-staging-*`  

## Verify-first secret activation (Phase 2E.2D.6E)

After immutable-image deploy + verify topology proof, parse `fly secrets list --json` (exact nine names, bounded status, no values). If aggregate is `staged` or `partial`, run **exactly one** `fly secrets deploy -a <app> -c <verify-first-config>` without rebuilding the image; re-read until aggregate is `deployed`. Runtime readiness requires deployed ledger **and** worker log proof — never infer from local preflight alone. See [2E.2D.6E](../../architecture/headless/HEADLESS_11E_PHASE2E2D6E_FLY_STAGING_STAGED_SECRET_ACTIVATION_AUTHORITY.md).

## Canonical verify-first orchestrator (Phase 2E.2D.6G)

Remote verify-first must invoke **`scripts/fly-staging/fly-staging-verify-first.sh` directly** — never `.tmp/run-2e2d*-verify-first.sh` wrappers. Bootstrap validates root/functions/templates before bridge consumption; bridge deleted on EXIT only after accept. Provider-free `--dry-run` exercises the full state machine. See [2E.2D.6G](HEADLESS_11E_PHASE2E2D6G_FLY_STAGING_CANONICAL_VERIFY_FIRST_ORCHESTRATOR.md).

## Bridge contract

- Mode `0600`  
- Exact secret-name membership; empty/duplicate/unknown rejected  
- No `.env.local` fallback  
- EXIT trap: delete bridge file + unset secret names  

## Privacy

No access tokens, secret values, registry URLs, Machine/app IDs, or provider dumps are included.
