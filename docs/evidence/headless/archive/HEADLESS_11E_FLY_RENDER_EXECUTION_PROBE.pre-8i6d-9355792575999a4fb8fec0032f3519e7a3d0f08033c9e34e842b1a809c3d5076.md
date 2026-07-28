# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe cleanup failed.
**Started:** 2026-07-24T22:12:13.181Z
**Ended:** 2026-07-24T22:16:01.170Z
**Cleanup:** failed
**Failure substage:** n/a
**Failure reasonId:** n/a

## Execution attribution

- none

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
- hosted.chromium_execution=PASS
- hosted.ffmpeg_execution=PASS
- r2.streamed_artifact_upload=PASS
- owned_object.finalized=PASS
- artifact.binding_coherence=FAIL (HOSTED_RENDER_CLAIM_FAILED)
- job.succeeded_cas=NOT_TESTED
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
- observation_duration_ms=218527
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 68741

## Artifact authority

- none
**Accepted image digest:** 7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794

## Owning boundary telemetry

- last_observed_boundary=job_succeeded_cas_completed
- missing_next_boundary=terminal_failure_cas_started
- owning_boundary_telemetry_incomplete=false
- cleanup_outcome_class=failed
- observed_sequence=claimed_context_validated,canonical_request_loaded,ffmpeg_preflight_started,ffmpeg_preflight_completed,source_assets_materialization_started,source_assets_materialization_complete,ffmpeg_process_started,page_workspace_materialization_started,page_workspace_materialization_complete,browser_context_created,page_created,page_navigation_started,page_navigation_complete,page_script_execution_started,page_script_execution_complete,page_contract_observation_started,page_contract_observation_complete,page_bootstrap_started,page_bootstrap_terminal,frame_request_started,frame_request_terminal,chromium_session_cleanup,ffmpeg_input_completed,ffmpeg_process_terminal,artifact_upload_started,artifact_upload_completed,owned_object_finalize_started,owned_object_finalize_completed,artifact_binding_validation_started,artifact_binding_validation_completed,job_succeeded_cas_started,job_succeeded_cas_completed
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
- Failed at stage artifact.binding_coherence.
- Boundary emission classification: boundary_events_emitted_but_incomplete.
