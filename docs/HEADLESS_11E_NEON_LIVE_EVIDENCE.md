# Sprint 11E Phase 2B.2B.1 — Neon live QA evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — live Neon matrix passed with cleanup confirmed.
**Started:** 2026-07-20T11:59:15.243Z
**Ended:** 2026-07-20T12:01:58.180Z
**Cleanup:** ok

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
- `job.promote_atomic`: PASS
- `job.already_promoted_replay`: PASS
- `job.forged_job_fingerprint_rejected`: PASS
- `job.forged_request_fingerprint_rejected`: PASS
- `job.forged_operation_lineage_rejected`: PASS
- `job.forged_profile_build_rejected`: PASS
- `job.queue_listing`: PASS
- `job.claim_race`: PASS
- `job.stale_cas`: PASS
- `job.terminal_immutability`: PASS
- `job.recovery_live_claim_not_stolen`: PASS
- `job.recovery_expired_claim`: PASS
- `job.recovery_store_authority`: PASS
- `job.recovery_old_token_rejected`: PASS
- `job.recovery_terminal_rejected`: PASS
- `job.recovery_concurrent_one_winner`: PASS
- `job.recovery_cross_owner_rejected`: PASS
- `job.bigint_decoding`: PASS
- `job.cross_owner_read_rejected`: PASS
- `job.malformed_json_fail_closed`: PASS

## Notes

- Evidence excludes URLs, credentials, SQL, provider text, owner/session IDs, and row payloads.
- connectionFactoryCalls=1
