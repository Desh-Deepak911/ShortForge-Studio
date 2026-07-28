# Sprint 11E Phase 2E.2D.1 — Neon staging migrations 005/006 + exact schema readiness

**Status:** PASS  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-21T20:59:17Z`  
**End (UTC):** `2026-07-21T20:59:56Z`  
**Authorization scope:** staging Neon migrate 005/006 + exact schema preflight only  
**Out of scope:** R2, Upstash, Fly, worker execution, route activation, commit, push

## Preconditions

| Check | Result |
|------|--------|
| Branch `feature/sprint-11-headless-renderer` | PASS |
| `git diff --check` | PASS |
| Bridge mode `0600`, non-empty, exact export names | PASS |
| Repository checksum 005 | PASS (`59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d`) |
| Repository checksum 006 | PASS (`960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1`) |
| Bridge sourced without printing values | PASS |
| EXIT trap registered (delete bridge + unset gates/URLs) | PASS |

## URL classification (no connection)

| Surface | Classifier | Result |
|---------|------------|--------|
| `DATABASE_URL_UNPOOLED` | `classifyHeadlessNeonMigrationEnvironment` | **configured** (direct/non-pooler) |
| `DATABASE_URL` | `classifyHeadlessNeonEnvironment` | **configured** |

## Migration pass 1

| Field | Result |
|------|--------|
| Command | `HEADLESS_NEON_MIGRATE=1 npm run migrate:headless-neon` |
| Exit | `0` |
| Applied IDs | `005_headless_cleanup_intents`, `006_headless_render_dispatch_outbox` |
| Skipped IDs | `000_headless_schema_migrations`, `001_headless_project_ownership`, `002_headless_jobs`, `004_headless_owned_objects` |
| Match expected | PASS |

## Migration pass 2 (idempotency)

| Field | Result |
|------|--------|
| Command | `HEADLESS_NEON_MIGRATE=1 npm run migrate:headless-neon` |
| Exit | `0` |
| Applied IDs | none (`applied=0`) |
| Skipped IDs | `000`, `001`, `002`, `004`, `005`, `006` (full set) |
| Idempotent | PASS |

## Exact six-migration fingerprint

Matches repository SQL, embedded deployable-worker fingerprint, and remote ledger after apply:

| migrationId | checksumSha256 |
|-------------|----------------|
| `000_headless_schema_migrations` | `df24832672ff801f63490556936cd04253fe3873f1081a5e1f97e501acb0ca1d` |
| `001_headless_project_ownership` | `ab0cfc7de2c0df9d238418a4f432f532a02531bfa1a1d9ee9d7db41b2f4965ca` |
| `002_headless_jobs` | `7043f11813ffd63b3034bd4b5f8728001f7a48da16c1010ded5bdd935b04a381` |
| `004_headless_owned_objects` | `a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3` |
| `005_headless_cleanup_intents` | `59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d` |
| `006_headless_render_dispatch_outbox` | `960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1` |

Checksum prefixes observed at preflight: `df24832672ff`, `ab0cfc7de2c0`, `7043f11813ff`, `a2f05a8316c1`, `59252610bbb0`, `960e1ae12451`.

## Schema preflight (runtime `DATABASE_URL`)

| Field | Result |
|------|--------|
| Runner | `.tmp/headless-schema-preflight-2e2d1.ts` |
| Fingerprint authority | `HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT` (deployable worker / BUILD_INFO) |
| Exit | `0` |
| Result | **PASS** |
| Exact ledger membership `000/001/002/004/005/006` | PASS |
| Exact repository checksums | PASS |
| Unexpected executable migration IDs | NONE |
| Required public tables present | PASS |
| Relations bound to `public` / relation-bound checks | PASS (`relationBound=true`, `publicSchema=true`) |
| Same-name shadow objects | Rejected by relation-bound preflight (PASS) |
| Prior ownership / jobs / owned-object coherence | PASS (included in preflight) |
| Cleanup-intent (`005`) table/constraints/indexes/state authority | PASS (included in preflight) |
| Render-dispatch outbox (`006`) table/constraints/indexes/claim fields/state authority | PASS (included in preflight) |
| Matches deployable worker BUILD_INFO schema fingerprint | PASS |

## Cleanup / privacy

| Check | Result |
|------|--------|
| Bridge deleted | PASS |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` unset | PASS |
| Migration/preflight gates unset | PASS |
| `.env.local` edited | NO (sha256 unchanged `32005602baeebf0cebdc33811dd44e1edb8ea5cd9bd5fe1d1efe052346247f91`) |
| URLs / credentials / SQL / rows / provider errors in this document | ABSENT |
| R2 contact | NONE |
| Upstash contact | NONE |
| Fly contact | NONE |
| Commit | NONE |
| Push | NONE |

## Deployable worker artifact hashes (unchanged)

| Artifact | SHA-256 |
|----------|---------|
| `dist/headless-worker/hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` |
| `dist/headless-worker/page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` |
| `dist/headless-worker/BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` |

## Local authority suites (post-remote)

| Suite | Result |
|------|--------|
| `test:headless-neon-migration-authority` | PASS (18) |
| `test:headless-neon-schema-preflight-authority` | PASS (5) |
| `test:headless-cleanup-intent-sql-schema` | PASS (4) |
| `test:headless-render-dispatch-outbox-sql-schema` | PASS (4) |
| `git diff --check` | PASS |

## Eligibility

Docker image smoke / Fly staging preparation: **ELIGIBLE FOR PREPARATION** (schema readiness accepted).  
Docker image smoke and Fly deployment were **NOT RUN** in this phase.
