-- Neon verify queue: partial index for uploaded, unclaimed staging objects.
-- Additive only. Does not rewrite 004 or owned-object columns.
-- Transaction boundary is owned by the Headless migration runner.
-- Do not wrap this file in BEGIN/COMMIT.

CREATE INDEX IF NOT EXISTS idx_headless_owned_objects_verify_queued_unclaimed
  ON public.headless_owned_objects (uploaded_observed_at_ms, object_id)
  WHERE stage = 'staging'
    AND uploaded_observed_at_ms IS NOT NULL
    AND verification_state = 'unclaimed'
    AND verification_claim_token IS NULL;

COMMENT ON INDEX public.idx_headless_owned_objects_verify_queued_unclaimed IS
  'Neon verify claim-next: uploaded staging objects with no live verification claim.';
