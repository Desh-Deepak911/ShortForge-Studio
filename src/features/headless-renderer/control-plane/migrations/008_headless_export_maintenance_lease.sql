-- Durable export maintenance sweep lease (single global row per scope).
-- Prevents overlapping cleanup batches across verify-worker instances.

CREATE TABLE IF NOT EXISTS public.headless_export_maintenance_leases (
  scope TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  holder_class TEXT NOT NULL,
  claimed_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  CONSTRAINT headless_export_maintenance_leases_pkey PRIMARY KEY (scope),
  CONSTRAINT headless_export_maintenance_leases_scope_valid
    CHECK (scope IN ('export_cleanup_global')),
  CONSTRAINT headless_export_maintenance_leases_token_nonempty
    CHECK (length(trim(lease_token)) > 0),
  CONSTRAINT headless_export_maintenance_leases_holder_nonempty
    CHECK (length(trim(holder_class)) > 0),
  CONSTRAINT headless_export_maintenance_leases_timestamps_nonneg
    CHECK (claimed_at_ms >= 0 AND expires_at_ms >= 0)
);

COMMENT ON TABLE public.headless_export_maintenance_leases IS
  'Exclusive maintenance sweep lease for staging export cleanup batches.';
