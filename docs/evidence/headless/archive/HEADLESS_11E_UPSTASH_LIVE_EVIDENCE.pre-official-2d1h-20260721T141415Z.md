# Sprint 11E Phase 2D.1 — Upstash dual-lease live QA evidence

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — prefix-FAIL at consume.duplicate.live.
**Started:** 2026-07-21T08:29:38.403Z
**Ended:** 2026-07-21T08:30:54.276Z
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
- `consume.duplicate.live`: FAIL category=CONSUME_DUPLICATE_FAILED
- `consume.leave.pending`: NOT_TESTED
- `autoclaim.idle`: NOT_TESTED
- `recover.render.expired`: NOT_TESTED
- `recover.verify.expired`: NOT_TESTED
- `dlq.malformed`: NOT_TESTED
- `trim.maxlen`: NOT_TESTED
- `concurrency.no.steal`: NOT_TESTED
- `compose.blocked`: NOT_TESTED
- `neon.fingerprint`: NOT_TESTED
- `evidence.privacy`: NOT_TESTED

## Notes

- Harness never migrates and never uses DATABASE_URL_UNPOOLED.
- TCP consumer used only under worker/ paths when live-authorized.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- QA autoclaim uses minIdleMs:0 or qaIdleMs / testingSetPendingIdleMs; production deliveryIdleMs defaults unchanged.
- Authorized remote Upstash/Neon evidence pass was refused before provider contact while DEFAULT runners were stubs; evidence.md left NOT_TESTED.
