# Sprint 11E Phase 2D.1D — Upstash progressive diagnostic evidence

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — prefix-FAIL at dlq.malformed.
**Started:** 2026-07-21T12:29:04.305Z
**Ended:** 2026-07-21T12:32:22.759Z
**Cleanup:** ok
**Queue protocol:** `hfq-dual-lease-v1`

## Schema fingerprint

- queue_protocol=`hfq-dual-lease-v1`
- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`

## Cases

- `env.producer.config`: PASS
- `env.consumer.config`: PASS
- `env.lease.settings`: PASS
- `stream.names`: PASS
- `protocol.version`: PASS
- `enqueue.render`: PASS
- `enqueue.verify`: PASS
- `group.create`: PASS
- `read.group`: PASS
- `consume.claim.ack`: PASS
- `consume.terminal.noop`: PASS
- `consume.duplicate.live`: PASS
- `consume.leave.pending`: PASS
- `autoclaim.idle`: PASS
- `recover.render.expired`: PASS
- `recover.verify.expired`: PASS
- `dlq.malformed`: FAIL category=DLQ_FAILED
- `trim.maxlen`: NOT_TESTED
- `concurrency.no.steal`: NOT_TESTED
- `compose.blocked`: NOT_TESTED
- `neon.fingerprint`: NOT_TESTED
- `evidence.privacy`: NOT_TESTED

## Notes

- Progressive harness — same DEFAULT_UPSTASH_LIVE_CASE_RUNNERS as official.
- Harness never migrates and never uses DATABASE_URL_UNPOOLED.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Does not overwrite docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.
- QA-isolated pending clear does not prove production-group pending removal.
- consume.claim.ack uses production-group isolation authority.
- Full progressive matrix (no stop-after).
