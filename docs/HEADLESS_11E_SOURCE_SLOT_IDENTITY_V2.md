# Sprint 11E — Source-slot identity v2 (`hslot:v2`)

## Decision

Persisted Headless source-slot keys use a versioned structured encoding:

`hslot:v2:` + base64url(utf8(JSON.stringify([role, sceneId, mediaItemId, sourceDigest])))

- `sceneId` / `mediaItemId` are JSON `null` or string (empty string is distinct from null).
- Components may contain U+0000, U+001F, quotes, and other Unicode; the **persisted key** never contains raw NUL and is PostgreSQL JSONB-safe.
- Exact recomputation after parse is required for canonical validation.
- Legacy delimiter joins (`U+0000` / `U+001F`) are **not** accepted as canonical keys.

## Compatibility

- Headless production routes remain configuration-blocked.
- Staging live harness cleans temporary jobs; no durable SQL migration is required for this identity change.
- Migrations `000`–`002` are unchanged.
- ExportManifest v2/v3 is unchanged.
- In-memory media-item dedupe uses `hmitem:v1:` with the same structured-tuple principle (not persisted).

## Prior diagnosis (retained)

PostgreSQL SQLSTATE `22P05` on provisional create was caused by NUL-delimited slot keys inside JSONB. v2 removes that class of failure without using delimiter joins.

## Progressive diagnostic (QA-only)

- Gate: `HEADLESS_NEON_QA_PROGRESSIVE=1` + `DATABASE_URL`
- Script: `npm run test:headless-neon-progressive`
- Evidence: `docs/HEADLESS_11E_NEON_PROGRESSIVE_DIAGNOSTIC.md` (never overwrites official live evidence)
- Gate off → zero Neon connections
- Not exposed through production barrels or routes
