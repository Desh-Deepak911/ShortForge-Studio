# Sprint 11E Phase 2D.1G — Upstash targeted DLQ probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — targeted DLQ probe passed; progressive/official not rerun.
**Started:** 2026-07-21T12:56:01.930Z
**Ended:** 2026-07-21T12:56:28.232Z
**Cleanup:** ok
**Queue protocol:** `hfq-dual-lease-v1`
**Queue namespace version:** `v1`
**streamAuthority:** `qa_run_scoped`
**groupAuthority:** `production_protocol`
**Run-scoped cleanup:** ok
**enqueueTransport:** `rest_xadd`
**consumeTransport:** `tcp_production_protocol`
**dlqTransport:** `tcp_xadd`
**Failure stage:** n/a
**Failure reasonId:** n/a

## Stages

- `source_delivery_build`: ok
- `source_rest_enqueue`: ok
- `source_exact_acquire`: ok
- `missing_job_consume`: ok
- `dlq_tcp_xadd`: ok
- `source_ack`: ok
- `dlq_exact_lookup`: ok
- `dlq_entry_validation`: ok
- `source_finalize`: ok
- `dlq_finalize`: ok
- `cleanup`: ok

## Schema fingerprint

- queue_protocol=`hfq-dual-lease-v1`
- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Notes

- DLQ probe evidence — does not overwrite progressive/official evidence.
- REST source enqueue + TCP production-protocol consume + run-scoped TCP DLQ XADD; cleanup ok.
