# Sprint 11E Phase 2E.2D.5 — Fly staging zero-consumer release

**Status:** FAIL  
**Fail class:** `secret_name_missing` (orchestrator false-positive against Fly staged-list formatting)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-22T06:57:07Z`  
**End (UTC):** `2026-07-22T06:58:01Z`  

## Authorization scope

| Item | Value |
|------|--------|
| App name | `shortforge-hw-staging-4def8fa0` |
| Organization | `personal` |
| Region | `iad` |
| Verify / render scale-up | NOT AUTHORIZED / NOT RUN |
| Hosted consumers / render / 4K / routes | NOT AUTHORIZED / NOT RUN |
| `.env.local` / commit / push | NOT DONE |
| Retry after failure | NOT PERFORMED |

## Accepted input hashes (reconfirmed before provider contact)

| Artifact | SHA-256 | Result |
|----------|---------|--------|
| 2E.2D.3 sandbox evidence | `083e3d27cac72a1537a15dc2189a321deb54b6efc1d8c668345595dbbdfc3d17` | MATCH |
| 2E.2D.4 deployment authority | `35d2c8fbf7e849f921889de96523d1328787b3ca3ee31dc6a6862da66ed723fd` | MATCH |
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` | MATCH |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` | MATCH |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` | MATCH |
| Dockerfile | `13c36f2c18c43cf70b144b2bf42f0088f54b68c4a8a1e67e32b1eade36c59b3a` | MATCH |

## Bridge verification (pre-source)

| Check | Result |
|------|--------|
| Path present | PASS |
| Mode `0600` | PASS |
| Exact nine keys | PASS |
| Non-empty values | PASS (presence only) |
| No duplicates / unknown keys | PASS |
| No `export` / REST / Clerk / Vercel / `NEXT_PUBLIC_*` / `DATABASE_URL_UNPOOLED` | PASS |
| No `.env.local` reference | PASS |

## Local classification + schema preflight

| Check | Result |
|------|--------|
| Neon environment | `configured` |
| R2 environment | `configured` |
| Upstash TCP consumer | `configured` |
| Hosted-worker environment | `configured` / `ok` |
| Schema preflight | **PASS** |
| Migration IDs | `000`, `001`, `002`, `004`, `005`, `006` (exact embedded membership) |
| Checksum prefixes | `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451` |
| Migrations / DDL | NOT RUN |

## Fly release steps

| Step | Result |
|------|--------|
| Fly auth / org `personal` / region `iad` | PASS |
| App absent before create | PASS |
| App create | **PASS** |
| Zero Machines immediately after create | PASS |
| Public services after create | none (PASS) |
| Secrets install (import) | **PASS** (nine names staged; Digests redacted in ops logs) |
| Orchestrator secret-name membership assert | **FAIL** — matcher required `^NAME` but Fly listed `* NAME` with Staged status |
| Image build/push | NOT RUN |
| Final verify/render counts | NOT REACHED |
| Machine count at stop | 0 (throughout; none after create/secrets) |

Observed (names only): all nine required secret names were present in `fly secrets list` as **Staged** before the false-positive stop. No secret values were printed or recorded.

## Failure handling

| Action | Result |
|------|--------|
| Rollback script | FAIL (no Machines / no fly.toml yet — expected) |
| Forced Machine absence | PASS (none remained) |
| Teardown of `shortforge-hw-staging-4def8fa0` only | **PASS** (app destroyed; absence verified) |
| Retry | NOT PERFORMED |

## Bridge / environment cleanup

| Check | Result |
|------|--------|
| Bridge file deleted | PASS |
| Bridged variables unset | PASS (EXIT trap) |
| Authorization gates unset | PASS (EXIT trap) |
| Verify/render scale-up gates | remained absent |

## Post-failure hygiene (local)

Secret-name membership helper updated in `scripts/fly-staging/fly-staging-common.sh` / secrets-install script to accept Fly’s staged `* NAME` listing format for a **future separately authorized** attempt. This phase did not retry.

## Eligibility verdict

**Not eligible** for a separately authorized `verify=1` scale-up.

Reason: zero-consumer release did not complete (image not pushed; staging app torn down after fail-closed path). Schema preflight and secret import succeeded before the false-positive stop, but the durable staging app no longer exists.

Operator must supply a **new** 0600 bridge and explicitly re-authorize a fresh zero-consumer release (new or same app name if available) before verify scale-up can be considered.

## Privacy

No secret values, credential fragments, URLs, tokens, or raw provider dumps are included.
