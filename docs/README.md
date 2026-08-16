# ShortForge Studio documentation

This is the documentation landing page. The product onboarding document is the [root README](../README.md).

Use this map to find the **current authority** for a topic. Do not treat sprint numbers, freeze ledgers, or archived indexes as the first explanation of how the product works.

When documents disagree:

1. Production types and runtime code
2. Provider-free verification suites
3. Current responsibility documents in this tree
4. Current evidence under `docs/evidence/*/current/`
5. Historical contracts, sprint ledgers, and archives

## Where information belongs

| Folder | Responsibility |
| --- | --- |
| [product/](product/) | Creator-facing behavior: workflow, editing, voice, framing, mixer |
| [architecture/](architecture/) | System design and frozen contracts |
| [development/](development/) | Local setup and day-to-day commands |
| [verification/](verification/) | How to run tests and what they prove |
| [operations/](operations/) | Environment flags, export forensics, Headless runbooks |
| [evidence/](evidence/) | Measured readiness, baselines, and certification records |
| [archive/](archive/) | Superseded indexes, sprint history, and historical audits |
| [qa/](qa/) | Historical sprint freeze ledgers and live-model logs (kept in place for path/SHA bindings) |

## Canonical documents

| Topic | Authority |
| --- | --- |
| Product and creator workflow | [product/CREATOR_WORKFLOW.md](product/CREATOR_WORKFLOW.md) |
| Story generation | [architecture/STORY_GENERATION.md](architecture/STORY_GENERATION.md) |
| Voice, speed, and mastering | [product/VOICE_GENERATION.md](product/VOICE_GENERATION.md) |
| Preview, Browser, and Headless rendering | [architecture/PREVIEW_AND_EXPORT.md](architecture/PREVIEW_AND_EXPORT.md) |
| Fit, Fill, zoom, Fit with background | [product/SOURCE_MEDIA_QUALITY.md](product/SOURCE_MEDIA_QUALITY.md) |
| Export manifest and renderer capabilities | [architecture/EXPORT_MANIFEST_AND_CAPABILITIES.md](architecture/EXPORT_MANIFEST_AND_CAPABILITIES.md) |
| Local development | [development/LOCAL_DEVELOPMENT.md](development/LOCAL_DEVELOPMENT.md) |
| Verification | [verification/VERIFICATION.md](verification/VERIFICATION.md) |
| Headless operations | [operations/HEADLESS_OPERATIONS.md](operations/HEADLESS_OPERATIONS.md) |
| Release-readiness evidence policy | [evidence/RELEASE_READINESS_POLICY.md](evidence/RELEASE_READINESS_POLICY.md) |

## Supporting living documents

These remain useful and should not be copied into the canonical pages above.

- Product details: [product/EDITING.md](product/EDITING.md), [product/AUDIO_MIXER.md](product/AUDIO_MIXER.md), [product/MEDIA_FRAMING.md](product/MEDIA_FRAMING.md), [product/RENDERING.md](product/RENDERING.md), [product/STUDIO_INTELLIGENCE.md](product/STUDIO_INTELLIGENCE.md)
- Frozen contracts: [architecture/RETENTION_STORY_CONTRACT.md](architecture/RETENTION_STORY_CONTRACT.md), [architecture/HOOK_CONTRACT.md](architecture/HOOK_CONTRACT.md), [architecture/EXPORT_CONTRACT.md](architecture/EXPORT_CONTRACT.md)
- Environment ledger: [operations/ENV_AND_FEATURE_FLAGS.md](operations/ENV_AND_FEATURE_FLAGS.md)
- Headless architecture chronology: [architecture/headless/README.md](architecture/headless/README.md)
- Verification suite ownership: [../src/verification/README.md](../src/verification/README.md)

## Evidence

Current measured records live under [evidence/](evidence/README.md):

- Story: [evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md](evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md) — **not_ready**
- Video: [evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md](evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md) — **conditionally ready**
- Voice: [evidence/audio/current/VOICE_SPEED_CLARITY_AUDIT.md](evidence/audio/current/VOICE_SPEED_CLARITY_AUDIT.md)
- Headless: [evidence/headless/README.md](evidence/headless/README.md) — do not move these files without a path-and-SHA audit

## Historical material

- [archive/MASTER_ARCHITECTURE.md](archive/MASTER_ARCHITECTURE.md) — former root architecture index and sprint ledger
- [archive/root-ARCHITECTURE.md](archive/root-ARCHITECTURE.md) — former root architecture overview
- [archive/sprints/](archive/sprints/) — sprint reports
- [qa/](qa/README.md) — freeze ledgers and live-model logs kept at their original paths

## Maintenance

- Add living documentation to the folder that owns the behavior.
- Do not create another general index that restates this page.
- Never commit credentials, `.env` files, provider logs, downloaded media, or temporary harness output.
- Never rewrite historical measurements to look current.
- Before relocating Headless or QA evidence, search the repository for the filename and its SHA-256.
