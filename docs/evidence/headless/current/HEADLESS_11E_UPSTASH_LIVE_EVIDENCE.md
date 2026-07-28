# Sprint 11E Phase 2D.1 — Upstash dual-lease live QA evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — exact membership PASS with Neon fingerprint + protocol + cleanup.
**Started:** 2026-07-21T15:08:21.944Z
**Ended:** 2026-07-21T15:13:22.568Z
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
- `dlq.malformed`: PASS
- `trim.maxlen`: PASS
- `concurrency.no.steal`: PASS
- `compose.blocked`: PASS
- `neon.fingerprint`: PASS
- `evidence.privacy`: PASS

## Notes

- Harness never migrates and never uses DATABASE_URL_UNPOOLED.
- TCP consumer used only under worker/ paths when live-authorized.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- QA autoclaim uses minIdleMs:0 or qaIdleMs / testingSetPendingIdleMs; production deliveryIdleMs defaults unchanged.
- Authorized remote Upstash/Neon evidence pass was refused before provider contact while DEFAULT runners were stubs; evidence.md left NOT_TESTED.
