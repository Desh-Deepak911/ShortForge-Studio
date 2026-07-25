-- Sprint 11E Phase 2B.1B — discriminated provisional/canonical job store
-- Neon-compatible Postgres. JSONB payloads are storage only — revalidate in TypeScript after read.
--
-- Objects are schema-qualified to public; search_path must not be trusted.
--
-- operation_id: private operation lineage. Required for BOTH stages.
--   - Provisional: creator operation identity
--   - Canonical: preserved across promotion; legacy canonical creates must
--     supply an explicit operationId from creation authority (no invented fallback)
--
-- Denormalized column `state`:
--   - Provisional: authoritative provisional lifecycle state (materializing/failed/…)
--     The provisional JSONB payload does NOT duplicate state; column state is source.
--   - Canonical: MUST equal canonical_job->>'state' (enforced by CHECK constraint).
-- JSONB remains untrusted and must be revalidated after every read.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.headless_jobs (
  job_id VARCHAR(128) NOT NULL,
  stage VARCHAR(16) NOT NULL,
  state VARCHAR(32) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128) NOT NULL,
  store_version BIGINT NOT NULL,
  operation_id VARCHAR(128) NOT NULL,
  idempotency_authority_key VARCHAR(128) NOT NULL,
  creator_idempotency_key VARCHAR(128),

  requested_renderer_profile JSONB,
  requested_renderer_build_id VARCHAR(128),

  provisional JSONB,
  canonical_job JSONB,
  canonical_request JSONB,

  claim_token VARCHAR(128),
  claimed_at_ms BIGINT,

  artifact_object_binding JSONB,

  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT,

  terminal_reason JSONB,

  verification_claim_token VARCHAR(128),
  verification_claimed_at_ms BIGINT,

  CONSTRAINT headless_jobs_pkey PRIMARY KEY (job_id),

  CONSTRAINT headless_jobs_job_id_nonempty
    CHECK (char_length(btrim(job_id)) > 0 AND char_length(job_id) <= 128),
  CONSTRAINT headless_jobs_owner_id_nonempty
    CHECK (char_length(btrim(owner_id)) > 0 AND char_length(owner_id) <= 128),
  CONSTRAINT headless_jobs_project_id_nonempty
    CHECK (char_length(btrim(project_id)) > 0 AND char_length(project_id) <= 128),
  CONSTRAINT headless_jobs_operation_id_nonempty
    CHECK (char_length(btrim(operation_id)) > 0 AND char_length(operation_id) <= 128),
  CONSTRAINT headless_jobs_idempotency_key_format
    CHECK (
      idempotency_authority_key ~ '^hid:sha256:[0-9a-f]{64}$'
      AND char_length(idempotency_authority_key) <= 128
    ),

  CONSTRAINT headless_jobs_store_version_positive
    CHECK (store_version >= 1),

  CONSTRAINT headless_jobs_timestamps_nonneg
    CHECK (
      created_at_ms >= 0
      AND updated_at_ms >= 0
      AND updated_at_ms >= created_at_ms
      AND (expires_at_ms IS NULL OR expires_at_ms > created_at_ms)
    ),

  CONSTRAINT headless_jobs_stage_valid
    CHECK (stage IN ('provisional', 'canonical')),

  -- Provisional namespace states
  CONSTRAINT headless_jobs_provisional_state_valid
    CHECK (
      stage <> 'provisional'
      OR state IN ('materializing', 'failed', 'cancelled', 'expired')
    ),

  -- Canonical lifecycle states (denormalized from canonical_job.state for indexing)
  CONSTRAINT headless_jobs_canonical_state_valid
    CHECK (
      stage <> 'canonical'
      OR state IN (
        'created', 'materializing', 'queued', 'rendering', 'encoding',
        'validating', 'uploading', 'succeeded', 'failed', 'cancelled', 'expired'
      )
    ),

  -- Fail-closed: denormalized column state must equal canonical_job JSON state.
  -- Rejects rows where SQL state disagrees with canonical_job->>'state'.
  CONSTRAINT headless_jobs_canonical_state_matches_json
    CHECK (
      stage <> 'canonical'
      OR (
        jsonb_typeof(canonical_job) = 'object'
        AND jsonb_typeof(canonical_job -> 'state') = 'string'
        AND (canonical_job ->> 'state') = state
      )
    ),

  -- Stage / payload discrimination — never mixed provisional + canonical JSON
  CONSTRAINT headless_jobs_provisional_payload_only
    CHECK (
      stage <> 'provisional'
      OR (
        provisional IS NOT NULL
        AND canonical_job IS NULL
        AND canonical_request IS NULL
        AND artifact_object_binding IS NULL
        AND claim_token IS NULL
        AND claimed_at_ms IS NULL
      )
    ),

  CONSTRAINT headless_jobs_canonical_payload_required
    CHECK (
      stage <> 'canonical'
      OR (
        provisional IS NULL
        AND canonical_job IS NOT NULL
        AND canonical_request IS NOT NULL
      )
    ),

  -- Provisional must carry requested output selection and creator idempotency key
  CONSTRAINT headless_jobs_provisional_requested_output
    CHECK (
      stage <> 'provisional'
      OR (
        requested_renderer_profile IS NOT NULL
        AND requested_renderer_build_id IS NOT NULL
        AND char_length(btrim(requested_renderer_build_id)) > 0
        AND creator_idempotency_key IS NOT NULL
        AND char_length(btrim(creator_idempotency_key)) > 0
        AND expires_at_ms IS NOT NULL
      )
    ),

  -- Canonical rows do not use provisional-only columns
  CONSTRAINT headless_jobs_canonical_no_provisional_columns
    CHECK (
      stage <> 'canonical'
      OR (
        provisional IS NULL
        AND requested_renderer_profile IS NULL
        AND requested_renderer_build_id IS NULL
        AND creator_idempotency_key IS NULL
        AND expires_at_ms IS NULL
        AND verification_claim_token IS NULL
        AND verification_claimed_at_ms IS NULL
      )
    ),

  -- Render claim pairing (canonical only)
  CONSTRAINT headless_jobs_render_claim_paired
    CHECK (
      (claim_token IS NULL AND claimed_at_ms IS NULL)
      OR (
        claim_token IS NOT NULL
        AND claimed_at_ms IS NOT NULL
        AND char_length(btrim(claim_token)) > 0
        AND claimed_at_ms >= created_at_ms
      )
    ),

  -- Provisional verification claim pairing
  CONSTRAINT headless_jobs_verification_claim_paired
    CHECK (
      (verification_claim_token IS NULL AND verification_claimed_at_ms IS NULL)
      OR (
        verification_claim_token IS NOT NULL
        AND verification_claimed_at_ms IS NOT NULL
        AND char_length(btrim(verification_claim_token)) > 0
        AND verification_claimed_at_ms >= created_at_ms
      )
    ),

  -- Provisional records never carry render claims
  CONSTRAINT headless_jobs_provisional_no_render_claim
    CHECK (
      stage <> 'provisional'
      OR (claim_token IS NULL AND claimed_at_ms IS NULL)
    ),

  -- Binding only on succeeded canonical jobs; non-succeeded must not persist binding
  CONSTRAINT headless_jobs_binding_state_rules
    CHECK (
      stage <> 'canonical'
      OR (
        (state = 'succeeded' AND artifact_object_binding IS NOT NULL)
        OR (state <> 'succeeded' AND artifact_object_binding IS NULL)
      )
    ),

  -- Terminal reason pairing with provisional terminal states
  CONSTRAINT headless_jobs_provisional_terminal_reason
    CHECK (
      stage <> 'provisional'
      OR (
        (state = 'materializing' AND terminal_reason IS NULL)
        OR (state IN ('failed', 'cancelled', 'expired') AND terminal_reason IS NOT NULL)
      )
    ),

  -- Composite membership: job must match BOTH project_id and owner_id of ownership row.
  -- Rejects insert with correct project_id but wrong owner_id.
  CONSTRAINT headless_jobs_fk_project_owner
    FOREIGN KEY (project_id, owner_id)
    REFERENCES public.headless_project_ownership (project_id, owner_id)
);

COMMENT ON TABLE public.headless_jobs IS
  'Discriminated provisional/canonical stored job authority. CAS on store_version.';

COMMENT ON COLUMN public.headless_jobs.provisional IS
  'Provisional-only JSONB (snapshotClaim, stagingObjectRefs, verificationCoverage, progress). Untrusted — revalidate after read.';
COMMENT ON COLUMN public.headless_jobs.canonical_job IS
  'HeadlessRenderJobV1 JSON when stage=canonical. Untrusted — revalidate after read.';
COMMENT ON COLUMN public.headless_jobs.canonical_request IS
  'HeadlessRenderJobRequestV1 JSON when stage=canonical. Untrusted — revalidate after read.';
COMMENT ON COLUMN public.headless_jobs.artifact_object_binding IS
  'Private artifact-object binding JSON; required only when state=succeeded.';

-- Owner + job lookup (getByJobIdAndOwner)
CREATE INDEX IF NOT EXISTS idx_headless_jobs_owner_job
  ON public.headless_jobs (owner_id, job_id);

-- Project-scoped scans (ownership / cleanup)
CREATE INDEX IF NOT EXISTS idx_headless_jobs_project_id
  ON public.headless_jobs (project_id);

-- Idempotency authority uniqueness under owner + project
CREATE UNIQUE INDEX IF NOT EXISTS uidx_headless_jobs_idempotency_authority
  ON public.headless_jobs (owner_id, project_id, idempotency_authority_key);

-- Canonical queued jobs eligible for worker claim (no active render claim)
CREATE INDEX IF NOT EXISTS idx_headless_jobs_canonical_queued_unclaimed
  ON public.headless_jobs (created_at_ms, job_id)
  WHERE stage = 'canonical'
    AND state = 'queued'
    AND claim_token IS NULL;

-- Provisional materializing jobs approaching expiry (sweep / recovery)
CREATE INDEX IF NOT EXISTS idx_headless_jobs_provisional_expiry
  ON public.headless_jobs (expires_at_ms, job_id)
  WHERE stage = 'provisional'
    AND state = 'materializing';

-- Canonical jobs with active render claims (expired-claim recovery scans)
CREATE INDEX IF NOT EXISTS idx_headless_jobs_render_claim_recovery
  ON public.headless_jobs (claimed_at_ms, job_id)
  WHERE stage = 'canonical'
    AND claim_token IS NOT NULL
    AND state NOT IN ('succeeded', 'failed', 'cancelled', 'expired');

-- Terminal canonical jobs for cleanup / retention scans
CREATE INDEX IF NOT EXISTS idx_headless_jobs_canonical_terminal
  ON public.headless_jobs (updated_at_ms, job_id)
  WHERE stage = 'canonical'
    AND state IN ('succeeded', 'failed', 'cancelled', 'expired');
