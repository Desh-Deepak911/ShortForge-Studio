-- Sprint 11E Phase 2C.1 — durable owned-object metadata (Design B staging → finalize)
-- Neon-compatible Postgres. JSONB payloads are storage only — revalidate in TypeScript after read.
--
-- Objects are schema-qualified to public; search_path must not be trusted.
--
-- store_id is an opaque bucket role ("assets" | "artifacts") — never the raw bucket name.
-- object_key is private storage identity — never returned in creator diagnostics.
-- No presigned URL columns. No capability URL persistence.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.headless_owned_objects (
  object_id VARCHAR(128) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128) NOT NULL,
  job_id VARCHAR(128) NOT NULL,
  operation_id VARCHAR(128) NOT NULL,

  purpose VARCHAR(32) NOT NULL,
  slot_key VARCHAR(128),

  stage VARCHAR(32) NOT NULL,
  store_id VARCHAR(32) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  store_version BIGINT NOT NULL,

  expected_content_digest_claim VARCHAR(80) NOT NULL,
  expected_byte_length BIGINT NOT NULL,
  expected_mime_type VARCHAR(128) NOT NULL,

  content_digest VARCHAR(80),
  byte_length BIGINT,
  mime_type VARCHAR(128),

  upload_capability_issued_at_ms BIGINT NOT NULL,
  upload_capability_expires_at_ms BIGINT NOT NULL,
  uploaded_observed_at_ms BIGINT,

  verification_state VARCHAR(32) NOT NULL,
  verification_claim_token VARCHAR(128),
  verification_claimed_at_ms BIGINT,

  verified_at_ms BIGINT,
  expires_at_ms BIGINT,

  finalized_metadata JSONB,
  terminal_reason JSONB,

  cleanup_scheduled_at_ms BIGINT,

  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,

  CONSTRAINT headless_owned_objects_pkey PRIMARY KEY (object_id),

  CONSTRAINT headless_owned_objects_object_id_nonempty
    CHECK (char_length(btrim(object_id)) > 0 AND char_length(object_id) <= 128),
  CONSTRAINT headless_owned_objects_owner_id_nonempty
    CHECK (char_length(btrim(owner_id)) > 0 AND char_length(owner_id) <= 128),
  CONSTRAINT headless_owned_objects_project_id_nonempty
    CHECK (char_length(btrim(project_id)) > 0 AND char_length(project_id) <= 128),
  CONSTRAINT headless_owned_objects_job_id_nonempty
    CHECK (char_length(btrim(job_id)) > 0 AND char_length(job_id) <= 128),
  CONSTRAINT headless_owned_objects_operation_id_nonempty
    CHECK (char_length(btrim(operation_id)) > 0 AND char_length(operation_id) <= 128),

  CONSTRAINT headless_owned_objects_purpose_valid
    CHECK (purpose IN ('manifest', 'asset_bundle_record', 'asset_bytes', 'artifact')),

  CONSTRAINT headless_owned_objects_store_id_valid
    CHECK (store_id IN ('assets', 'artifacts')),

  CONSTRAINT headless_owned_objects_store_purpose_coherent
    CHECK (
      (purpose = 'artifact' AND store_id = 'artifacts')
      OR (purpose <> 'artifact' AND store_id = 'assets')
    ),

  CONSTRAINT headless_owned_objects_object_key_nonempty
    CHECK (
      char_length(btrim(object_key)) > 0
      AND char_length(object_key) <= 1024
      AND position('..' in object_key) = 0
    ),

  CONSTRAINT headless_owned_objects_store_version_positive
    CHECK (store_version >= 1),

  CONSTRAINT headless_owned_objects_digest_claim_format
    CHECK (expected_content_digest_claim ~ '^sha256:[0-9a-f]{64}$'),

  CONSTRAINT headless_owned_objects_expected_length_positive
    CHECK (expected_byte_length >= 1),

  CONSTRAINT headless_owned_objects_expected_mime_nonempty
    CHECK (char_length(btrim(expected_mime_type)) > 0 AND char_length(expected_mime_type) <= 128),

  CONSTRAINT headless_owned_objects_timestamps_nonneg
    CHECK (
      created_at_ms >= 0
      AND updated_at_ms >= 0
      AND updated_at_ms >= created_at_ms
      AND upload_capability_issued_at_ms >= 0
      AND upload_capability_expires_at_ms >= 0
      AND (uploaded_observed_at_ms IS NULL OR uploaded_observed_at_ms >= 0)
      AND (verified_at_ms IS NULL OR verified_at_ms >= 0)
      AND (expires_at_ms IS NULL OR expires_at_ms >= 0)
      AND (cleanup_scheduled_at_ms IS NULL OR cleanup_scheduled_at_ms >= 0)
    ),

  CONSTRAINT headless_owned_objects_stage_valid
    CHECK (stage IN ('staging', 'finalized', 'rejected', 'cleanup_pending')),

  CONSTRAINT headless_owned_objects_verification_state_valid
    CHECK (verification_state IN ('unclaimed', 'claimed', 'failed', 'verified')),

  -- Staging: untrusted claims only; no trusted facts
  CONSTRAINT headless_owned_objects_staging_payload
    CHECK (
      stage <> 'staging'
      OR (
        verification_state IN ('unclaimed', 'claimed', 'failed')
        AND content_digest IS NULL
        AND byte_length IS NULL
        AND mime_type IS NULL
        AND verified_at_ms IS NULL
        AND finalized_metadata IS NULL
        AND terminal_reason IS NULL
        AND cleanup_scheduled_at_ms IS NULL
      )
    ),

  -- Finalized: trusted facts required; claims retained historically
  CONSTRAINT headless_owned_objects_finalized_payload
    CHECK (
      stage <> 'finalized'
      OR (
        verification_state = 'verified'
        AND content_digest IS NOT NULL
        AND content_digest ~ '^sha256:[0-9a-f]{64}$'
        AND content_digest = expected_content_digest_claim
        AND byte_length IS NOT NULL
        AND byte_length = expected_byte_length
        AND mime_type IS NOT NULL
        AND mime_type = expected_mime_type
        AND verified_at_ms IS NOT NULL
        AND expires_at_ms IS NOT NULL
        AND finalized_metadata IS NOT NULL
        AND terminal_reason IS NULL
        AND cleanup_scheduled_at_ms IS NULL
        AND verification_claim_token IS NULL
        AND verification_claimed_at_ms IS NULL
      )
    ),

  -- Rejected: terminal fail-closed
  CONSTRAINT headless_owned_objects_rejected_payload
    CHECK (
      stage <> 'rejected'
      OR (
        verification_state = 'failed'
        AND content_digest IS NULL
        AND byte_length IS NULL
        AND mime_type IS NULL
        AND verified_at_ms IS NULL
        AND finalized_metadata IS NULL
        AND terminal_reason IS NOT NULL
        AND cleanup_scheduled_at_ms IS NULL
        AND verification_claim_token IS NULL
        AND verification_claimed_at_ms IS NULL
      )
    ),

  -- Cleanup pending: scheduled orphan cleanup
  CONSTRAINT headless_owned_objects_cleanup_pending_payload
    CHECK (
      stage <> 'cleanup_pending'
      OR (
        verification_state = 'failed'
        AND content_digest IS NULL
        AND byte_length IS NULL
        AND mime_type IS NULL
        AND verified_at_ms IS NULL
        AND finalized_metadata IS NULL
        AND terminal_reason IS NOT NULL
        AND cleanup_scheduled_at_ms IS NOT NULL
        AND verification_claim_token IS NULL
        AND verification_claimed_at_ms IS NULL
      )
    ),

  -- Verification claim pairing
  CONSTRAINT headless_owned_objects_verification_claim_paired
    CHECK (
      (verification_claim_token IS NULL AND verification_claimed_at_ms IS NULL)
      OR (
        verification_claim_token IS NOT NULL
        AND verification_claimed_at_ms IS NOT NULL
        AND char_length(btrim(verification_claim_token)) > 0
        AND verification_claimed_at_ms >= created_at_ms
      )
    ),

  -- Claimed state requires claim pair
  CONSTRAINT headless_owned_objects_claimed_requires_token
    CHECK (
      verification_state <> 'claimed'
      OR (
        verification_claim_token IS NOT NULL
        AND verification_claimed_at_ms IS NOT NULL
      )
    ),

  -- Unclaimed / verified / failed clear claim pair (failed staging may clear)
  CONSTRAINT headless_owned_objects_unclaimed_clears_token
    CHECK (
      verification_state <> 'unclaimed'
      OR (
        verification_claim_token IS NULL
        AND verification_claimed_at_ms IS NULL
      )
    ),

  CONSTRAINT headless_owned_objects_unique_object_identity
    UNIQUE (store_id, object_key),

  -- Composite membership: object must match BOTH project_id and owner_id of ownership row.
  CONSTRAINT headless_owned_objects_fk_project_owner
    FOREIGN KEY (project_id, owner_id)
    REFERENCES public.headless_project_ownership (project_id, owner_id)
);

COMMENT ON TABLE public.headless_owned_objects IS
  'Durable owned-object metadata for Design B staging/finalize. CAS on store_version. No presigned URLs.';

COMMENT ON COLUMN public.headless_owned_objects.store_id IS
  'Opaque bucket role (assets|artifacts) — never raw bucket name.';
COMMENT ON COLUMN public.headless_owned_objects.object_key IS
  'Private storage key — never returned in creator diagnostics.';
COMMENT ON COLUMN public.headless_owned_objects.finalized_metadata IS
  'Trusted finalize metadata JSON (verifiedBy/sourceStage). Untrusted — revalidate after read.';
COMMENT ON COLUMN public.headless_owned_objects.terminal_reason IS
  'Bounded terminal reason code JSON for rejected/cleanup_pending. Never provider messages.';

-- Job coverage scans (owner + job)
CREATE INDEX IF NOT EXISTS idx_headless_owned_objects_owner_job
  ON public.headless_owned_objects (owner_id, job_id);

-- Verifier claim recovery
CREATE INDEX IF NOT EXISTS idx_headless_owned_objects_verification_claims
  ON public.headless_owned_objects (verification_claimed_at_ms, object_id)
  WHERE verification_claim_token IS NOT NULL
    AND stage = 'staging';

-- Expiry / cleanup sweeps
CREATE INDEX IF NOT EXISTS idx_headless_owned_objects_expiry_cleanup
  ON public.headless_owned_objects (expires_at_ms, object_id)
  WHERE stage IN ('staging', 'finalized')
    AND expires_at_ms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_headless_owned_objects_cleanup_pending
  ON public.headless_owned_objects (cleanup_scheduled_at_ms, object_id)
  WHERE stage = 'cleanup_pending';
