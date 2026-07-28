# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe failed or incomplete.
**Started:** 2026-07-24T10:52:19.462Z
**Ended:** 2026-07-24T10:55:27.717Z
**Cleanup:** ok
**Failure substage:** `page_contract_ready`
**Failure reasonId:** `page_workspace_attribution_missing`

## Execution attribution

- execution_substage=page_contract_ready
- disposition_kind=terminal_failure
- durable_job_state_class=failed
- claim_token_coherence_class=cleared_after_terminal
- cleanup_scheduled_class=not_applicable
- binary_component_class=chromium
- bounded_duration_class=under_30s
- safe_worker_code=none
- store_version_delta=unexpected
- page_failure_reason=page_workspace_attribution_missing

## Page workspace attribution

- none

## Execution stages

- job.create_queued=PASS
- dispatch_outbox.intent=PASS
- upstash.enqueue_render=PASS
- hosted.render_claim=PASS
- redis.ack_pending_cleared=PASS
- hosted.chromium_execution=FAIL (HOSTED_CHROMIUM_EXECUTION_FAILED)
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
- observation_duration_ms=177199
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 28214

## Artifact authority

- none
**Accepted image digest:** df3f77255296648eff6f4706199c8f6985458669c44297f8384be1c4b15d7640

## Owning boundary telemetry

- none
**Owning boundary ingestion failure:** none

## Execution-probe job-create attribution

- none

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage hosted.chromium_execution.
