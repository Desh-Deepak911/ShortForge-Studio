# Sprint 11E Phase 2B.2D.3 — Neon promotion probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — promotion probe failed or incomplete.
**Started:** 2026-07-20T11:18:07.272Z
**Ended:** 2026-07-20T11:18:26.008Z
**Cleanup:** ok

## Promotion attribution

- safeOperationStage=`canonical_pair_construction`
- promotionResultKind=`rejected`
- safeControlPlaneCode=`none`
- allowlistedSqlState=`none`
- allowlistedConstraint=`none`
- promotionReasonId=`canonical_pair_invalid`
- durableCanonicalRowExists=`false`
- storeVersionDelta=`unchanged`
- stageClassification=`provisional`

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`

## Notes

- Promotion probe evidence — does not overwrite progressive or official live evidence.
- Stops after promotion attribution; does not run later required cases.
- connectionFactoryCalls=1
