# Mixed-Media Export QA Checklist (4.2C-8C)

Use the six-scene fixture (4 images + 2 videos, long source in short scene, Fit + Fill, motion, captions, VO).

## Short export — 720p / 30 FPS

- [ ] Scene 1 landscape image appears
- [ ] Scene 2 Fit portrait shows full image (letterbox OK)
- [ ] Scene 3 video plays at normal speed (not slow-mo)
- [ ] Scene 3 stops at scene boundary (not full 16s source)
- [ ] Scene 4 image + motion appears after video
- [ ] Scene 5 second video is independent
- [ ] Scene 6 Fit image appears through end
- [ ] Captions progress through all scenes
- [ ] Voiceover stays synchronized
- [ ] Final caption completes
- [ ] Final scene not cut
- [ ] File duration ≈ project duration

## Higher quality — 1080p / 30 FPS

- [ ] Same scene progression as 720p
- [ ] Fit/fill parity with Preview
- [ ] Captions/VO sync unchanged
- [ ] Duration correct
- [ ] Note wall-clock export time

## High FPS — 1080p / 60 FPS

- [ ] Playback speed still normal (not half-speed)
- [ ] Scene durations unchanged vs 30 FPS
- [ ] Captions not slowed
- [ ] Effective FPS ≈ 60
- [ ] Document longer wall-clock cost

## Long project (10–15 scenes, 3–5 videos)

- [ ] No gradual caption/VO drift
- [ ] No missing later scenes
- [ ] No frozen captions
- [ ] No duration inflation in final file
- [ ] No memory growth across export
- [ ] No stale frames from earlier videos

## Consecutive exports / cleanup

- [ ] Export twice in one session — second is clean
- [ ] Cancel mid-export recovers UI
- [ ] Failed decode does not leave recorder/tracks running

## Automated gates

```bash
npm run test:export-reliability
npm run test:motion-sprint
npx tsc --noEmit
npm run lint
npm run build
```
