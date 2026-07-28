# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe failed or incomplete.
**Started:** 2026-07-23T13:30:23.917Z
**Ended:** 2026-07-23T13:33:33.673Z
**Cleanup:** ok
**Failure substage:** n/a
**Failure reasonId:** n/a

## Execution attribution

- none

## Execution stages

- job.create_queued=PASS
- dispatch_outbox.intent=PASS
- upstash.enqueue_render=PASS
- hosted.render_claim=FAIL (HOSTED_RENDER_CLAIM_FAILED)
- redis.ack_pending_cleared=NOT_TESTED
- hosted.chromium_execution=NOT_TESTED
- hosted.ffmpeg_execution=NOT_TESTED
- r2.streamed_artifact_upload=NOT_TESTED
- owned_object.finalized=NOT_TESTED
- job.succeeded_cas=NOT_TESTED
- artifact.binding_coherence=NOT_TESTED
- dispatch_outbox.completed=NOT_TESTED
- cleanup_intent.not_retryable=NOT_TESTED
- artifact.download_verify=NOT_TESTED
- replay.idempotent=NOT_TESTED

## Smoke workload

- profile=720p-webm-30
- content_duration_ms=2000
- poll_timeout_ms=180000
- claims_4k_capacity=false

## Resource observation

- measurement=process_tree_peak_rss_bytes
- peak_process_tree_rss_bytes=n/a
- observation_duration_ms=182039
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 41400

## Artifact authority

- none
**Accepted image digest:** 9b97b63e3d21886e59574e14f9eaae8961c3609cec1a4fb0463dd9fd02386b0e

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage hosted.render_claim.
