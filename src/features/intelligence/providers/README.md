# Providers

Registry and orchestration for **external research data sources**.

## Responsibility

- Provider interface (API-Football, static fallbacks, manual notes)
- Parallel fetch, caching, and fallback ordering
- Normalized provider responses into knowledge primitives
- Environment and capability detection (keys configured, rate limits)

## Status

Scaffold only — API-Football integration currently lives under `features/research` and `lib/football`.
