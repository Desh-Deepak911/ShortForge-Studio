# Sprint 11E Phase 2B.2D.3 — Neon promotion probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — promotion durably canonical and coherent; later matrix cases not run.
**Started:** 2026-07-20T11:33:10.872Z
**Ended:** 2026-07-20T11:33:33.527Z
**Cleanup:** ok

## Promotion attribution

- safeOperationStage=`promotion_post_write`
- promotionResultKind=`updated`
- safeControlPlaneCode=`none`
- allowlistedSqlState=`none`
- allowlistedConstraint=`none`
- promotionReasonId=`none`
- durableCanonicalRowExists=`true`
- storeVersionDelta=`plus_one`
- stageClassification=`canonical`

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`

## Notes

- Promotion probe evidence — does not overwrite progressive or official live evidence.
- Stops after promotion attribution; does not run later required cases.
- connectionFactoryCalls=1
