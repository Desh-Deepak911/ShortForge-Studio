# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — targeted execution probe reached succeeded or exact terminal attribution.
**Started:** 2026-07-25T08:51:06.873Z
**Ended:** 2026-07-25T08:55:06.937Z
**Cleanup:** ok
**Failure substage:** n/a
**Failure reasonId:** n/a

## Execution attribution

- execution_substage=succeeded_cas
- disposition_kind=succeeded
- durable_job_state_class=succeeded
- claim_token_coherence_class=cleared_after_terminal
- cleanup_scheduled_class=not_applicable
- binary_component_class=none
- bounded_duration_class=under_30s
- safe_worker_code=none
- store_version_delta=unexpected

## Source binding attribution

- source_binding_substage=binding_resolution_complete
- source_binding_result_class=resolved
- source_binding_authority_class=canonical_bundle_allowlist
- source_binding_count_class=small
- source_binding_purpose_class=asset_bytes
- source_binding_store_class=assets
- source_binding_object_stage_class=finalized
- source_binding_job_coherence_class=coherent
- source_binding_owner_coherence_class=coherent
- source_binding_attempt_coherence_class=coherent
- source_binding_slot_coverage_class=complete
- source_binding_locator_class=unsupported
- source_binding_digest_class=matched
- source_binding_length_class=matched
- source_binding_mime_class=matched
- source_stream_capability_class=ready

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
- artifact.binding_coherence=PASS
- job.succeeded_cas=PASS
- dispatch_outbox.completed=PASS
- cleanup_intent.not_retryable=PASS
- artifact.download_verify=PASS
- replay.idempotent=PASS

## Smoke workload

- profile=720p-webm-30
- content_duration_ms=2000
- poll_timeout_ms=180000
- claims_4k_capacity=false
- fps=30
- content_frames=60
- rendered_frames=72
- padding_tail_frames=12
- render_duration_ms=2400
- end_buffer_ms=400

## Resource observation

- measurement=process_tree_peak_rss_bytes
- peak_process_tree_rss_bytes=n/a
- observation_duration_ms=222686
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 34651

## Artifact authority

- binding_verified=true
- download_verified=true
- replay_idempotent=true
- artifact_byte_length=235573
**Accepted image digest:** 7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794

## Owning boundary telemetry

- last_observed_boundary=job_succeeded_cas_completed
- missing_next_boundary=cleanup_scheduled
- owning_boundary_telemetry_incomplete=false
- cleanup_outcome_class=ok
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
- sequence_coherence=ok
**Owning boundary ingestion failure:** none
**Boundary emission classification:** boundary_events_emitted_but_incomplete

## Execution-probe job-create attribution

- none

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
