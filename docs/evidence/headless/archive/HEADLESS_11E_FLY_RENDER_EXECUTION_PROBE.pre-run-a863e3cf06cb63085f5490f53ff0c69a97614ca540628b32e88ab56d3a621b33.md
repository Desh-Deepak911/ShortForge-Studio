# Sprint 11E Phase 2E.2D.8F — Fly render execution probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted execution probe cleanup failed.
**Started:** 2026-07-24T13:40:52.972Z
**Ended:** 2026-07-24T13:47:11.803Z
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
- observation_duration_ms=368828
- unavailable_reason=non_linux_local_authority
- not_node_rss_alone=true
- not_4k_capacity_authority=true
**Execution duration ms:** 234941

## Artifact authority

- none
**Accepted image digest:** 211d6a711aab442a31886e37d5278cc82d93f230e0623d3fe8a4841d40680758

## Owning boundary telemetry

- last_observed_boundary=chromium_session_cleanup
- missing_next_boundary=none
- owning_boundary_telemetry_incomplete=false
- cleanup_outcome_class=failed
- observed_sequence=claimed_context_validated,canonical_request_loaded,source_assets_materialization_started,source_assets_materialization_complete,page_workspace_materialization_started,page_workspace_materialization_complete,browser_context_created,page_created,page_navigation_started,page_navigation_complete,page_script_execution_started,page_script_execution_complete,page_contract_observation_started,page_contract_observation_complete,page_bootstrap_started,page_bootstrap_terminal,frame_request_started,frame_request_terminal,chromium_session_cleanup
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
**Boundary emission classification:** boundary_events_emitted_and_correlated

## Execution-probe job-create attribution

- none

## Notes

- One bounded 720p-webm-30 / 2000ms production-path execution probe.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
- Hosted Fly render worker is sole consumer of the shared staging render stream.
- No Machine scale/restart/redeploy; no 4K capacity claim.
- Failed at stage hosted.chromium_execution.
- Boundary emission classification: boundary_events_emitted_and_correlated.
