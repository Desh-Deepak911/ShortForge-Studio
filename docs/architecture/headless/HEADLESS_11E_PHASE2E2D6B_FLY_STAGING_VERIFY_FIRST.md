# Sprint 11E Phase 2E.2D.6B — Verify-only first Fly staging deployment

**Status:** FAIL (stopped before provider deploy)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T12:31:01Z`  
**End (UTC):** `2026-07-22T12:31:12Z`  
**Model:** `verify_only_first_deploy_from_immutable_image`

## Preserved evidence (unchanged)

| Item | SHA-256 |
|------|---------|
| Zero-consumer PASS (`docs/operations/headless/HEADLESS_11E_PHASE2E2D5_FLY_STAGING_ZERO_CONSUMER_RELEASE.md`) | `a0b56da850138275a451b9ebf7e6db7ab32d9ff65aed800e5d22a32ab132650e` |
| Prior verify-first FAIL (`docs/architecture/headless/HEADLESS_11E_PHASE2E2D6_FLY_STAGING_VERIFY_FIRST.md`) | `d11bf7afb86bdf8dc3bb3a76a5feb758e8dbdb4fd11cd156e62d1db58305830b` |

## Authorization inputs

| Item | Value |
|------|--------|
| App | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Region | `iad` |
| Immutable image digest | `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e` |
| Root-path authority (6A) | PASS — exported `FOOTIEBITZ_ROOT` before sourcing common |

## Execution steps

| Step | Result |
|------|--------|
| Canonical repository root validation | **PASS** |
| Bridge validation (0600, nine keys, no forbidden keys) | **PASS** |
| Fly auth + app exists | **PASS** |
| Exact zero Machines before deploy | **PASS** |
| Exact nine secret names staged | **PASS** |
| Local classify + schema preflight | **FAIL** — `upstash_tcp_status=invalid` |
| Verify-first materialize / `fly deploy` | **NOT RUN** |
| Verify Machine creation | **NOT RUN** |
| Startup log observation | **NOT RUN** |

## Failure attribution

Local preflight classified `UPSTASH_REDIS_TCP_URL` surface as **invalid** because `HEADLESS_ENV_NAME` was not exported into the orchestrator environment before Upstash consumer classification (the 2E.2D.5F zero-consumer orchestrator exports `HEADLESS_ENV_NAME=staging` after bridge source; 6B omitted that export). Hosted worker classification alone was **configured**; Neon and R2 were **configured**. No provider deploy, Machine creation, or consumer execution occurred.

## Rollback / preserved state

| Item | Value |
|------|--------|
| Machines destroyed | N/A (none created) |
| Machine count after run | **0** |
| App | **preserved** |
| Secrets | exact nine names **preserved** (staged) |
| Immutable image | **preserved** in registry (unchanged digest) |
| Bridge | **deleted** on EXIT |
| Materialized config | **deleted** on EXIT |
| Credentials / gates | **unset** on EXIT |
| Render deployment | **NOT AUTHORIZED** |

## Ongoing Fly cost exposure

**None** — zero Machines; no verify Machine billing started.

## Next operator step

Supply a **new** 0600 bridge and re-authorize verify-first with orchestrator preflight corrected to export `HEADLESS_ENV_NAME=staging` (and any other template-pinned public env required by classifiers) before local Upstash/Neon/R2/hosted classification. Render staging preparation remains separately unauthorized.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps.
