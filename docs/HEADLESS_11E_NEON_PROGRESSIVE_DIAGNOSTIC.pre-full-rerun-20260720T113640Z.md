# Sprint 11E Phase 2B.2D.1 — Neon progressive diagnostic

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — progressive matrix stopped on first failure or incomplete authority.
**Started:** 2026-07-20T10:45:37.130Z
**Ended:** 2026-07-20T10:46:18.758Z
**Cleanup:** ok

## Progressive attribution

- lastCompletedRequiredCase=`job.verification_coverage`
- activeFailedCase=`job.promote_atomic`
- safeOperationStage=`promotion`
- safeControlPlaneCode=`none`
- allowlistedSqlState=`none`
- allowlistedConstraint=`none`

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`

## Cases

- `ownership.first_claim`: PASS
- `ownership.same_owner_access`: PASS
- `ownership.cross_owner_denied`: PASS
- `job.provisional_create`: PASS
- `job.idempotent_replay`: PASS
- `job.semantic_conflict`: PASS
- `job.pk_collision_savepoint`: PASS
- `job.provisional_cas_staging`: PASS
- `job.verification_coverage`: PASS
- `job.promote_atomic`: FAIL category=PROMOTE_FAILED

## Notes

- Progressive diagnostic evidence — does not overwrite official live evidence.
- Evidence excludes URLs, credentials, SQL, provider text, owner/session IDs, and row payloads.
- connectionFactoryCalls=1
- casesRecorded=10
