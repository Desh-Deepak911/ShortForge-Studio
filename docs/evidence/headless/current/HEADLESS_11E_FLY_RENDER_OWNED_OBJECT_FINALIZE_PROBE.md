# Sprint 11E Phase 2E.2D.8E — Fly render owned-object finalize probe

**Overall:** PASS
**Eligibility:** ELIGIBLE — targeted owned-object finalize probe passed upload/finalize coherence.
**Started:** 2026-07-23T12:30:57.756Z
**Ended:** 2026-07-23T12:32:32.241Z
**Cleanup:** ok
**Finalized object count:** 5
**Failure substage:** n/a
**Failure reasonId:** n/a

## Finalize attribution

- finalize_substage=finalized_coherence_assertion
- finalize_object_purpose_class=asset_bytes
- finalize_slot_key_class=hslot_v2
- finalize_slot_key_length_class=exceeds_neon_varchar_128_within_ts_max
- finalize_store_class=assets
- finalize_failure_boundary_class=successful_finalize
- finalize_safe_control_plane_code=none
- finalize_allowlisted_sqlstate=none
- finalize_allowlisted_constraint=none
- finalize_result_kind=finalized
- finalize_store_version_delta=unexpected
- finalize_durable_object_stage_class=finalized
- finalize_revision_outcome_class=available

## Substages

- `finalize_input_construction`: ok
- `staging_record_reread`: ok
- `r2_upload`: ok
- `r2_revision_observation`: ok
- `finalize_preflight`: ok
- `neon_finalize_connect`: ok
- `neon_finalize_transaction`: ok
- `neon_finalize_update`: ok
- `neon_finalize_returning_map`: ok
- `neon_finalize_reread`: ok
- `finalized_coherence_assertion`: ok
- `finalize_input_construction`: ok
- `staging_record_reread`: ok
- `r2_upload`: ok
- `r2_revision_observation`: ok
- `finalize_preflight`: ok
- `neon_finalize_connect`: ok
- `neon_finalize_transaction`: ok
- `neon_finalize_update`: ok
- `neon_finalize_returning_map`: ok
- `neon_finalize_reread`: ok
- `finalized_coherence_assertion`: ok
- `finalize_input_construction`: ok
- `staging_record_reread`: ok
- `r2_upload`: ok
- `r2_revision_observation`: ok
- `finalize_preflight`: ok
- `neon_finalize_connect`: ok
- `neon_finalize_transaction`: ok
- `neon_finalize_update`: ok
- `neon_finalize_returning_map`: ok
- `neon_finalize_reread`: ok
- `finalized_coherence_assertion`: ok
- `finalize_input_construction`: ok
- `staging_record_reread`: ok
- `r2_upload`: ok
- `r2_revision_observation`: ok
- `finalize_preflight`: ok
- `neon_finalize_connect`: ok
- `neon_finalize_transaction`: ok
- `neon_finalize_update`: ok
- `neon_finalize_returning_map`: ok
- `neon_finalize_reread`: ok
- `finalized_coherence_assertion`: ok
- `finalize_input_construction`: ok
- `staging_record_reread`: ok
- `r2_upload`: ok
- `r2_revision_observation`: ok
- `finalize_preflight`: ok
- `neon_finalize_connect`: ok
- `neon_finalize_transaction`: ok
- `neon_finalize_update`: ok
- `neon_finalize_returning_map`: ok
- `neon_finalize_reread`: ok
- `finalized_coherence_assertion`: ok

## Notes

- Uses the same single-materialization fixture as the official matrix.
- Stages, uploads, and finalizes manifest, bundle, and asset_bytes in canonical order.
- Stops before reconciliation, promotion, outbox, or enqueue.
- Safe with active workers — provisional job only; no canonical promotion or dispatch intent.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
