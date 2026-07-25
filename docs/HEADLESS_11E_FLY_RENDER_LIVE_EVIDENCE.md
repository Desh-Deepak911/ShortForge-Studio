# Sprint 11E Phase 2E.2D.8A — Hosted Fly render live evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — exact membership PASS with six-migration fingerprint + cleanup.
**Started:** 2026-07-25T13:07:23.667Z
**Ended:** 2026-07-25T13:11:43.172Z
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

- `7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794`

## Smoke workload boundary

- profile_id=720p-webm-30
- content_duration_ms=2000
- poll_timeout_ms=180000
- claims_4k_capacity=false

## Resource observation

- measurement=process_tree_peak_rss_bytes
- peak_process_tree_rss_bytes=n/a
- observation_duration_ms=10313
- not_node_rss_alone=true
- not_4k_capacity_authority=true

## Cases

- `env.config`: PASS
- `fly.verify_machine_healthy`: PASS
- `fly.render_machine_healthy`: PASS
- `fly.immutable_image_equality`: PASS
- `neon.schema_fingerprint`: PASS
- `job.create_queued`: PASS
- `dispatch_outbox.intent`: PASS first_state=pending reread_state=dispatched transition=pending_to_dispatched
- `upstash.enqueue_render`: PASS
- `hosted.render_claim`: PASS
- `redis.ack_pending_cleared`: PASS
- `hosted.chromium_execution`: PASS
- `hosted.ffmpeg_execution`: PASS
- `r2.streamed_artifact_upload`: PASS
- `owned_object.finalized`: PASS
- `artifact.binding_coherence`: PASS
- `job.succeeded_cas`: PASS
- `dispatch_outbox.completed`: PASS
- `cleanup_intent.not_retryable`: PASS
- `artifact.download_verify`: PASS
- `replay.idempotent`: PASS
- `job.terminal_immutability`: PASS
- `fly.render_still_healthy`: PASS
- `fly.verify_still_healthy`: PASS
- `cleanup.complete`: PASS
- `evidence.privacy`: PASS

## Job create failure attribution

- none

## Notes

- Production shared staging render stream — hosted Fly render worker is sole consumer.
- Harness never invokes local render execution or stops/redeploys Fly Machines.
- First live workload is bounded 720p smoke — not a 4K capacity claim.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Gate-on cleanup runs in finally before evidence finalization.
- Gate-off preserves prior PASS/FAIL evidence with zero provider connections.
