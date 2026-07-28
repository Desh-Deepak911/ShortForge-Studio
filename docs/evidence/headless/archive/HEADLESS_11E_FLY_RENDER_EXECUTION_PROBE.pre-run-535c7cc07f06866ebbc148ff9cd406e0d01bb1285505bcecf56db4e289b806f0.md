# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe failed or incomplete.
**Started:** 2026-07-24T09:57:46.742Z
**Ended:** 2026-07-24T09:58:36.513Z
**Cleanup:** ok
**Failure substage:** n/a
**Failure reasonId:** n/a

## Execution attribution

- none

## Page workspace attribution

- none

## Execution stages

- job.create_queued=FAIL (JOB_CREATE_QUEUED_FAILED)
- dispatch_outbox.intent=NOT_TESTED
- upstash.enqueue_render=NOT_TESTED
- hosted.render_claim=NOT_TESTED
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
- observation_duration_ms=40889
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** n/a

## Artifact authority

- none
**Accepted image digest:** df3f77255296648eff6f4706199c8f6985458669c44297f8384be1c4b15d7640

## Owning boundary telemetry

- none
**Owning boundary ingestion failure:** none

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage job.create_queued.
