# Brand-sting-export baseline — resolution history

> **Evidence status:** Historical failure, repaired on `staging-engagement-outro-motion`. This is no longer an active release blocker for Brand Sting command immutability. It is not proof of Browser/Headless decoded-artifact certification.

## Original clean-staging failure

| Field | Value |
| --- | --- |
| First recorded on | `staging-video-quality-audit` dirty tree and clean `origin/staging` |
| Command | `npm run test:brand-sting-export` |
| Failing file | `src/verification/brand-sting/brandStingTimeline.verify.ts` |
| Test name | `commands are immutable and preserve engagement overlays byte-for-byte` |

`enableBrandSting` cloned the script through `normalizeVisualRetentionProjectExtensions`, which injected default `size: "medium"` and `scale: 1` onto a legacy engagement overlay that omitted those fields.

### Expected (input fixture, no size/scale)

```json
{"scene-a":[{"version":1,"id":"keep-overlay","kind":"subscribe","startOffsetMs":500,"durationMs":1500,"position":"top-right","presetId":"compact-pill-v1"}]}
```

### Actual before the repair

```json
{"scene-a":[{"version":1,"id":"keep-overlay","kind":"subscribe","startOffsetMs":500,"durationMs":1500,"position":"top-right","size":"medium","scale":1,"presetId":"compact-pill-v1"}]}
```

The assertion was not weakened. Prompts 1–3 left the failure in place because it was pre-existing on clean staging.

## Repair

Brand Sting commands now structurally clone `visualRetentionExtensions` and may normalize only the Brand Sting field. They do not import or call the engagement-overlay normalizer.

Required behavior after the repair:

- Enable, duration change, disable, and capability refusal preserve unrelated extension JSON byte-for-byte.
- Legacy overlays without `size`/`scale` stay legacy.
- Modern overlays keep their authored `size`/`scale`.
- Malformed Brand Sting fails closed without rewriting overlays.
- `visualRetentionExtensions` is removed only when no non-Brand-Sting extension data remains.

Focused proof: `src/verification/brand-sting/brandStingCommandImmutability.verify.ts`, plus the original timeline assertion.

## Current status

| Check | Result |
| --- | --- |
| Original byte-preservation assertion | Must pass after the command repair |
| Overlay normalizer still used for overlay authoring / project open | Unchanged and out of Brand Sting command scope |
| Browser/Headless decoded certification | [ENGAGEMENT_OUTRO_MOTION_CERTIFICATION.md](ENGAGEMENT_OUTRO_MOTION_CERTIFICATION.md); do not infer it from this repair |
