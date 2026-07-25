# Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live evidence

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — failed at fly.verify_machine_ready.
**Started:** 2026-07-23T06:45:09.087Z
**Ended:** 2026-07-23T06:45:24.502Z
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
- `007_headless_owned_object_slot_key_capacity` checksum_prefix=`699a3565d7e1`

## Accepted verify Machine topology

- verify=1 render=0 region=iad

## Accepted image digest

- `ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e`

## Cases

- `env.config`: PASS
- `fly.verify_machine_ready`: FAIL category=FLY_VERIFY_NOT_READY
- `neon.schema_fingerprint`: NOT_TESTED
- `provisional.create`: NOT_TESTED
- `owned_object.stage`: NOT_TESTED
- `r2.upload_manifest`: NOT_TESTED
- `upstash.enqueue_verify`: NOT_TESTED
- `hosted.verify_claim`: NOT_TESTED
- `hosted.stream_verify`: NOT_TESTED
- `owned_object.finalized`: NOT_TESTED
- `coverage.reconciled`: NOT_TESTED
- `coverage.incomplete`: NOT_TESTED
- `promotion.not_run`: NOT_TESTED
- `render_dispatch.absent`: NOT_TESTED
- `verify_pending_cleared`: NOT_TESTED
- `replay.idempotent`: NOT_TESTED
- `fly.verify_still_healthy`: NOT_TESTED
- `render_machine.absent`: NOT_TESTED
- `cleanup.complete`: NOT_TESTED
- `evidence.privacy`: NOT_TESTED

## Notes

- Production shared staging verify stream — hosted Fly verifier is sole consumer.
- Harness never invokes local verification or stops/redeploys the verify Machine.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Gate-on cleanup runs in finally before evidence finalization.
- Gate-off preserves prior PASS/FAIL evidence with zero provider connections.
