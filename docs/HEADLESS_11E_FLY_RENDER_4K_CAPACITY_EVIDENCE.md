# Sprint 11E Phase 2E.2D.8K.1 — Hosted 4K capacity evidence

**Overall:** PASS
**Eligibility:** ELIGIBLE — exact 35-case membership PASS with short functional smoke.
**Started:** 2026-07-25T15:57:53.303Z
**Ended:** 2026-07-25T16:06:05.794Z
**Cleanup:** ok
**Full capacity claim justified:** false

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
- render_vm=performance/4cpu/8192mb

## Accepted image digest

- `7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794`

## Certification records

- profile=4k-webm-30 level=short_functional audio_mode=silent
  content_ms=2000 render_ms=2400
  content_frames=60 rendered_frames=72 tail=12
  short_functional=true operational_capacity=false
- profile=4k-mp4-30 level=short_functional audio_mode=with-voice-and-music
  content_ms=2000 render_ms=2400
  content_frames=60 rendered_frames=72 tail=12
  short_functional=true operational_capacity=false

## Process-tree memory observation

- sample_interval_ms=250
- sample_count=1834
- peak_rss_bytes=1933881344
- summed_rss_bytes=174477312
- sampling_complete=true
- oom_or_restart=false
- unavailable_reason=none
- cadence_requested_interval_ms=250
- cadence_average_interval_ms=251
- cadence_maximum_gap_ms=261
- cadence_completeness_class=complete
- cadence_worker_tree_class=worker_tree_correlated
- cadence_malformed_sample_count=0

## Headroom evaluation

- verdict=capacity_claim_justified
- vm_ceiling_bytes=7301444403
- headroom_bytes=5367563059
- full_capacity_claim=true

## Cases

- `env.config` status=PASS
- `fly.verify_machine_healthy` status=PASS
- `fly.render_machine_healthy` status=PASS
- `fly.render_vm_shape` status=PASS
- `fly.immutable_image_equality` status=PASS
- `neon.schema_fingerprint` status=PASS
- `outbox.quiescence` status=PASS
- `4k.webm.job.create_queued` status=PASS
- `4k.webm.dispatch_outbox.intent` status=PASS
- `4k.webm.upstash.enqueue_render` status=PASS
- `4k.webm.hosted.render_claim` status=PASS
- `4k.webm.hosted.chromium_execution` status=PASS
- `4k.webm.hosted.ffmpeg_execution` status=PASS
- `4k.webm.r2.streamed_artifact_upload` status=PASS
- `4k.webm.owned_object.finalized` status=PASS
- `4k.webm.artifact.binding_coherence` status=PASS
- `4k.webm.job.succeeded_cas` status=PASS
- `4k.webm.artifact.download_verify` status=PASS
- `4k.webm.replay.idempotent` status=PASS
- `4k.webm.cleanup.complete` status=PASS
- `4k.mp4.job.create_queued` status=PASS
- `4k.mp4.dispatch_outbox.intent` status=PASS
- `4k.mp4.upstash.enqueue_render` status=PASS
- `4k.mp4.hosted.render_claim` status=PASS
- `4k.mp4.hosted.chromium_execution` status=PASS
- `4k.mp4.hosted.ffmpeg_execution` status=PASS
- `4k.mp4.r2.streamed_artifact_upload` status=PASS
- `4k.mp4.owned_object.finalized` status=PASS
- `4k.mp4.artifact.binding_coherence` status=PASS
- `4k.mp4.job.succeeded_cas` status=PASS
- `4k.mp4.artifact.download_verify` status=PASS
- `4k.mp4.replay.idempotent` status=PASS
- `4k.mp4.cleanup.complete` status=PASS
- `process_tree.memory_observation` status=PASS
- `evidence.privacy` status=PASS

## Notes

- Hosted 4K capacity matrix — separate gate/evidence from HEADLESS_FLY_RENDER_QA render-live.
- Short functional smoke does not infer operational-duration 4K capacity.
- Matrix stops on first failure; remaining cases are NOT_TESTED.
- Process-tree memory observation excludes the local observer process.
- Gate-on cleanup runs in finally before evidence finalization.
- Gate-off preserves prior PASS/FAIL evidence with zero provider connections.
