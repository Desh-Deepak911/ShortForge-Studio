-- Sprint 11E Phase 2E.2D.8C.2 — align owned-object slot_key with canonical TypeScript authority.
-- Neon-compatible Postgres. Additive widening only; existing values preserved.
--
-- Contract choice: VARCHAR(1024) on public.headless_owned_objects.slot_key
--   - matches HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH (1024) in TypeScript;
--   - null remains valid for manifest / asset_bundle_record purposes;
--   - no truncation, rewriting, or hashing of persisted canonical hslot:v2 identity;
--   - values above 1024 remain rejected by TypeScript + application validators;
--   - purpose/store/stage/claim CHECK constraints from 004 are unchanged.
--
-- Safe for existing data: ALTER COLUMN TYPE widens VARCHAR(128) → VARCHAR(1024).
-- No table recreation, no destructive rewrite.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

ALTER TABLE public.headless_owned_objects
  ALTER COLUMN slot_key TYPE VARCHAR(1024);
