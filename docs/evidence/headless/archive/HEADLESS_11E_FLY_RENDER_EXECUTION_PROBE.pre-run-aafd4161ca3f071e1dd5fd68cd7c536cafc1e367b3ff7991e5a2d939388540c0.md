# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe failed or incomplete.
**Started:** 2026-07-24T12:14:56.661Z
**Ended:** 2026-07-24T12:18:39.213Z
**Cleanup:** ok
**Failure substage:** `page_contract_ready`
**Failure reasonId:** `page_runtime_exception`

## Execution attribution

- execution_substage=page_contract_ready
- disposition_kind=terminal_failure
- durable_job_state_class=failed
- claim_token_coherence_class=cleared_after_terminal
- cleanup_scheduled_class=not_applicable
- binary_component_class=chromium
- bounded_duration_class=under_180s
- safe_worker_code=WORKER_FAILED
- store_version_delta=unexpected
- page_failure_reason=page_runtime_exception
- page_response_class=rejected

## Source binding attribution

- none

## Page workspace attribution

- shipped_artifact_resolution_class=resolved_readable
- source_artifact_presence_class=present_readable
- source_artifact_digest_class=match
- materialized_artifact_presence_class=present_readable
- materialized_artifact_digest_class=match
- materialized_artifact_length_class=match
- index_script_reference_class=valid_relative
- page_navigation_class=loaded
- script_load_class=loaded
- script_execution_class=executed
- page_error_class=bootstrap_rejected
- contract_global_class=present
- contract_version_class=match
- bootstrap_response_class=rejected
- workspace_cleanup_class=not_run

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
- observation_duration_ms=210003
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 58523

## Artifact authority

- none
**Accepted image digest:** c3707b93908d32b745dde383d3340909be32e569eb4fa5edb1860cdd9a9d8fbe

## Owning boundary telemetry

- last_observed_boundary=chromium_session_cleanup
- missing_next_boundary=none
- owning_boundary_telemetry_incomplete=false
- cleanup_outcome_class=ok
- observed_sequence=claimed_context_validated,canonical_request_loaded,source_assets_materialization_started,source_assets_materialization_complete,page_workspace_materialization_started,page_workspace_materialization_complete,browser_context_created,page_created,page_navigation_started,page_script_execution_started,page_navigation_complete,page_script_execution_complete,page_contract_observation_started,page_bootstrap_started,page_contract_observation_complete,page_bootstrap_terminal,chromium_session_cleanup
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
