-- Sprint 11E Phase 2B.1B — project ownership (first-claim, immutable, UUID v4)
-- Neon-compatible Postgres. Apply manually; not executed at runtime in Phase 2B.1B.
--
-- Objects are schema-qualified to public; search_path must not be trusted.
--
-- Composite uniqueness on (project_id, owner_id) lets jobs prove both project and
-- owner membership via a composite foreign key. project_id remains the primary key
-- (one owner per project). Ownership is immutable after first claim.
--
-- project_id must be lowercase RFC 4122 UUID v4 (crypto.randomUUID() form) so
-- direct SQL writes cannot bypass first-claim identity authority.
--
-- Future migration seam: already-owned legacy (non-UUID) project IDs require an
-- explicit ownership migration — not invented by first-claim.
--
-- Transaction boundary is owned by the Headless migration runner
-- (BEGIN → work → COMMIT|ROLLBACK). Do not wrap this file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.headless_project_ownership (
  project_id VARCHAR(128) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  created_at_ms BIGINT NOT NULL,

  CONSTRAINT headless_project_ownership_pkey PRIMARY KEY (project_id),
  CONSTRAINT headless_project_ownership_project_owner_unique
    UNIQUE (project_id, owner_id),
  CONSTRAINT headless_project_ownership_project_id_nonempty
    CHECK (char_length(btrim(project_id)) > 0 AND char_length(project_id) <= 128),
  -- Lowercase UUID v4 only: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
  CONSTRAINT headless_project_ownership_project_id_uuid_v4
    CHECK (
      project_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT headless_project_ownership_owner_id_nonempty
    CHECK (char_length(btrim(owner_id)) > 0 AND char_length(owner_id) <= 128),
  CONSTRAINT headless_project_ownership_created_at_ms_nonneg
    CHECK (created_at_ms >= 0)
);

COMMENT ON TABLE public.headless_project_ownership IS
  'First-authenticated claim binds local projectId to server ownerId. Ownership is immutable. UNIQUE (project_id, owner_id) supports composite FK from headless_jobs.';

COMMENT ON COLUMN public.headless_project_ownership.project_id IS
  'Production first-claim requires lowercase UUID v4 (crypto.randomUUID()). Never reassigned after first claim. Enforced by headless_project_ownership_project_id_uuid_v4.';
COMMENT ON COLUMN public.headless_project_ownership.owner_id IS
  'Authenticated principal owner id (e.g. Clerk userId). Set once at first claim. Never supplied by client JSON.';
COMMENT ON COLUMN public.headless_project_ownership.created_at_ms IS
  'Unix epoch milliseconds when ownership was first bound.';

-- Lookup by owner for maintenance / audit scans.
CREATE INDEX IF NOT EXISTS idx_headless_project_ownership_owner_id
  ON public.headless_project_ownership (owner_id);

-- Reject owner_id reassignment — ownership is permanent for a project_id.
CREATE OR REPLACE FUNCTION public.headless_project_ownership_reject_owner_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'headless_project_ownership: owner_id is immutable for project_id %', OLD.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'headless_project_ownership: project_id is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_headless_project_ownership_immutable ON public.headless_project_ownership;
CREATE TRIGGER trg_headless_project_ownership_immutable
  BEFORE UPDATE ON public.headless_project_ownership
  FOR EACH ROW
  EXECUTE FUNCTION public.headless_project_ownership_reject_owner_change();
