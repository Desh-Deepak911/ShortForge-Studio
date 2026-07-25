-- Sprint 11E Phase 2E.2A / 2E.2A.1 / 2E.2A.3 — durable orphan-artifact cleanup intents
-- Neon-compatible Postgres. Locator/digest columns are storage only —
-- revalidate in TypeScript after every read.
--
-- Objects are schema-qualified to public; search_path must not be trusted.
-- store_id is an opaque bucket role — never the raw bucket name.
-- object_key is private storage identity — never returned in creator diagnostics.
-- object_id binds the intent to durable owned-object identity (004).
-- Terminal states: completed (delete confirmed), protected/rejected (no-delete).
-- No capability tokens as semantic identity. No URL columns.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.headless_cleanup_intents (
  cleanup_id VARCHAR(512) NOT NULL,
  version INTEGER NOT NULL,
  job_id VARCHAR(128) NOT NULL,
  attempt BIGINT NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128) NOT NULL,
  object_id VARCHAR(128) NOT NULL,

  locator_kind VARCHAR(32) NOT NULL,
  store_id VARCHAR(128) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,

  content_digest VARCHAR(80) NOT NULL,
  reason_id VARCHAR(64) NOT NULL,

  state VARCHAR(32) NOT NULL,
  claim_token VARCHAR(128),
  claimed_at_ms BIGINT,

  expires_at_ms BIGINT NOT NULL,
  store_version BIGINT NOT NULL,
  idempotency_key VARCHAR(512) NOT NULL,

  created_at_ms BIGINT NOT NULL,
  completed_at_ms BIGINT,

  CONSTRAINT headless_cleanup_intents_pkey PRIMARY KEY (cleanup_id),

  CONSTRAINT headless_cleanup_intents_cleanup_id_nonempty
    CHECK (char_length(btrim(cleanup_id)) >= 8 AND char_length(cleanup_id) <= 512),
  CONSTRAINT headless_cleanup_intents_job_id_nonempty
    CHECK (char_length(btrim(job_id)) > 0 AND char_length(job_id) <= 128),
  CONSTRAINT headless_cleanup_intents_owner_id_nonempty
    CHECK (char_length(btrim(owner_id)) > 0 AND char_length(owner_id) <= 128),
  CONSTRAINT headless_cleanup_intents_project_id_nonempty
    CHECK (char_length(btrim(project_id)) > 0 AND char_length(project_id) <= 128),
  CONSTRAINT headless_cleanup_intents_object_id_nonempty
    CHECK (char_length(btrim(object_id)) > 0 AND char_length(object_id) <= 128),

  CONSTRAINT headless_cleanup_intents_version_valid
    CHECK (version = 1),
  CONSTRAINT headless_cleanup_intents_attempt_positive
    CHECK (attempt >= 1 AND attempt <= 1000000),

  CONSTRAINT headless_cleanup_intents_locator_kind_valid
    CHECK (locator_kind = 'object_storage'),
  CONSTRAINT headless_cleanup_intents_store_id_valid
    CHECK (store_id IN ('assets', 'artifacts')),
  CONSTRAINT headless_cleanup_intents_object_key_nonempty
    CHECK (char_length(btrim(object_key)) > 0 AND char_length(object_key) <= 1024),

  CONSTRAINT headless_cleanup_intents_digest_format
    CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT headless_cleanup_intents_reason_valid
    CHECK (reason_id IN (
      'SUCCEEDED_CAS_STALE',
      'SUCCEEDED_CAS_TERMINAL_LOCKED',
      'SUCCEEDED_CAS_THROWN',
      'SUCCEEDED_CAS_REJECTED',
      'BINDING_VALIDATION_FAILED',
      'UPLOAD_SESSION_ORPHAN'
    )),

  CONSTRAINT headless_cleanup_intents_state_valid
    CHECK (state IN ('pending', 'claimed', 'completed', 'protected', 'rejected')),

  CONSTRAINT headless_cleanup_intents_store_version_positive
    CHECK (store_version >= 1),

  CONSTRAINT headless_cleanup_intents_idempotency_nonempty
    CHECK (char_length(btrim(idempotency_key)) >= 8 AND char_length(idempotency_key) <= 512),

  CONSTRAINT headless_cleanup_intents_timestamps_nonneg
    CHECK (
      created_at_ms >= 0
      AND expires_at_ms >= 0
      AND (claimed_at_ms IS NULL OR claimed_at_ms >= 0)
      AND (completed_at_ms IS NULL OR completed_at_ms >= 0)
    ),

  CONSTRAINT headless_cleanup_intents_pending_payload
    CHECK (
      state <> 'pending'
      OR (
        claim_token IS NULL
        AND claimed_at_ms IS NULL
        AND completed_at_ms IS NULL
      )
    ),

  CONSTRAINT headless_cleanup_intents_claimed_payload
    CHECK (
      state <> 'claimed'
      OR (
        claim_token IS NOT NULL
        AND char_length(btrim(claim_token)) > 0
        AND claimed_at_ms IS NOT NULL
        AND completed_at_ms IS NULL
      )
    ),

  CONSTRAINT headless_cleanup_intents_completed_payload
    CHECK (
      state <> 'completed'
      OR (
        claim_token IS NULL
        AND completed_at_ms IS NOT NULL
      )
    ),

  CONSTRAINT headless_cleanup_intents_protected_payload
    CHECK (
      state <> 'protected'
      OR (
        claim_token IS NULL
        AND completed_at_ms IS NOT NULL
      )
    ),

  CONSTRAINT headless_cleanup_intents_rejected_payload
    CHECK (
      state <> 'rejected'
      OR (
        claim_token IS NULL
        AND completed_at_ms IS NOT NULL
      )
    ),

  CONSTRAINT headless_cleanup_intents_idempotency_unique
    UNIQUE (idempotency_key),

  CONSTRAINT headless_cleanup_intents_fk_project_owner
    FOREIGN KEY (project_id, owner_id)
    REFERENCES public.headless_project_ownership (project_id, owner_id)
);

COMMENT ON TABLE public.headless_cleanup_intents IS
  'Private durable orphan-artifact cleanup intents. Never project into creator API JSON.';
COMMENT ON COLUMN public.headless_cleanup_intents.object_id IS
  'Durable owned-object identity — cleanup must re-check job/artifact state at execution.';
COMMENT ON COLUMN public.headless_cleanup_intents.store_id IS
  'Opaque bucket role (assets|artifacts) — never the raw bucket name.';
COMMENT ON COLUMN public.headless_cleanup_intents.object_key IS
  'Private object key — never returned in creator diagnostics.';
COMMENT ON COLUMN public.headless_cleanup_intents.claim_token IS
  'Process-private claim lease token — never semantic object identity.';
COMMENT ON COLUMN public.headless_cleanup_intents.state IS
  'pending|claimed|completed|protected|rejected — protected/rejected are terminal no-delete.';
COMMENT ON COLUMN public.headless_cleanup_intents.completed_at_ms IS
  'Terminal resolution timestamp for completed|protected|rejected — not proof of R2 delete for no-delete states.';

CREATE INDEX IF NOT EXISTS idx_headless_cleanup_intents_owner_retryable
  ON public.headless_cleanup_intents (owner_id, created_at_ms, cleanup_id)
  WHERE state IN ('pending', 'claimed');

CREATE INDEX IF NOT EXISTS idx_headless_cleanup_intents_claim_recovery
  ON public.headless_cleanup_intents (claimed_at_ms, cleanup_id)
  WHERE state = 'claimed' AND claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_headless_cleanup_intents_owner_job
  ON public.headless_cleanup_intents (owner_id, job_id);

CREATE INDEX IF NOT EXISTS idx_headless_cleanup_intents_object_id
  ON public.headless_cleanup_intents (object_id);

CREATE INDEX IF NOT EXISTS idx_headless_cleanup_intents_owner_terminal
  ON public.headless_cleanup_intents (owner_id, state, cleanup_id)
  WHERE state IN ('completed', 'protected', 'rejected');
