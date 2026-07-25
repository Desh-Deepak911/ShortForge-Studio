# Sprint 11E Phase 2E.2D.8F.6H — Fly claimed-render diagnostic (file-captured A/B)

**Overall:** EXECUTED
**Comparison class:** both_pass
**Capacity boundary pass:** yes
**Lifecycle:** ephemeral file-captured evidence via Machine-scoped SSH
**Started:** 2026-07-24T07:49:57Z
**Ended:** 2026-07-24T07:50:57Z
**Cleanup:** ok

## Temporary topology

- temporary_app=shortforge-hw-claimed-diag-a89cdbf9
- temporary_machine_id=80e9e55f1541e8
- temporary_region=iad
- vm_spec=performance/4/8192
- architecture=linux/amd64
- secrets_installed=no
- public_services=no
- volumes=no
- restart_policy=no
- launch_rc=0
- evidence_channel=fixed_ephemeral_file
- evidence_retrieval=complete
- fly_logs_authoritative=no

## Image authority

- remote_image_digest_prefix=7bdb718621f5
- remote_image_size=396 MB

## Artifact authority

- claimed_render_diagnostic_js_sha256=72311a427d0ea33ea61e15fa33a5e0bcc98ff9c8d0339e47a6a289095e807c1d
- claimed_render_diagnostic_build_info_sha256=68a7bf7aabaea98a2fe9ceb6a105eadd191dc2f3a2d76d85a0c933b9b5f7890d
- diagnostic_entrypoint_sha256=2636e45ae03ac996e529edeef5d58fdbd8d157c36296236de6596e9cd86ebc56
- claimed_render_probe_fixture_embed_prefix=73c5f281
- page_render_iife_sha256=424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d
- capability_boundary_authority_suite=20/20 PASS

## Bootstrap markers (file-authoritative)

- shell_entrypoint_started=observed
- node_process_starting=observed
- node_entrypoint_started=observed
- diagnostic_gate_passed=observed
- variant_minimal_terminal=observed
- variant_live_smoke_terminal=observed
- diagnostic_terminal=observed
- shell_child_exit=observed
- evidence_hold_started=observed
- evidence_hold_completed=missing

## Variant A minimal

- overall=PASS
- ffmpeg_encoder_preflight=pass
- owning_substage=n/a
- workspace_classification_count=0
- cleanup_status=ok
- terminal_reason=n/a
- capability_preflight=observed
- capability_preflight_status=ok
- capability_substage=materializer_entry_gate
- capability_class=supported
- result_class=capability_pass
- provider_capacity_gate=absent
- materializer_entry_pass=yes
- materializer_entered=observed
- shipped_artifact_resolved=not_observed
- workspace_attribution_created=not_observed
- workspace_attribution_complete=not_observed
- render_session_received_attribution=not_observed
- page_navigation_started=not_observed
- page_script_loaded=not_observed
- contract_globals_observed=not_observed
- bootstrap_invoked=not_observed
- frame_requested=observed
- page_failure_attached_attribution=not_observed
- execute_render_job_returned_attribution=not_observed
- diagnostic_result_received_attribution=observed
- cleanup_complete=observed
- workspace_fields_available=0/15

## Variant B live_smoke

- overall=PASS
- ffmpeg_encoder_preflight=pass
- owning_substage=n/a
- workspace_classification_count=0
- cleanup_status=ok
- terminal_reason=n/a
- capability_preflight=observed
- capability_preflight_status=ok
- capability_substage=materializer_entry_gate
- capability_class=supported
- result_class=capability_pass
- provider_capacity_gate=absent
- materializer_entry_pass=yes
- materializer_entered=observed
- shipped_artifact_resolved=not_observed
- workspace_attribution_created=not_observed
- workspace_attribution_complete=not_observed
- render_session_received_attribution=not_observed
- page_navigation_started=not_observed
- page_script_loaded=not_observed
- contract_globals_observed=not_observed
- bootstrap_invoked=not_observed
- frame_requested=observed
- page_failure_attached_attribution=not_observed
- execute_render_job_returned_attribution=not_observed
- diagnostic_result_received_attribution=observed
- cleanup_complete=observed
- workspace_fields_available=0/15

## Terminal evidence

- comparison_class=both_pass
- diagnostic_terminal=observed
- shell_child_exit=observed
- evidence_line_count=25

## Cleanup proof

- machine_destroyed_after_observation=yes
- temporary_app_destroyed=yes
- shortforge-hw-claimed-diag_apps_remaining=0
- retrieved_temp_evidence_deleted=yes
- master_env_unused=yes

## Archived prior evidence

- file_captured_8f6f_sha256=720ffc97a6b0e9062bdabeeb8274042c932c4c70d2cafeb45edd0cde1b0ae012

## Preserved prior evidence (unchanged)

- remote_log_observation_fail_sha256=c6d92173cdc5c4cceef0ca3a0f584bee5dd5632f568231c864064e77a0c30925
- execution_probe_evidence_sha256=e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3
- hosted_page_diagnostic_evidence_sha256=20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b

## Staging unchanged

- staging_app=shortforge-hw-staging-4def8fa0
- staging_topology=verify=1/render=1/other=0
- staging_digest_prefix=975a60be
- staging_mutations=none
