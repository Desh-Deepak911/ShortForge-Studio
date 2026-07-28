# Sprint 11E Phase 2E.2D.8F.6C — Fly claimed-render diagnostic (observed lifecycle)

**Overall:** NOT_EXECUTED
**Comparison class:** diagnostic_entrypoint_no_output
**Lifecycle:** atomic launch + bounded log observation (no --rm)
**Started:** 2026-07-24T05:52:00Z
**Ended:** 2026-07-24T06:03:00Z
**Cleanup:** ok

## Temporary topology

- temporary_app=shortforge-hw-claimed-diag-c4755ead
- temporary_region=iad
- vm_spec=performance/4/8192
- architecture=linux/amd64
- secrets_installed=no
- public_services=no
- volumes=no
- restart_policy=no
- launch_rc=0
- machine_start=ok
- observation_duration_sec=480
- observation_terminal=diagnostic_entrypoint_no_output
- process_exit_class=stopped
- diagnostic_environment_observed=no
- cleanup_marker_observed=no

## Artifact authority

- claimed_render_diagnostic_js_sha256=350bf08f8dcfd8c390722e0bd19a244ac61777b7b9f6fdab8966cc1b4da035f8
- claimed_render_diagnostic_build_info_prefix=21e62eff
- claimed_render_probe_fixture_embed_prefix=73c5f281
- page_render_iife_sha256=424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d
- image_authority_suite=16/16 PASS
- deterministic_build_x2=PASS

## Ordered A/B results (minimal then live_smoke)

### Variant A minimal

- overall=not_run
- terminal_observed=no
- ffmpeg_encoder_preflight=not_observed
- owning_substage=n/a
- workspace_classification_count=0
- cleanup_status=not_run
- materializer_entered=not_observed
- shipped_artifact_resolved=not_observed
- workspace_attribution_created=not_observed
- workspace_attribution_complete=not_observed
- render_session_received_attribution=not_observed
- page_navigation_started=not_observed
- page_script_loaded=not_observed
- contract_globals_observed=not_observed
- bootstrap_invoked=not_observed
- frame_requested=not_observed
- page_failure_attached_attribution=not_observed
- execute_render_job_returned_attribution=not_observed
- diagnostic_result_received_attribution=not_observed
- cleanup_complete=not_observed
- workspace_fields_available=0/15

### Variant B live_smoke

- overall=not_run
- terminal_observed=no
- ffmpeg_encoder_preflight=not_observed
- owning_substage=n/a
- workspace_classification_count=0
- cleanup_status=not_run
- materializer_entered=not_observed
- shipped_artifact_resolved=not_observed
- workspace_attribution_created=not_observed
- workspace_attribution_complete=not_observed
- render_session_received_attribution=not_observed
- page_navigation_started=not_observed
- page_script_loaded=not_observed
- contract_globals_observed=not_observed
- bootstrap_invoked=not_observed
- frame_requested=not_observed
- page_failure_attached_attribution=not_observed
- execute_render_job_returned_attribution=not_observed
- diagnostic_result_received_attribution=not_observed
- cleanup_complete=not_observed
- workspace_fields_available=0/15

## Terminal evidence

- variant_A_terminal=no
- variant_B_terminal=no
- comparison_class=diagnostic_entrypoint_no_output
- cleanup_marker=no
- process_exit_class=stopped
- last_safe_owning_boundary=n/a
- bounded_entrypoint_status=machine_started_then_stopped_without_safe_jsonl

## Interpretation

- Machine bootstrap succeeded (launch rc=0, start ok).
- Bounded 8-minute observation collected no safe `hosted.claimed_render_diagnostic` JSONL from machine-scoped logs.
- Process reached `stopped` before cleanup; no A/B comparison class from diagnostic taxonomy applies.
- Does not resolve execution-probe FAIL; does not contradict hosted page-diagnostic PASS.

## Cleanup proof

- machine_destroyed_after_observation=yes
- temporary_app_destroyed=yes
- shortforge-hw-claimed-diag_apps_remaining=0
- temp_logs_removed=yes
- master_env_unused=yes

## Archived prior evidence

- bootstrap_fail_sha256=fecae38cc2f26fc3d839e6ec0914403187663fadc77299ea34577a086b3e2083
- lifecycle_capture_fail_sha256=4b0ccdd4f78f34b5dfa9f0d0663a0c2800b1b7d4b4a4b20a8ac633ac38935d27

## Preserved prior evidence (unchanged)

- execution_probe_evidence_sha256=e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3
- hosted_page_diagnostic_evidence_sha256=20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b

## Staging unchanged

- staging_app=shortforge-hw-staging-4def8fa0
- staging_topology=verify=1/render=1/other=0
- staging_digest_prefix=975a60be
- staging_public_services=none
- staging_mutations=none

## Notes

- One observed provider-free Fly claimed-render diagnostic; `--rm` not used; no second start command; no credential master; no provider contact.
- Does not modify production worker, staging Machines, migrations, routes, or unrelated evidence.
