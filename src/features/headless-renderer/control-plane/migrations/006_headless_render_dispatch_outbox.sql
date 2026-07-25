-- Sprint 11E Phase 2E.2B.2 — durable render-dispatch outbox
-- Neon-compatible Postgres. Private control-plane authority only —
-- never projected into creator API JSON, public views, or diagnostics.
--
-- One immutable semantic dispatch identity per (job_id, attempt) with a
-- stable delivery_id. Broker XADD is not promotion; this table is the
-- recoverable dispatch-intent authority that prevents periodic XADD amplification.
--
-- Objects are schema-qualified to public; search_path must not be trusted.
-- No URL, secret, payload body, storage locator, or provider diagnostic columns.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.headless_render_dispatch_outbox (
  dispatch_id VARCHAR(256) NOT NULL,
  version INTEGER NOT NULL,
  job_id VARCHAR(128) NOT NULL,
  attempt BIGINT NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128) NOT NULL,
  delivery_id VARCHAR(256) NOT NULL,

  state VARCHAR(32) NOT NULL,
  claim_token VARCHAR(128),
  claimed_at_ms BIGINT,

  retry_count BIGINT NOT NULL,
  next_attempt_at_ms BIGINT NOT NULL,

  store_version BIGINT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  dispatched_at_ms BIGINT,
  reject_reason_id VARCHAR(64),

  CONSTRAINT headless_render_dispatch_outbox_pkey PRIMARY KEY (dispatch_id),

  CONSTRAINT headless_render_dispatch_outbox_dispatch_id_nonempty
    CHECK (char_length(btrim(dispatch_id)) >= 8 AND char_length(dispatch_id) <= 256),
  CONSTRAINT headless_render_dispatch_outbox_job_id_nonempty
    CHECK (char_length(btrim(job_id)) > 0 AND char_length(job_id) <= 128),
  CONSTRAINT headless_render_dispatch_outbox_owner_id_nonempty
    CHECK (char_length(btrim(owner_id)) > 0 AND char_length(owner_id) <= 128),
  CONSTRAINT headless_render_dispatch_outbox_project_id_nonempty
    CHECK (char_length(btrim(project_id)) > 0 AND char_length(project_id) <= 128),
  CONSTRAINT headless_render_dispatch_outbox_delivery_id_nonempty
    CHECK (char_length(btrim(delivery_id)) >= 8 AND char_length(delivery_id) <= 256),

  CONSTRAINT headless_render_dispatch_outbox_version_valid
    CHECK (version = 1),
  CONSTRAINT headless_render_dispatch_outbox_attempt_positive
    CHECK (attempt >= 1 AND attempt <= 1000000),

  CONSTRAINT headless_render_dispatch_outbox_state_valid
    CHECK (state IN ('pending', 'claimed', 'dispatched', 'rejected')),

  CONSTRAINT headless_render_dispatch_outbox_store_version_positive
    CHECK (store_version >= 1),
  CONSTRAINT headless_render_dispatch_outbox_retry_count_nonneg
    CHECK (retry_count >= 0 AND retry_count <= 1000000),

  CONSTRAINT headless_render_dispatch_outbox_timestamps_nonneg
    CHECK (
      created_at_ms >= 0
      AND updated_at_ms >= 0
      AND next_attempt_at_ms >= 0
      AND (claimed_at_ms IS NULL OR claimed_at_ms >= 0)
      AND (dispatched_at_ms IS NULL OR dispatched_at_ms >= 0)
    ),

  CONSTRAINT headless_render_dispatch_outbox_pending_payload
    CHECK (
      state <> 'pending'
      OR (
        claim_token IS NULL
        AND claimed_at_ms IS NULL
        AND dispatched_at_ms IS NULL
        AND reject_reason_id IS NULL
      )
    ),

  CONSTRAINT headless_render_dispatch_outbox_claimed_payload
    CHECK (
      state <> 'claimed'
      OR (
        claim_token IS NOT NULL
        AND char_length(btrim(claim_token)) > 0
        AND claimed_at_ms IS NOT NULL
        AND dispatched_at_ms IS NULL
        AND reject_reason_id IS NULL
      )
    ),

  CONSTRAINT headless_render_dispatch_outbox_dispatched_payload
    CHECK (
      state <> 'dispatched'
      OR (
        claim_token IS NULL
        AND claimed_at_ms IS NULL
        AND dispatched_at_ms IS NOT NULL
        AND reject_reason_id IS NULL
      )
    ),

  CONSTRAINT headless_render_dispatch_outbox_rejected_payload
    CHECK (
      state <> 'rejected'
      OR (
        claim_token IS NULL
        AND claimed_at_ms IS NULL
        AND dispatched_at_ms IS NULL
        AND reject_reason_id IS NOT NULL
        AND char_length(btrim(reject_reason_id)) > 0
      )
    ),

  CONSTRAINT headless_render_dispatch_outbox_job_attempt_unique
    UNIQUE (job_id, attempt),

  CONSTRAINT headless_render_dispatch_outbox_delivery_id_unique
    UNIQUE (delivery_id),

  CONSTRAINT headless_render_dispatch_outbox_fk_project_owner
    FOREIGN KEY (project_id, owner_id)
    REFERENCES public.headless_project_ownership (project_id, owner_id)
);

COMMENT ON TABLE public.headless_render_dispatch_outbox IS
  'Private durable render-dispatch intents. Never project into creator API JSON.';
COMMENT ON COLUMN public.headless_render_dispatch_outbox.delivery_id IS
  'Stable render delivery identity (dlv:jobId:attempt) — immutable per job attempt.';
COMMENT ON COLUMN public.headless_render_dispatch_outbox.claim_token IS
  'Process-private outbox claim lease — never semantic job identity.';
COMMENT ON COLUMN public.headless_render_dispatch_outbox.state IS
  'pending|claimed|dispatched|rejected — dispatched stops periodic XADD.';
COMMENT ON COLUMN public.headless_render_dispatch_outbox.dispatched_at_ms IS
  'Terminal broker-dispatch confirmation timestamp — not Neon render claim authority.';

CREATE INDEX IF NOT EXISTS idx_headless_render_dispatch_outbox_due
  ON public.headless_render_dispatch_outbox (next_attempt_at_ms, dispatch_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_headless_render_dispatch_outbox_claim_recovery
  ON public.headless_render_dispatch_outbox (claimed_at_ms, dispatch_id)
  WHERE state = 'claimed' AND claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_headless_render_dispatch_outbox_owner_job
  ON public.headless_render_dispatch_outbox (owner_id, job_id);

CREATE INDEX IF NOT EXISTS idx_headless_render_dispatch_outbox_terminal
  ON public.headless_render_dispatch_outbox (owner_id, state, dispatch_id)
  WHERE state IN ('dispatched', 'rejected');
