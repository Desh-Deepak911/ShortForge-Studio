# Export Reliability Freeze Checklist (Sprint 6F)

Use this checklist to decide whether browser export may freeze for the **approved configuration** (720p, Chromium-first).

Do **not** fabricate device results. Mark gaps as `Not tested`.

## Core

- [ ] Manifest / preflight
- [ ] Manifest-only renderer
- [ ] Canonical timing (`manifest.project.renderDurationMs`)
- [ ] Chunked memory model
- [ ] Audio finalization
- [ ] Format adapters (WebM / MP4)
- [ ] Artifact validation before success

## Visual

- [ ] Image fit / fill / crop
- [ ] Video trim
- [ ] Motion
- [ ] Transitions
- [ ] Captions (static / fade / typewriter / highlight)
- [ ] Final frame preserved
- [ ] End buffer (400ms) preserved

## Audio

- [ ] Silent
- [ ] Voice
- [ ] Voice + music
- [ ] Ducking
- [ ] Fade
- [ ] Final narration completion (no double-speed)

## Formats

- [ ] WebM
- [ ] MP4 (runtime codec probe; blocked when unavailable)

## Reliability

- [ ] Retry
- [ ] Consecutive exports without reload
- [ ] Cancellation at major stages
- [ ] FFmpeg poison recovery
- [ ] Cleanup (no stale temp / audio)

## Device

- [ ] Chromium 720p
- [ ] Safari (document honestly)
- [ ] Firefox (document honestly)
- [ ] 1080p experiment (`NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1`) — capability-gated; override is experimental

## Evidence locations

- Semantic goldens: `src/verification/export/goldens/`
- Device QA harness: `/dev/export-qa` (development only)
- Device results log: [`export-device-results.md`](./export-device-results.md)
- Architecture: [`../EXPORT_RELIABILITY_SPRINT.md`](../EXPORT_RELIABILITY_SPRINT.md)

## Freeze decision

Recorded after Sprint 6F automated suites (2026-07-11):

```text
EXPORT RELIABILITY FREEZE: APPROVED
```

**Scope of approval:** 720p browser export, Chromium-first, WebM primary; MP4 when runtime codec probe passes.

**Not approved:** 1080p browser (remains blocked); Safari/Firefox as fully validated; fabricated device binary passes.

**Documented gaps (non-blocking for this freeze):** see [`export-device-results.md`](./export-device-results.md).
