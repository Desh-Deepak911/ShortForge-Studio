-- Durable export maintenance sweep lease and aggregate maintenance health.
-- Additive only: does not rewrite job or owned-object rows.

CREATE TABLE IF NOT EXISTS public.headless_export_maintenance_leases (
  scope TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  holder_class TEXT NOT NULL,
  claimed_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  renewed_at_ms BIGINT,
  release_state TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT headless_export_maintenance_leases_pkey PRIMARY KEY (scope),
  CONSTRAINT headless_export_maintenance_leases_scope_valid
    CHECK (scope IN ('export_cleanup_global')),
  CONSTRAINT headless_export_maintenance_leases_token_nonempty
    CHECK (length(trim(lease_token)) > 0),
  CONSTRAINT headless_export_maintenance_leases_holder_nonempty
    CHECK (length(trim(holder_class)) > 0),
  CONSTRAINT headless_export_maintenance_leases_holder_class_bounded
    CHECK (length(holder_class) <= 64),
  CONSTRAINT headless_export_maintenance_leases_timestamps_nonneg
    CHECK (claimed_at_ms >= 0 AND expires_at_ms >= 0),
  CONSTRAINT headless_export_maintenance_leases_renewed_nonneg
    CHECK (renewed_at_ms IS NULL OR renewed_at_ms >= 0),
  CONSTRAINT headless_export_maintenance_leases_release_state_valid
    CHECK (release_state IN ('active', 'released')),
  CONSTRAINT headless_export_maintenance_leases_expires_after_claim
    CHECK (expires_at_ms >= claimed_at_ms)
);

CREATE TABLE IF NOT EXISTS public.headless_export_maintenance_state (
  scope TEXT NOT NULL,
  last_success_at_ms BIGINT,
  last_failure_at_ms BIGINT,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  lease_contention_count INTEGER NOT NULL DEFAULT 0,
  provider_deletion_success_count INTEGER NOT NULL DEFAULT 0,
  provider_deletion_failure_count INTEGER NOT NULL DEFAULT 0,
  unsafe_deletion_rejection_count INTEGER NOT NULL DEFAULT 0,
  project_source_deletion_attempt_count INTEGER NOT NULL DEFAULT 0,
  cleanup_backlog_count INTEGER NOT NULL DEFAULT 0,
  oldest_pending_cleanup_age_class TEXT NOT NULL DEFAULT 'none',
  cursor_owner_id TEXT,
  cursor_last_object_id TEXT,
  cursor_fence_token TEXT,
  updated_at_ms BIGINT NOT NULL,
  CONSTRAINT headless_export_maintenance_state_pkey PRIMARY KEY (scope),
  CONSTRAINT headless_export_maintenance_state_scope_valid
    CHECK (scope IN ('export_cleanup_global')),
  CONSTRAINT headless_export_maintenance_state_counts_nonneg
    CHECK (
      consecutive_failure_count >= 0
      AND lease_contention_count >= 0
      AND provider_deletion_success_count >= 0
      AND provider_deletion_failure_count >= 0
      AND unsafe_deletion_rejection_count >= 0
      AND project_source_deletion_attempt_count >= 0
      AND cleanup_backlog_count >= 0
    ),
  CONSTRAINT headless_export_maintenance_state_age_class_valid
    CHECK (oldest_pending_cleanup_age_class IN ('none', 'minutes', 'hours', 'days')),
  CONSTRAINT headless_export_maintenance_state_cursor_owner_bounded
    CHECK (cursor_owner_id IS NULL OR length(cursor_owner_id) <= 128),
  CONSTRAINT headless_export_maintenance_state_cursor_object_bounded
    CHECK (cursor_last_object_id IS NULL OR length(cursor_last_object_id) <= 128),
  CONSTRAINT headless_export_maintenance_state_cursor_fence_bounded
    CHECK (cursor_fence_token IS NULL OR length(cursor_fence_token) <= 128),
  CONSTRAINT headless_export_maintenance_state_updated_nonneg
    CHECK (updated_at_ms >= 0)
);

COMMENT ON TABLE public.headless_export_maintenance_leases IS
  'Exclusive maintenance sweep lease with fencing token for staging export cleanup batches.';
COMMENT ON TABLE public.headless_export_maintenance_state IS
  'Aggregate maintenance health counters and cursor fencing for export cleanup sweeps.';
