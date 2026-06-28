# Entities

Resolves **who and what** a brief refers to in the football domain.

## Responsibility

- Player, club, national team, competition, fixture, manager, and related resolution
- Disambiguation when multiple provider matches exist
- Canonical entity IDs for downstream research and context
- In-memory cache for repeated lookups

## Module files

| File | Purpose |
|------|---------|
| `entity-types.ts` | `ResolvedEntity`, `EntityCandidate`, `EntityResolution` |
| `entity-utils.ts` | Normalization and factory helpers |
| `entity-cache.ts` | In-memory resolved-entity cache (TTL, read-through) |
| `entity-cache.types.ts` | Cache entry shape and TTL defaults |
| `entity-cache-resolver.utils.ts` | Read cache → provider → update cache wrapper |
| `entity-extractor.ts` | Heuristic candidate extraction from topic text |
| `entity-resolver.ts` | `resolveEntities()` entry point (candidates only; no API) |
| `entity-provider.types.ts` | Provider resolution result types |
| `entity-api-scoring.utils.ts` | Candidate scoring and confidence thresholds |
| `entity-api-football.resolver.ts` | API-Football `resolve*()` methods (server-only) |
| `server.ts` | Server-only barrel for provider resolvers |

## Status

Phase 2 Prompt 2 — heuristic extraction in `resolveEntities()` (`resolved` still empty).

Phase 2 Prompt 3 — API-Football provider resolvers via `@/features/intelligence/entities/server` (not wired to research or create flow).

Phase 2 Prompt 4 — in-memory entity cache with TTL; provider resolvers read cache first, fallback to API, then update cache on successful resolution. Not persisted across sessions.

Phase 2 Prompt 5 — Create flow integration: Topic → Intent → Entity Resolver → Research Preview (`/api/resolve-entities` + heuristic preview). Generation unchanged.
