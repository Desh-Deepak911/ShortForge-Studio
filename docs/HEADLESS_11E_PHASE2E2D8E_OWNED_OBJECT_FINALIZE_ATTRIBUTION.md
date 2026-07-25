# Sprint 11E Phase 2E.2D.8E — Owned-object finalize attribution authority

## Production path audited

Durable staging record → R2 upload (`writeUploadStream`) → R2 HEAD/revision observation
(`readObjectMetadata`) → pre-finalize owned-object reread (`getByObjectIdAndOwner`) →
verification claim → expected `storeVersion` CAS → stream verify →
`finalizeStagingRecord` (Neon connect → transaction → UPDATE → RETURNING map) →
post-write reread → finalized metadata coherence.

## Immutable finalize substages

1. `finalize_input_construction`
2. `staging_record_reread`
3. `r2_upload`
4. `r2_revision_observation`
5. `finalize_preflight`
6. `neon_finalize_connect`
7. `neon_finalize_transaction`
8. `neon_finalize_update`
9. `neon_finalize_returning_map`
10. `neon_finalize_reread`
11. `finalized_coherence_assertion`
12. `cleanup`

## Safe attribution fields

Purpose class, store class, slot-key class/length, finalization substage, result kind,
safe control-plane code, allowlisted SQLSTATE/constraint, storeVersion delta,
durable object-stage class, R2 revision outcome class, failure boundary class, cleanup status.

## Failure boundary classes

- `provider_connection_unavailable`
- `provider_transaction_unavailable`
- `stale_cas_store_version`
- `malformed_returning_row`
- `post_write_reread_failed`
- `metadata_coherence_rejection`
- `r2_revision_unavailable`
- `r2_revision_mismatch`
- `successful_finalize`

## Targeted probe

- Gate: `HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_FINALIZE_PROBE=1`
- Command: `npm run test:headless-fly-render-owned-object-finalize-probe`
- Evidence: `docs/HEADLESS_11E_FLY_RENDER_OWNED_OBJECT_FINALIZE_PROBE.md`
- Staging Neon + staging R2 only; no Fly, Upstash, promotion, or outbox.

## Official render FAIL archive (pre-8E)

- SHA-256: `3e5dd5bb8467f7bc183a86a3cf041a5a0043bfd606ce1ff76bb252bddda9c238`
- Archive: `docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.pre-8e-owned-object-finalize-fail-3e5dd5bb….md`
- Prior attribution lacked finalize substage — `DATABASE_UNAVAILABLE` at `owned_object_finalize_failed`
  without substage boundary.

## Local finalization boundary (pre-probe)

Official matrix FAIL stops at `owned_object_staging` / `owned_object_finalize_failed` with
`safe_control_plane_code=DATABASE_UNAVAILABLE` before promotion/outbox. Exact Neon substage
was not established in archived evidence. Targeted finalize probe authorization required to
pin `neon_finalize_connect` vs `neon_finalize_transaction` vs downstream substages against live staging.
