-- Sprint 11E Phase 2B.2B.1 — durable Headless schema migration ledger
-- Neon-compatible Postgres. Runner owns the surrounding transaction.
--
-- All objects are schema-qualified to public. search_path must not be trusted.
-- Records applied migration identity + repository SHA-256 checksum.
-- Same ID + different checksum fails closed as migration drift.
--
-- No remote migration has been applied yet; checksum updates are repository-only.

CREATE TABLE IF NOT EXISTS public.headless_schema_migrations (
  migration_id VARCHAR(128) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  applied_at_ms BIGINT NOT NULL,

  CONSTRAINT headless_schema_migrations_pkey PRIMARY KEY (migration_id),
  CONSTRAINT headless_schema_migrations_id_nonempty
    CHECK (char_length(btrim(migration_id)) > 0 AND char_length(migration_id) <= 128),
  CONSTRAINT headless_schema_migrations_checksum_format
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT headless_schema_migrations_applied_at_ms_nonneg
    CHECK (applied_at_ms >= 0)
);

COMMENT ON TABLE public.headless_schema_migrations IS
  'Headless Renderer migration ledger. Applied SQL files are immutable; checksum drift fails closed.';

COMMENT ON COLUMN public.headless_schema_migrations.migration_id IS
  'Stable repository migration identity (filename without .sql).';
COMMENT ON COLUMN public.headless_schema_migrations.checksum_sha256 IS
  'Lowercase hex SHA-256 of the repository migration SQL file bytes.';
COMMENT ON COLUMN public.headless_schema_migrations.applied_at_ms IS
  'Unix epoch milliseconds when the migration was first applied.';
