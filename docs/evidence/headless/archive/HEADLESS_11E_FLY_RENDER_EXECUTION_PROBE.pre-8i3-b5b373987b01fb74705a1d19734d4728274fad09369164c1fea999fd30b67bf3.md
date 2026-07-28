# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe cleanup failed.
**Started:** 2026-07-24T16:42:29.781Z
**Ended:** 2026-07-24T16:46:13.721Z
**Cleanup:** failed
**Failure substage:** `artifact_finalize`
**Failure reasonId:** `artifact_finalize_failed`

## Execution attribution

- execution_substage=artifact_finalize
- disposition_kind=cleanup_scheduled
- durable_job_state_class=failed
- claim_token_coherence_class=cleared_after_terminal
- cleanup_scheduled_class=scheduled
- binary_component_class=storage
- bounded_duration_class=under_180s
- safe_worker_code=WORKER_FAILED
- store_version_delta=unchanged

## Source binding attribution

- none

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
- observation_duration_ms=211238
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 57726

## Artifact authority

- none
**Accepted image digest:** f583f189adc2c59638cbe93d8caf9ee85f7df5ffe0ad218eaaac3f69d089cd36

## Owning boundary telemetry

- last_observed_boundary=cleanup_scheduled
- missing_next_boundary=cleanup_completed
- owning_boundary_telemetry_incomplete=false
- cleanup_outcome_class=failed
- observed_sequence=claimed_context_validated,canonical_request_loaded,ffmpeg_preflight_started,ffmpeg_preflight_completed,source_assets_materialization_started,source_assets_materialization_complete,ffmpeg_process_started,page_workspace_materialization_started,page_workspace_materialization_complete,browser_context_created,page_created,page_navigation_started,page_navigation_complete,page_script_execution_started,page_script_execution_complete,page_contract_observation_started,page_contract_observation_complete,page_bootstrap_started,page_bootstrap_terminal,frame_request_started,frame_request_terminal,chromium_session_cleanup,ffmpeg_input_completed,ffmpeg_process_terminal,artifact_upload_started,owned_object_finalize_completed,artifact_upload_completed,owned_object_finalize_started,cleanup_scheduled
- shipped_artifact_resolution_class=resolved_readable
- source_artifact_presence_class=present_readable
- source_artifact_digest_class=match
- materialized_artifact_presence_class=present_readable
- materialized_artifact_digest_class=match
- materialized_artifact_length_class=match
- index_script_reference_class=valid_relative
- page_navigation_class=not_applicable
- script_load_class=not_applicable
- script_execution_class=not_applicable
- page_error_class=not_applicable
- contract_global_class=not_applicable
- contract_version_class=not_applicable
- bootstrap_response_class=not_applicable
- workspace_cleanup_class=not_run
- sequence_coherence=boundary_sequence_incoherent
- incoherence_class=non_monotonic_sequence
**Owning boundary ingestion failure:** none
**Boundary emission classification:** boundary_events_emitted_but_incomplete

## Execution-probe job-create attribution

- none

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage hosted.chromium_execution.
- Boundary emission classification: boundary_events_emitted_but_incomplete.
