# Headless CAS transaction specifications (Neon adapter — Phase 2B.2)

Exact SQL shapes for the `HeadlessJobStorePort` and `HeadlessProjectAuthorizationPort` Neon adapters. All operations use **parameterized** queries (`$1`, `$2`, …). Placeholders shown as `$name` for readability map to positional binds in implementation.

## Interactive transaction boundary (required)

Do **not** use a fictional `Pool.transaction(callback)` API. Do **not** use the HTTP `neon()` multi-query helper as a substitute for an interactive transaction.

Official interactive pattern for `@neondatabase/serverless` (see https://github.com/neondatabase/serverless):

```typescript
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  // SELECT ... FOR UPDATE
  // validated parameterized writes / CAS UPDATE ... WHERE store_version = $expected
  // reread + TypeScript revalidation of JSONB
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  // Pool/Client lifecycle remains within the serverless request.
  await pool.end();
}
```

Rules:

1. `Pool` / `Client` lifecycle remains within the serverless request boundary.
2. All queries are parameterized (`$1`, `$2`, …).
3. Row lock (`SELECT … FOR UPDATE` or `FOR NO KEY UPDATE`), validation, CAS update, and reread occur in the **same** transaction.
4. Compare `store_version` (or ownership absence) in application logic **or** inline in `UPDATE … WHERE store_version = $expected`.
5. Increment `store_version` on every successful mutation: `store_version = store_version + 1`.
6. On unique-index conflict (`23505` for idempotency), distinguish PK `job_id` collisions from semantic idempotency replay; re-read the existing row inside the same transaction for create-if-absent convergence.
7. Rehydrate rows through TypeScript validators before returning port results — JSONB is untrusted.
8. No remote Neon connection is established in Phase 2B.1A — this document is specification only.

---

## 1. Claim project if unowned

First authenticated claim binds `project_id` → `owner_id`. Same-owner reclaim is idempotent. Different owner is `FORBIDDEN` without mutation.

```sql
-- $project_id, $owner_id, $created_at_ms

INSERT INTO headless_project_ownership (project_id, owner_id, created_at_ms)
VALUES ($project_id, $owner_id, $created_at_ms)
ON CONFLICT (project_id) DO NOTHING;

SELECT project_id, owner_id, created_at_ms
FROM headless_project_ownership
WHERE project_id = $project_id
FOR SHARE;
```

Application mapping:

| Outcome | Port result |
|---------|-------------|
| Insert succeeded | `cpOk(true)` |
| Row exists, same `owner_id` | `cpOk(true)` idempotent |
| Row exists, different `owner_id` | `cpFail("FORBIDDEN", …)` |
| No row after insert+select | `cpFail("INTERNAL_ERROR", …)` |

`assertProjectAccess`:

```sql
SELECT owner_id
FROM headless_project_ownership
WHERE project_id = $project_id;
-- Compare owner_id === principal.ownerId; else FORBIDDEN
```

---

## 2. Provisional create-if-absent

Idempotency key: unique `(owner_id, project_id, idempotency_authority_key)`.

```sql
-- $idempotency_authority_key, $job_id, $owner_id, $project_id, $store_version (always 1),
-- $operation_id, $creator_idempotency_key, $state, $requested_renderer_profile::jsonb,
-- $requested_renderer_build_id, $provisional::jsonb, $created_at_ms, $updated_at_ms,
-- $expires_at_ms, $terminal_reason::jsonb (null for materializing)

INSERT INTO headless_jobs (
  job_id, stage, state, owner_id, project_id, store_version,
  operation_id, idempotency_authority_key, creator_idempotency_key,
  requested_renderer_profile, requested_renderer_build_id,
  provisional, canonical_job, canonical_request,
  claim_token, claimed_at_ms, artifact_object_binding,
  created_at_ms, updated_at_ms, expires_at_ms, terminal_reason,
  verification_claim_token, verification_claimed_at_ms
)
VALUES (
  $job_id, 'provisional', $state, $owner_id, $project_id, 1,
  $operation_id, $idempotency_authority_key, $creator_idempotency_key,
  $requested_renderer_profile, $requested_renderer_build_id,
  $provisional, NULL, NULL,
  NULL, NULL, NULL,
  $created_at_ms, $updated_at_ms, $expires_at_ms, $terminal_reason,
  NULL, NULL
)
-- uidx_headless_jobs_idempotency_authority is a UNIQUE INDEX, not a table CONSTRAINT.
-- Use a valid conflict target on the indexed columns:
ON CONFLICT (owner_id, project_id, idempotency_authority_key)
DO NOTHING
RETURNING *;
```

If `RETURNING` is empty, re-read by idempotency key:

```sql
SELECT *
FROM headless_jobs
WHERE owner_id = $owner_id
  AND project_id = $project_id
  AND idempotency_authority_key = $idempotency_authority_key
FOR SHARE;
```

Application mapping:

| Outcome | Port result |
|---------|-------------|
| Insert returned row | `{ kind: "created", record }` |
| Existing row, same provisional semantic fingerprint | `{ kind: "existing", record }` |
| Existing row, different semantics | `{ kind: "conflict", existingJobId }` |
| `23505` on `job_id` PK | `INTERNAL_ERROR` (id collision) |

Semantic fingerprint comparison remains in TypeScript (same as memory adapter).

---

## 3. Provisional compare-and-set (CAS)

```sql
-- Lock row
SELECT *
FROM headless_jobs
WHERE job_id = $job_id
  AND owner_id = $owner_id
FOR UPDATE;

-- Application checks:
--   stage = 'provisional'
--   state = 'materializing'  (else terminal_locked)
--   store_version = $expected_store_version  (else stale)
--   validate next write via validateHeadlessProvisionalStoredJobRecord

UPDATE headless_jobs
SET
  state = $next_state,
  store_version = store_version + 1,
  updated_at_ms = $updated_at_ms,
  provisional = $provisional::jsonb,
  terminal_reason = $terminal_reason::jsonb,
  verification_claim_token = $verification_claim_token,
  verification_claimed_at_ms = $verification_claimed_at_ms
WHERE job_id = $job_id
  AND owner_id = $owner_id
  AND stage = 'provisional'
  AND state = 'materializing'
  AND store_version = $expected_store_version
RETURNING *;
```

| `UPDATE` rows | Port result |
|---------------|-------------|
| 0, row now canonical | `{ kind: "already_promoted" }` |
| 0, row provisional terminal | `{ kind: "terminal_locked" }` |
| 0, version mismatch | `{ kind: "stale" }` |
| 1 | `{ kind: "updated", record }` |

---

## 4. Atomic provisional → canonical promotion

Single transaction: lock provisional row, validate coverage complete in TypeScript, then replace stage atomically.

```sql
SELECT *
FROM headless_jobs
WHERE job_id = $job_id
  AND owner_id = $owner_id
FOR UPDATE;

-- TypeScript promotion gate (same as MemoryHeadlessJobStoreAdapter):
--   stage provisional, state materializing
--   store_version = $expected_store_version
--   operation_id = $expected_operation_id
--   verification coverage complete
--   coherent.request.assetBundle.fingerprint === snapshot assetBundleFingerprintClaim

UPDATE headless_jobs
SET
  stage = 'canonical',
  state = $canonical_state,
  store_version = store_version + 1,
  updated_at_ms = $updated_at_ms,
  provisional = NULL,
  canonical_job = $canonical_job::jsonb,
  canonical_request = $canonical_request::jsonb,
  requested_renderer_profile = NULL,
  requested_renderer_build_id = NULL,
  creator_idempotency_key = NULL,
  expires_at_ms = NULL,
  terminal_reason = NULL,
  verification_claim_token = NULL,
  verification_claimed_at_ms = NULL,
  claim_token = NULL,
  claimed_at_ms = NULL,
  artifact_object_binding = NULL
WHERE job_id = $job_id
  AND owner_id = $owner_id
  AND stage = 'provisional'
  AND state = 'materializing'
  AND store_version = $expected_store_version
  AND operation_id = $expected_operation_id
RETURNING *;
```

Concurrent promotion / retry:

| Outcome | Port result |
|---------|-------------|
| `UPDATE` 1 row | `{ kind: "updated", record }` — `operation_id` **preserved** (not rewritten) |
| 0 rows, row already canonical, and retry authority matches (`ownerId`, `projectId`, `expectedOperationId`, request fingerprint, job/request semantic identity, renderer profile/build, idempotency authority) | `{ kind: "already_promoted", record }` without mutation |
| 0 rows, row already canonical, but forged/mismatched operation or request | `{ kind: "rejected", message }` — never borrow prior promotion |
| 0 rows, version mismatch on provisional | `{ kind: "stale" }` |
| Gate failed before update | `{ kind: "rejected", message }` |

No mixed provisional/canonical row is ever observable — the `UPDATE` replaces all stage-dependent columns in one statement.

---

## 5. Canonical transition CAS (`compareAndSetTransition`)

```sql
SELECT *
FROM headless_jobs
WHERE job_id = $job_id
  AND owner_id = $owner_id
FOR UPDATE;

-- Reject stage <> 'canonical' in application layer.
-- Reject terminal canonical states → terminal_locked.
-- Validate transition legality + binding rules in TypeScript.

UPDATE headless_jobs
SET
  state = $next_state,
  store_version = store_version + 1,
  updated_at_ms = $updated_at_ms,
  canonical_job = $canonical_job::jsonb,
  canonical_request = $canonical_request::jsonb,
  claim_token = $claim_token,
  claimed_at_ms = $claimed_at_ms,
  artifact_object_binding = $artifact_object_binding::jsonb
WHERE job_id = $job_id
  AND owner_id = $owner_id
  AND stage = 'canonical'
  AND store_version = $expected_store_version
  AND state NOT IN ('succeeded', 'failed', 'cancelled', 'expired')
RETURNING *;
```

Binding column must remain `NULL` until `state = 'succeeded'` (enforced by table CHECK + TypeScript).

---

## 6. Claim queued canonical job

Provisional rows are rejected before lock (no render claim on provisional records).

```sql
SELECT *
FROM headless_jobs
WHERE job_id = $job_id
  AND owner_id = $owner_id
FOR UPDATE;

UPDATE headless_jobs
SET
  store_version = store_version + 1,
  claim_token = $claim_token,
  claimed_at_ms = $now_ms
WHERE job_id = $job_id
  AND owner_id = $owner_id
  AND stage = 'canonical'
  AND state = 'queued'
  AND store_version = $expected_store_version
  AND claim_token IS NULL
RETURNING *;
```

| Outcome | Port result |
|---------|-------------|
| 1 row | `{ kind: "claimed", record }` |
| 0 rows | `{ kind: "rejected" }` |

---

## 7. Expired render-claim recovery

```sql
SELECT *
FROM headless_jobs
WHERE job_id = $job_id
  AND owner_id = $owner_id
FOR UPDATE;

-- Application checks:
--   stage = 'canonical'
--   state NOT terminal
--   claim_token IS NOT NULL, claimed_at_ms IS NOT NULL
--   optional expectedClaimToken match
--   now_ms > claimed_at_ms + lease_ms → else rejected_live_claim

UPDATE headless_jobs
SET
  state = 'failed',
  store_version = store_version + 1,
  updated_at_ms = $updated_at_ms,
  canonical_job = $failed_job::jsonb,
  canonical_request = $canonical_request::jsonb,
  claim_token = NULL,
  claimed_at_ms = NULL,
  artifact_object_binding = NULL,
  terminal_reason = $terminal_reason::jsonb
WHERE job_id = $job_id
  AND owner_id = $owner_id
  AND stage = 'canonical'
  AND store_version = $expected_store_version
  AND claim_token IS NOT NULL
  AND state NOT IN ('succeeded', 'failed', 'cancelled', 'expired')
RETURNING *;
```

| Outcome | Port result |
|---------|-------------|
| 1 row | `{ kind: "failed_expired", record }` |
| Live lease | `{ kind: "rejected_live_claim" }` |
| Terminal | `{ kind: "rejected_terminal" }` |
| Other | `{ kind: "rejected" }` |

---

## List canonical queued (non-transactional read)

```sql
SELECT job_id
FROM headless_jobs
WHERE stage = 'canonical'
  AND state = 'queued'
  AND claim_token IS NULL
ORDER BY created_at_ms ASC
LIMIT $limit;
```

Uses partial index `idx_headless_jobs_canonical_queued_unclaimed`.

---

## Privacy reminder

Never persist in any column:

- Presigned URLs (`https://`, `blob:`, `data:`)
- Clerk session tokens or secret keys
- Raw capability tokens from upload sessions

Locators remain `{ kind, storeId, objectKey }` identity tuples only.
