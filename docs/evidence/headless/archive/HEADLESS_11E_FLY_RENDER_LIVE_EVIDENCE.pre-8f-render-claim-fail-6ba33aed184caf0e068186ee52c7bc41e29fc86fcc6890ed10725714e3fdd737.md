# Sprint 11E Phase 2E.2D.8A — Hosted Fly render live evidence

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — failed at hosted.render_claim.
**Started:** 2026-07-23T12:38:05.694Z
**Ended:** 2026-07-23T12:41:19.570Z
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

## Fly render topology

- verify=1 render=1 region=iad

## Accepted image digest

- `28d60fb525c71f06ae46de0948c44be37f6c9c38557a3fbecb1e0db7cfb016a8`

## Smoke workload boundary

- profile_id=720p-webm-30
- content_duration_ms=2000
- poll_timeout_ms=180000
- claims_4k_capacity=false

## Resource observation

- measurement=process_tree_peak_rss_bytes
- peak_process_tree_rss_bytes=n/a
- observation_duration_ms=10528
- not_node_rss_alone=true
- not_4k_capacity_authority=true

## Cases

- `env.config`: PASS
- `fly.verify_machine_healthy`: PASS
- `fly.render_machine_healthy`: PASS
- `fly.immutable_image_equality`: PASS
- `neon.schema_fingerprint`: PASS
- `job.create_queued`: PASS
- `dispatch_outbox.intent`: PASS first_state=dispatched reread_state=dispatched transition=unchanged
- `upstash.enqueue_render`: PASS
- `hosted.render_claim`: FAIL category=HOSTED_RENDER_CLAIM_FAILED
- `redis.ack_pending_cleared`: NOT_TESTED
- `hosted.chromium_execution`: NOT_TESTED
- `hosted.ffmpeg_execution`: NOT_TESTED
- `r2.streamed_artifact_upload`: NOT_TESTED
- `owned_object.finalized`: NOT_TESTED
- `job.succeeded_cas`: NOT_TESTED
- `artifact.binding_coherence`: NOT_TESTED
- `dispatch_outbox.completed`: NOT_TESTED
- `cleanup_intent.not_retryable`: NOT_TESTED
- `artifact.download_verify`: NOT_TESTED
- `replay.idempotent`: NOT_TESTED
- `job.terminal_immutability`: NOT_TESTED
- `fly.render_still_healthy`: NOT_TESTED
- `fly.verify_still_healthy`: NOT_TESTED
- `cleanup.complete`: NOT_TESTED
- `evidence.privacy`: NOT_TESTED

## Job create failure attribution

- none

## Notes

- Production shared staging render stream — hosted Fly render worker is sole consumer.
- Harness never invokes local render execution or stops/redeploys Fly Machines.
- First live workload is bounded 720p smoke — not a 4K capacity claim.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Gate-on cleanup runs in finally before evidence finalization.
- Gate-off preserves prior PASS/FAIL evidence with zero provider connections.
