# Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — exact membership PASS with six-migration fingerprint + cleanup.
**Started:** 2026-07-22T19:19:50.847Z
**Ended:** 2026-07-22T19:21:15.153Z
**Cleanup:** ok

## Configuration attribution

- neon_status=configured
- r2_status=configured
- upstash_rest_status=configured
- upstash_tcp_status=configured
- env_name_status=staging
- app_name_status=accepted

## Schema fingerprint

- `000_headless_schema_migrations` checksum_prefix=`df24832672ff`
- `001_headless_project_ownership` checksum_prefix=`ab0cfc7de2c0`
- `002_headless_jobs` checksum_prefix=`7043f11813ff`
- `004_headless_owned_objects` checksum_prefix=`a2f05a8316c1`
- `005_headless_cleanup_intents` checksum_prefix=`59252610bbb0`
- `006_headless_render_dispatch_outbox` checksum_prefix=`960e1ae12451`

## Accepted verify Machine topology

- verify=1 render=0 region=iad

## Accepted image digest

- `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e`

## Cases

- `env.config`: PASS
- `fly.verify_machine_ready`: PASS
- `neon.schema_fingerprint`: PASS
- `provisional.create`: PASS
- `owned_object.stage`: PASS
- `r2.upload_manifest`: PASS
- `upstash.enqueue_verify`: PASS
- `hosted.verify_claim`: PASS
- `hosted.stream_verify`: PASS
- `owned_object.finalized`: PASS
- `coverage.reconciled`: PASS
- `coverage.incomplete`: PASS
- `promotion.not_run`: PASS
- `render_dispatch.absent`: PASS
- `verify_pending_cleared`: PASS
- `replay.idempotent`: PASS
- `fly.verify_still_healthy`: PASS
- `render_machine.absent`: PASS
- `cleanup.complete`: PASS
- `evidence.privacy`: PASS

## Notes

- Production shared staging verify stream — hosted Fly verifier is sole consumer.
- Harness never invokes local verification or stops/redeploys the verify Machine.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Gate-on cleanup runs in finally before evidence finalization.
- Gate-off preserves prior PASS/FAIL evidence with zero provider connections.
