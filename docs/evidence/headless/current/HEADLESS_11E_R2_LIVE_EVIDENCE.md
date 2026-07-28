# Sprint 11E Phase 2C.1A — R2 live QA evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — exact required R2 live membership PASS.
**Started:** 2026-07-20T17:39:16.086Z
**Ended:** 2026-07-20T17:41:49.288Z
**Cleanup:** ok

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Cases

- `env.config`: PASS
- `staging.create`: PASS
- `upload.capability_issue`: PASS
- `upload.put_bytes`: PASS
- `metadata.head`: PASS
- `verify.conditional_stream`: PASS
- `verify.sha256_length_mime`: PASS
- `finalize.neon_atomic`: PASS
- `coverage.reconcile`: PASS
- `replay.idempotent`: PASS
- `mutate.precondition_reject`: PASS
- `digest.mismatch`: PASS
- `length.mismatch`: PASS
- `mime.mismatch`: PASS
- `expiry.reject`: PASS
- `claim.race`: PASS
- `claim.stale_reclaim`: PASS
- `cross_owner.denied`: PASS
- `cleanup.delete`: PASS
- `download.artifact_only`: PASS
- `evidence.privacy`: PASS

## Notes

- R2 live harness must not claim PASS without exact membership + fingerprint authority.
- Harness never migrates and never uses the migrate-only unpooled connection.
- Default case runners are implemented; LIVE matrix NOT RUN in this phase.
