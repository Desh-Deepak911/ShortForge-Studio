# Headless renderer evidence

Operator overview: [../../operations/HEADLESS_OPERATIONS.md](../../operations/HEADLESS_OPERATIONS.md). Policy: [../RELEASE_READINESS_POLICY.md](../RELEASE_READINESS_POLICY.md). Do not move these files without a path-and-SHA audit.

- `current/` — active official evidence harnesses may update these files.
- `archive/` — immutable historical snapshots (`pre-*`, `pre-run-*`, FAIL/PASS archives). Provider runs must never overwrite archive files.
- Byte-identical duplicates may be represented by registry aliases in [EVIDENCE_REGISTRY.md](./EVIDENCE_REGISTRY.md).
- Verification code binds canonical paths and SHA-256 values; preserve bytes during any future move.

## Entry points

| Evidence | Path |
| --- | --- |
| Execution probe | [current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md](./current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md) |
| Render live | [current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md](./current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md) |
| 4K capacity | [current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md](./current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md) |
| Verify live | [current/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md](./current/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md) |
| Neon live | [current/HEADLESS_11E_NEON_LIVE_EVIDENCE.md](./current/HEADLESS_11E_NEON_LIVE_EVIDENCE.md) |
| Neon queue staging (template, `NOT_RUN`) | [current/HEADLESS_NEON_QUEUE_STAGING_EVIDENCE.md](./current/HEADLESS_NEON_QUEUE_STAGING_EVIDENCE.md) |

See [EVIDENCE_REGISTRY.md](./EVIDENCE_REGISTRY.md) for the full move map and retired duplicate aliases.

Machine-readable migration output: [EVIDENCE_MIGRATION_REPORT.json](./EVIDENCE_MIGRATION_REPORT.json).
