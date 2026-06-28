# Shared

Cross-module **types and utilities** for the intelligence layer.

## Responsibility

- Shared constants and enums used by multiple modules
- Normalization helpers (topic text, labels)
- Version marker for intelligence schema evolution
- No business logic — keep modules decoupled

## Status

Scaffold only — shared helpers will accumulate as modules migrate.

## Canonical models

Shared types live in this folder and become the source of truth in later phases:

| File | Purpose |
|------|---------|
| `entity.types.ts` | Players, clubs, matches, resolution status |
| `competition.types.ts` | Leagues, seasons, competition scope |
| `provider.types.ts` | Research provider IDs and capabilities |
| `confidence.types.ts` | Tier + percent confidence across modules |
| `knowledge.types.ts` | Facts, provenance, knowledge graph |
| `query.types.ts` | Unified pipeline input from /create |
| `research.types.ts` | Canonical research output payload |

Existing runtime types in `features/research` and submodule scaffolds are unchanged until migration.
