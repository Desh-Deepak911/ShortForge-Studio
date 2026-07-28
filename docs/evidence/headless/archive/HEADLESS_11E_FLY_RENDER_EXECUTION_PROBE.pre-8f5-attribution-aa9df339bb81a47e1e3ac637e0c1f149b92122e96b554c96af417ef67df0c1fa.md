# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe failed or incomplete.
**Started:** 2026-07-23T18:24:18.237Z
**Ended:** 2026-07-23T18:27:15.425Z
**Cleanup:** ok
**Failure substage:** `page_contract_ready`
**Failure reasonId:** `page_contract_missing`

## Execution attribution

- execution_substage=page_contract_ready
- disposition_kind=terminal_failure
- durable_job_state_class=failed
- claim_token_coherence_class=cleared_after_terminal
- cleanup_scheduled_class=not_applicable
- binary_component_class=chromium
- bounded_duration_class=sub_second
- safe_worker_code=none
- store_version_delta=plus_one

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
- observation_duration_ms=168531
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 26866

## Artifact authority

- none
**Accepted image digest:** 20049795130e54227805fa3968da8a4c43ac125232538ef262d32574afa5d2d9

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage hosted.chromium_execution.
