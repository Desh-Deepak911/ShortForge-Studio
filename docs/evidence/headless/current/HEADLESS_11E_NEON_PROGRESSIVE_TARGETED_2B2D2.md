# Sprint 11E Phase 2B.2D.2 — Targeted progressive Neon prefix

**Overall:** TARGETED_PASS
**Stop after:** `job.provisional_cas_staging`
**Eligibility:** TARGETED PREFIX COMPLETE — remaining progressive matrix not authorized.
**Started:** 2026-07-20T10:38:13.971Z
**Ended:** 2026-07-20T10:38:48.718Z
**Cleanup:** ok

## Progressive attribution

- lastCompletedRequiredCase=`job.provisional_cas_staging`
- activeFailedCase=`none`
- safeOperationStage=`none`
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

## Notes

- Targeted progressive evidence — does not overwrite full progressive or official live evidence.
- Does not claim exact-29 progressive PASS authority.
- stopAfter=job.provisional_cas_staging
- casesRecorded=8
