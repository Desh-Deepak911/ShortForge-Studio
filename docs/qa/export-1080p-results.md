# Export 1080p Device Results (Sprint 6F.1)

**Rule:** Do not fabricate results. Record only measured or automated-semantic evidence.

## Policy (capability-based)

| Profile | Expected classification |
| --- | --- |
| 720p (general) | Approved |
| 1080p image-heavy short | Approved |
| 1080p mixed media | Approved with warning |
| 1080p video-heavy long | Blocked (server recommended) |
| Developer override `NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1` | Approved with warning (dev only; client-visible) |

## Golden matrix — device runs

| Golden | Resolution | Wall clock | Chunk count | Memory estimate | Completion | Artifact validation | Warnings | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 720p | — | — | automated | — | — | — | automated-semantic |
| A | 1080p | — | — | automated | — | — | — | not-tested (device) |
| C | 720p | — | — | automated | — | — | — | automated-semantic |
| C | 1080p | — | — | automated | — | — | — | not-tested (device) |
| G | 720p | — | — | automated | — | — | — | automated-semantic |
| G | 1080p | — | — | automated | — | — | — | not-tested (device) |

## Automated coverage

- `test:export-resolution-policy`
- `test:export-1080p-capability`
- Capability preflight: short 1080p mixed → warning; long video-heavy 1080p → blocked

## How to fill a device row

1. Export Golden A/C/G at 720p and 1080p on a named browser/OS.
2. Capture wall-clock, chunk count from debug logs, peak memory estimate from preflight, completion, validation.
3. Append a row with evidence class `manual-device` or `local-artifact`.

## Decision

1080p is **capability-gated**, not blanket-blocked. Production creators see Approved / Warning / Blocked with actionable messaging.

### Developer override

```bash
NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER=1
```

- Non-secret; must be `NEXT_PUBLIC_*` so the browser preflight can read it
- Restart `next dev` / rebuild after changing
- Emits `DEV_1080P_OVERRIDE` warning — does not auto-approve unrelated blockers
- Keep off in production until device QA rows above are filled

Device binary matrix for Goldens A/C/G at 1080p remains **Not tested** until filled above.
