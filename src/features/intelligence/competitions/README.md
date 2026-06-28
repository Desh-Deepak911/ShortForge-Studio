# Competitions

Normalizes **which competition and season** a brief targets.

## Responsibility

- Canonical competition detection from topic text (leagues, cups, international tournaments)
- Season/year extraction and time-scope rules (`season` vs `all_time`)
- API-Football league ID mapping
- Confidence and warnings (e.g. missing required season)

## Entry point

`resolveCompetitionFromTopic()` in `competition-resolver.ts` — single source of truth.

## Status

Active — research layer delegates here via deprecated wrappers in `features/research/utils/competition-resolver.utils.ts`.
