# Environment Variables and Feature Flags

Tracking ledger for ShortForge Studio runtime gates.
**Never record secret values here.**

| Variable / flag | Public or server-only | Owner / module | Introduced sprint | Default behavior | `.env.local` action required | Restart required | Current state | Removal / freeze condition |
|-----------------|----------------------|----------------|-------------------|------------------|------------------------------|------------------|---------------|----------------------------|
| *(none active for multi-image or intra-scene transitions)* | — | Scene Media Timeline + intra-scene transition editor metadata | — | Always on (no gate) | None for Sprint 9A | No | **Default** — no env flag for Sprint 9 | — |

## Sprint 10E / 10E.1 — Retention Narrative Composer + Hook Bridge

No new environment variable or feature flag. No temporary public gate.

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 10E | none | none | none | none | none | no |
| 10E.1 | none | none | none | none | none | no |
| 10E.1A | none | none | none | none | none | no |

`.env.local` action: **none**. Restart: **no**, unless ordinary TypeScript module refresh requires it.

## Sprint 10F / 10F.3 / 10F.3A / 10F.3B / 10G / 10G.1 / 10G.1A / 10H — Retention Validator + Production + Explainability UI + Golden QA

No new **production** environment variable or feature flag. Production narration uses existing `OPENAI_API_KEY` + `OPENAI_SCRIPT_MODEL` / quality-mode model selection. No temporary public gate. Call-kind-aware `max_output_tokens`, safe Hook diagnostics authority, Story Strategy selection, and Retention persistence validators are derived/validated in-process (no env).

**QA-only live gate (not a production feature flag; not required in `.env.local`):**

| Variable | Public or server-only | Owner | Default | `.env.local` action | Restart | Notes |
|----------|----------------------|-------|---------|---------------------|---------|-------|
| `RETENTION_LIVE_QA` | server/QA process | Sprint 10H / 10H.1A live harness | unset / off | **none** (export in shell when running live QA) | **yes** if testing against a running `npm run dev` | `=1` enables core live cases; otherwise Not tested / exit 0; does not overwrite completed live-results |
| `QA_BASE_URL` | server/QA process | Sprint 10H / 10H.1A live harness | unset | **none** | n/a | Required when `RETENTION_LIVE_QA=1` |
| `RETENTION_LIVE_AUDIO_FIRST` | server/QA process | Sprint 10H / 10H.1A live harness | unset / off | **none** | n/a | When `=1`, audio-first is **Core-required** for eligibility; when unset, audio-first is **capability-gated Not tested** (never “optional Pass”) |

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 10F | none | none | none | none | none | no |
| 10F.1 | none | none | none | none | none | no |
| 10F.1A | none | none | none | none | none | no |
| 10F.1B | none | none | none | none | none | no |
| 10F.1C | none | none | none | none | none | no |
| 10F.2 | none | none | none | none | none | no |
| 10F.2A | none | none | none | none | none | no |
| 10F.3 | none | none | none | none | none | **yes** (dev server — narration path changed) |
| 10F.3A | none | none | none | none | none | **yes** (dev server — commit gate / failure envelopes / token budgets) |
| 10F.3B | none | none | none | none | none | **yes** (dev server — safe Hook diagnostics terminal coherence) |
| 10G | none | none | none | none | none | **yes** (dev server — Story Strategy + Review explainability) |
| 10G.1 | none | none | none | none | none | **yes** (dev server — persistence + explainability authority) |
| 10G.1A | none | none | none | none | none | **yes** (dev server — total persistence validator exception boundary) |
| 10H | QA-only `RETENTION_LIVE_QA` / `QA_BASE_URL` (not production) | none | none | none | **none** | **yes** for live/local Create paths against `npm run dev` |
| 10H.1 / 10H.1A | same QA-only gates; terminal-coherent success assertion + evidence preservation | none | none | none | **none** | **yes** for live/local Create paths against `npm run dev` |
| 10H.2–10H.5C | same QA-only gates; live remediation, universal reliability, final 13/13 live + local sign-off | none | none | none | **none** | **yes** only when running live/local evidence against `npm run dev` |

`.env.local` action: **none**. Restart: **yes** for a running `npm run dev` when exercising live or local Create/Review sign-off.

## Sprint 9A / 9B / 9C / 9D

No environment variable or feature flag. Intra-scene transition editor metadata, Preview, ExportManifest v3 / `"9C"`, and Sprint 9D QA harnesses are always available (no gate).

| Sprint | Variables added | Variables changed | Variables removed | Feature flags | `.env.local` action | Restart |
|--------|-----------------|-------------------|-------------------|---------------|---------------------|---------|
| 9A | none | none | none | none | none | none |
| 9B | none | none | none | none | none | none |
| 9C | none | none | none | none | none | none |
| 9C.1 | none | none | none | none | none | none |
| 9D | none | none | none | none | none | none |
| 9D.1 | none | none | none | none | none | none |
| 9D.2 | none | none | none | none | none | none |
| 9D.3 | none | none | none | none | none | none |

`.env.local` action: **none** (assuming the retired Sprint 8 multi-image variable has already been removed).

Restart: **no** special environment restart required.

Sprint 9 freeze (9D.3): no env or feature-flag change. Intra-scene transitions remain ungated.

Dev QA: `/dev/intra-scene-transition-qa` (production-gated; not a product feature).

## Sprint 8 post-freeze operator action (historical)

```text
Remove NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=1 from .env.local after Sprint 8E.3 lands, then restart the development server.
```

Do **not** commit `.env.local`. Multi-image scenes no longer require an environment flag.

Open `/dev/scene-media-qa` for local Preview / export regression if needed (development only).

## Retired-flag ledger

| Variable / flag | Introduced | Retired | Reason |
|-----------------|------------|---------|--------|
| `NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES` | Sprint 8B | Sprint 8E.3 | Local Preview, 720p WebM, manual editor, and deterministic QA all passed; multi-image became default |

## Related

- Architecture index: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md)
- Module: `src/features/scene-media-timeline/`
- Intra-scene transitions: `src/features/scene-media-transitions/` · [INTRA_SCENE_TRANSITIONS.md](./INTRA_SCENE_TRANSITIONS.md)
- UI: `src/features/timeline-editor/scene-media/`
- Freeze: [qa/scene-media-sprint-8-freeze.md](./qa/scene-media-sprint-8-freeze.md) · [qa/intra-scene-transition-sprint-9-freeze.md](./qa/intra-scene-transition-sprint-9-freeze.md)
- Verify: `npm run test:scene-media-sprint` · `npm run test:intra-scene-transition-sprint`
