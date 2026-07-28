# Sprint 11E Phase 2D.1E — Upstash targeted claim/ACK probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted claim/ACK probe failed or incomplete.
**Started:** 2026-07-21T10:45:58.231Z
**Ended:** 2026-07-21T10:46:48.329Z
**Cleanup:** ok
**Queue protocol:** `hfq-dual-lease-v1`
**Failure stage:** `next_unread_precondition`
**Failure reasonId:** `queue_precondition_not_isolated`

## Stages

- `queued_job_seed`: ok
- `next_unread_precondition`: failed

## Schema fingerprint

- queue_protocol=`hfq-dual-lease-v1`
- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Notes

- Claim/ACK probe evidence — does not overwrite official live evidence.
- Stopped at stage=next_unread_precondition reasonId=queue_precondition_not_isolated.
