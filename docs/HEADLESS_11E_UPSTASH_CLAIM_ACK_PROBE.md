# Sprint 11E Phase 2D.1E — Upstash targeted claim/ACK probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — targeted claim/ACK probe passed; official matrix not rerun.
**Started:** 2026-07-21T12:25:19.450Z
**Ended:** 2026-07-21T12:26:23.823Z
**Cleanup:** ok
**Queue protocol:** `hfq-dual-lease-v1`
**Queue namespace version:** `v1`
**streamAuthority:** `qa_run_scoped`
**groupAuthority:** `production_protocol`
**Run-scoped cleanup:** ok
**enqueueTransport:** `rest_xadd`
**consumeTransport:** `tcp_production_protocol`
**Failure stage:** n/a
**Failure reasonId:** n/a

## Stages

- `queued_job_seed`: ok
- `production_group_snapshot`: ok
- `delivery_enqueue`: ok
- `next_unread_precondition`: ok
- `exact_delivery_read`: ok
- `neon_claim`: ok
- `production_ack`: ok
- `pending_clear`: ok
- `stream_finalize`: ok
- `lock_release`: ok

## Schema fingerprint

- queue_protocol=`hfq-dual-lease-v1`
- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Notes

- Claim/ACK probe evidence — does not overwrite official live evidence.
- Lifecycle cases finalized; REST XADD + TCP production-protocol claim+ACK passed; cleanup ok.
