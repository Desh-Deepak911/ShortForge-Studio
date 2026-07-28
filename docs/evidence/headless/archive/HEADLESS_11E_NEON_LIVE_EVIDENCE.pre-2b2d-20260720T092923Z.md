# Sprint 11E Phase 2B.2B.1 — Neon live QA evidence

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — Live case count does not match required registry.
**Started:** 2026-07-20T09:23:38.277Z
**Ended:** 2026-07-20T09:23:55.678Z
**Cleanup:** ok

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`

## Cases

- `ownership.first_claim`: PASS
- `ownership.same_owner_access`: PASS
- `ownership.cross_owner_denied`: PASS
- `job.provisional_create`: FAIL category=PROVISIONAL_CREATE_FAILED

## Notes

- Evidence excludes URLs, credentials, SQL, provider text, owner/session IDs, and row payloads.
- connectionFactoryCalls=1
- caseAuthority=CASE_MEMBERSHIP_INVALID
