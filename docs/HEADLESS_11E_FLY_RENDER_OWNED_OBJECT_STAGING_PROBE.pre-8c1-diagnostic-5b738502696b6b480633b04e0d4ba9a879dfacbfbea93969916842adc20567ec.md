# Sprint 11E Phase 2E.2D.8C.1 — Fly render owned-object staging probe

**Overall:** FAIL
**Eligibility:** NOT ELIGIBLE — targeted owned-object staging probe failed or incomplete.
**Started:** 2026-07-23T04:10:20.335Z
**Ended:** 2026-07-23T04:10:49.898Z
**Cleanup:** ok
**Staged record count:** 0
**Failure substage:** `neon_staging_insert`
**Failure reasonId:** `neon_staging_insert_failed`

## Staging attribution

- staging_substage=neon_staging_insert
- staging_object_purpose_class=asset_bytes
- staging_slot_key_class=hslot_v2
- staging_slot_key_length_class=exceeds_neon_varchar_128_within_ts_max
- staging_store_class=assets
- staging_safe_control_plane_code=DATABASE_UNAVAILABLE
- staging_allowlisted_sqlstate=none
- staging_allowlisted_constraint=none
- staging_result_kind=failed

## Substages

- `staging_input_construction`: ok
- `purpose_store_authority`: ok
- `slot_key_validation`: ok
- `object_key_derivation`: ok
- `staging_record_validation`: ok
- `neon_staging_insert`: ok
- `neon_staging_returning_map`: ok
- `neon_staging_reread`: ok
- `staging_coherence_assertion`: ok
- `staging_input_construction`: ok
- `purpose_store_authority`: ok
- `slot_key_validation`: ok
- `object_key_derivation`: ok
- `staging_record_validation`: ok
- `neon_staging_insert`: ok
- `neon_staging_returning_map`: ok
- `neon_staging_reread`: ok
- `staging_coherence_assertion`: ok
- `staging_input_construction`: ok
- `purpose_store_authority`: ok
- `slot_key_validation`: ok
- `object_key_derivation`: ok
- `staging_record_validation`: ok
- `neon_staging_insert`: failed reasonId=neon_staging_insert_failed

## Notes

- Uses the same single-materialization fixture as the official matrix.
- Stages manifest, asset_bundle_record, and asset_bytes in canonical order.
- Stops before R2 upload, reconciliation, promotion, outbox, or enqueue.
- Safe with active workers — no queued job or dispatch intent created.
- Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.
