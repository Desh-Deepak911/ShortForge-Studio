# Shared Media Motion — Sprint 5 Manual QA Checklist

Sprint: **5 — Shared Media Motion** (4.2C-1 → 4.2C-6)  
Status: Sprint Freeze candidate  
Last updated: 2026-07-11

Use this checklist for the comprehensive user testing cycle after automated verification passes.

---

## Verification layers

| Layer | What it covers | How to run |
|-------|----------------|------------|
| **Automated verification** | Domain, adapters, parity matrices, structural wiring, fingerprints | `npm run test:motion-sprint` |
| **Developer QA** | Harness snapshots, targeted scene fixtures, console-free playback | Editor + `test:motion-sprint-freeze` harness |
| **Comprehensive user manual testing** | Full product paths below | This document |

---

## Automated gate (must be green before manual cycle)

```bash
npm run test:motion-sprint
npx tsc --noEmit
npm run lint
npm run build
```

Known unrelated failure (do **not** block Sprint 5 on this):

- [ ] Confirmed still failing / unchanged: `npm run test:timeline-playback` caption structural assert (`resolveCaptionAnimationState` / export-subtitle)

---

## Image Inspector

- [ ] Motion section visible for image scenes
- [ ] Enable / disable toggle writes `scene.media.motion` only
- [ ] Preset selection updates Preview immediately
- [ ] Intensity 0 → 2 updates Preview
- [ ] Easing changes update Preview midpoint behaviour
- [ ] Reset clears motion and preserves crop / fit / pan / zoom
- [ ] Undo / redo restores prior motion
- [ ] No writes to `scene.image.imageMotion`

## Video Inspector

- [ ] Same Motion section as images (shared panel)
- [ ] Trim controls still work independently of motion
- [ ] Poster / mute / replace still work
- [ ] Motion does not change trim start/end display values
- [ ] Undo / redo of motion does not revert trim

## Preview playback

- [ ] Initial load shows correct start framing
- [ ] Play animates motion from scene-local time
- [ ] Pause freezes at current progress
- [ ] Resume continues without jump
- [ ] Seek forward / backward updates motion instantly
- [ ] Slow scrub / rapid scrub stay time-driven
- [ ] Jump between scenes resets to that scene’s local time
- [ ] Restart preview returns to start state
- [ ] End of project holds final framing
- [ ] Exact scene boundaries have no flicker

## Pause / seeking / scrubbing

- [ ] Paused video frame + motion framing correct
- [ ] Seek mid-scene matches expected progress
- [ ] Scrub across scene boundary does not leak prior transform

## Image export

- [ ] No motion → framing matches Preview
- [ ] Shared preset export matches Preview midpoint / end
- [ ] Ken Burns (slow-zoom-in / out) matches Preview
- [ ] Cropped / fit / fill / manual pan / zoom / rotation preserved
- [ ] Portrait / landscape / square sources

## Video export

- [ ] No motion → framing matches Preview
- [ ] Shared preset on trimmed clip — trim timing unchanged
- [ ] Motion does not shift audio / voiceover
- [ ] Mixed image/video project exports without stale transforms

## Preview / export parity

- [ ] Same scene, same progress → matching framing (visual)
- [ ] Intensity / easing changes match on both sides
- [ ] Transition overlap: both scenes keep independent motion

## Fit / fill / crop

- [ ] Fit + motion
- [ ] Fill + motion
- [ ] Crop / manual position + motion
- [ ] Manual zoom + motion (no double-scale)
- [ ] Manual rotation + motion

## Video trim

- [ ] Trim start / end unchanged when enabling motion
- [ ] Preview clip seek still follows trim window
- [ ] Export clip seek still follows trim window

## Scene transitions

- [ ] Fade / slide / zoom / blur with motion on both scenes
- [ ] Transition opacity does not corrupt media motion
- [ ] No jump at transition start or end

## Captions

- [ ] Captions remain synchronized during motion
- [ ] Caption layout / style unaffected by media motion

## Voiceover

- [ ] Narration remains synchronized during motion playback / export

## Background music

- [ ] Music remains synchronized; motion does not alter music timing

## Draft persistence

- [ ] Enable motion → save → reload → motion preserved
- [ ] Intensity / easing / preset survive reload
- [ ] Autosave (if enabled) preserves motion
- [ ] Duplicate draft preserves motion
- [ ] Duplicate scene copies motion without shared mutable object bugs

## Undo / redo

- [ ] Enable / disable / preset / intensity / easing / reset each undo+redo correctly
- [ ] Save after redo persists final state

## Scene duplication / operations

- [ ] Duplicate scene copies motion
- [ ] Reorder scenes keeps per-scene motion
- [ ] Duration change keeps motion semantics (progress still 0–1)
- [ ] Replace image→video / video→image: motion config retained on media slot where expected
- [ ] Delete scene does not leave orphan production motion behaviour

## Legacy drafts

- [ ] Draft with only `imageMotion` still previews / exports
- [ ] Draft with both `media.motion` and `imageMotion` prefers `media.motion`
- [ ] Unknown preset does not crash
- [ ] Missing motion → neutral framing

## Resolution matrix

- [ ] 720×1280 export
- [ ] 1080×1920 export
- [ ] 1440×2560 export (if supported)
- [ ] Semantic motion matches; pixel translation scales

## Frame-rate matrix

- [ ] 24 FPS
- [ ] 30 FPS
- [ ] 60 FPS
- [ ] Same timestamps look identical across rates

## Browser coverage (Preview)

- [ ] Chromium
- [ ] Safari / WebKit
- [ ] Firefox

## Export format coverage

- [ ] Primary export format (current app default)
- [ ] Alternate format if exposed (WebM / MP4)

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Developer automated gate | | | Pass / Fail |
| Manual QA | | | Pass / Fail |
| Sprint Freeze | | | APPROVED / BLOCKED |

Blocking defects only (if blocked):

1. …
