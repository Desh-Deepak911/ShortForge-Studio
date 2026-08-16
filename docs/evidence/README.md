# Evidence

Evidence records what was measured. It is not a second architecture guide.

Policy: [RELEASE_READINESS_POLICY.md](RELEASE_READINESS_POLICY.md).

## Current authorities

| Area | Current file | Verdict language in that file |
| --- | --- | --- |
| Story generation | [story-quality/current/STORY_GENERATION_RELEASE_READINESS.md](story-quality/current/STORY_GENERATION_RELEASE_READINESS.md) | **not_ready** |
| Video / export quality | [export/current/VIDEO_QUALITY_RELEASE_READINESS.md](export/current/VIDEO_QUALITY_RELEASE_READINESS.md) | **conditionally ready** |
| Voice speed | [audio/current/VOICE_SPEED_CLARITY_AUDIT.md](audio/current/VOICE_SPEED_CLARITY_AUDIT.md) | pitch-preserved path certified for the recorded matrix |
| Voice loudness baseline | [audio/current/VOICE_EXPORT_QUALITY_BASELINE.md](audio/current/VOICE_EXPORT_QUALITY_BASELINE.md) | baseline-only measurements |
| Fit with background | [export/current/FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md](export/current/FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md) | Headless decoded cases recorded |
| Brand sting | [export/current/BRAND_STING_EXPORT_BASELINE_FAILURE.md](export/current/BRAND_STING_EXPORT_BASELINE_FAILURE.md) | historical failure **repaired**; not decoded-artifact certification |
| Engagement / outro motion | [export/current/ENGAGEMENT_OUTRO_MOTION_CERTIFICATION.md](export/current/ENGAGEMENT_OUTRO_MOTION_CERTIFICATION.md) | **conditionally_ready** |
| Headless hosted | [headless/README.md](headless/README.md) | per-harness; do not summarize as a single Pass |

## Folders

- `*/current/` — latest official record for that harness or readiness question
- `headless/archive/` — immutable snapshots (`pre-*`, FAIL archives)
- [../qa/](../qa/README.md) — historical sprint freeze ledgers kept at original paths
- [../archive/](../archive/) — relocated indexes and sprint reports

Temporary media, `.tmp/` cert dumps, and local absolute paths must stay out of Git.
