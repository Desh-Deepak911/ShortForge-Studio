# Sprint 11E Phase 2D.1H — Upstash targeted duplicate-delivery concurrency probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — targeted concurrency probe passed; progressive/official not rerun.
**Started:** 2026-07-21T14:41:46.037Z
**Ended:** 2026-07-21T14:42:29.031Z
**Cleanup:** ok
**Queue protocol:** `hfq-dual-lease-v1`
**Queue namespace version:** `v1`
**streamAuthority:** `qa_run_scoped`
**groupAuthority:** `production_protocol`
**Run-scoped cleanup:** ok
**enqueueTransport:** `rest_xadd`
**consumeTransport:** `tcp_production_protocol`
**duplicateDeliveryModel:** `two_distinct_stream_ids`
**Failure stage:** n/a
**Failure reasonId:** n/a

## Stages

- `queued_job_seed`: ok
- `production_group_snapshot`: ok
- `duplicate_a_rest_enqueue`: ok
- `duplicate_b_rest_enqueue`: ok
- `duplicate_a_exact_read`: ok
- `duplicate_b_exact_read`: ok
- `lock_scope_a_release`: ok
- `concurrent_consume`: ok
- `winner_claim`: ok
- `peer_duplicate_ack`: ok
- `pending_a_clear`: ok
- `pending_b_clear`: ok
- `neon_no_steal`: ok
- `duplicate_a_finalize`: ok
- `duplicate_b_finalize`: ok
- `cleanup`: ok

## Schema fingerprint

- queue_protocol=`hfq-dual-lease-v1`
- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Notes

- Concurrency probe evidence — does not overwrite progressive/official evidence.
- Two REST XADD deliveries + concurrent Neon claim race; both entries ACKed; cleanup ok.
