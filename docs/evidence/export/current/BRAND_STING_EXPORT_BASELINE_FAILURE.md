# Brand-sting-export baseline failure evidence

> **Evidence status:** Failed baseline on the recorded dirty-tree comparison. Not a Pass. Not proof that later trees are fixed unless a newer current file says so.

## Clean staging comparison

| Field | Value |
| --- | --- |
| Branch under test | `staging-video-quality-audit` @ `d7bdccd` (uncommitted Prompt 1–3 dirty) |
| Clean baseline | detached worktree `.tmp/staging-baseline-wt` @ `origin/staging` = `d7bdccd28a3570e5ee51710e6c719a53c91d7be7` |
| Command | `npm run test:brand-sting-export` |
| Failing file | `src/verification/brand-sting/brandStingTimeline.verify.ts` line ~186 |
| Test name | `commands are immutable and preserve engagement overlays byte-for-byte` |

## Exact assertion

`enableBrandSting` is expected to leave `visualRetentionExtensions.engagementOverlaysBySceneId` byte-identical to the pre-command JSON.

### Expected (input fixture, no size/scale)

```json
{"scene-a":[{"version":1,"id":"keep-overlay","kind":"subscribe","startOffsetMs":500,"durationMs":1500,"position":"top-right","presetId":"compact-pill-v1"}]}
```

### Actual (after `enableBrandSting` → `cloneScript` → `normalizeVisualRetentionProjectExtensions`)

```json
{"scene-a":[{"version":1,"id":"keep-overlay","kind":"subscribe","startOffsetMs":500,"durationMs":1500,"position":"top-right","size":"medium","scale":1,"presetId":"compact-pill-v1"}]}
```

Delta: normalizer injects default `size: "medium"` and `scale: 1`.

## Classification checks

| Check | Dirty branch | Clean `origin/staging` |
| --- | --- | --- |
| Failure reproduces | Yes | Yes (identical actual/expected) |
| Manifest version in this test | N/A (authoring command, not export freeze) | N/A |
| requiredCapabilities | N/A | N/A |
| backgroundTreatment present | No | No |
| Renderer target dimensions | N/A | N/A |
| Uncommitted edits to `normalize-engagement-overlays.ts` | None | N/A |
| Uncommitted edits to `brand-sting.commands.ts` | None | N/A |
| Uncommitted edits to `brandStingTimeline.verify.ts` | None | N/A |

## Root cause

**Pre-existing on clean `origin/staging`.** Not caused by Prompt 1–2 or Prompt 3 v5/capability/`backgroundTreatment` work.

`enableBrandSting` → `cloneScript` → `normalizeVisualRetentionProjectExtensions` → `normalizeSceneEngagementOverlay` always materializes default `size`/`scale` when omitted. The timeline assertion still expects a fixture without those fields. Product comment in `brand-sting.commands.ts` claims overlays stay “byte-stable when valid,” which conflicts with default injection.

## Disposition for Prompt 3 closeout

Baseline failure proven on clean staging. Assertion not weakened or deleted. Dirty working tree leaves the baseline failure as-is for this closeout (no Prompt-3-caused regression to fix).
