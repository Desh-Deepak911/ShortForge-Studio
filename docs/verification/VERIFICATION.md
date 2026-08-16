# Verification

Provider-free verification is the default way to check this repository. Live provider, Fly, Neon, R2, Upstash, and OpenAI certification runs are separate gated operations.

Suite ownership and file conventions: [src/verification/README.md](../../src/verification/README.md).

## Everyday checks

```bash
npm run typecheck
npm run lint
npm run test:verification
```

Domain batches:

```bash
npm run test:verification:export
npm run test:verification:timeline
npm run test:verification:intelligence
```

Verification sources are excluded from the production TypeScript build. To typecheck them:

```bash
npx tsc -p tsconfig.verify.json
```

## Core product suites

Use these when changing the matching area. They do not replace reading the owning document.

| Area | Commands | Authority |
| --- | --- | --- |
| Story generation | `test:retention-story-quality-release-gate`, `test:retention-prompt12-certification-fixes`, `test:retention-universal-reliability`, `test:retention-canonical-narration-acceptance` | [STORY_GENERATION.md](../architecture/STORY_GENERATION.md) |
| Voice / mastering | `test:voice-speed-clarity`, `test:voice-mastering-parity`, `test:speech-style` | [VOICE_GENERATION.md](../product/VOICE_GENERATION.md) |
| Source quality / framing | `test:source-quality`, `test:fit-with-background`, `test:legibility-layer` | [SOURCE_MEDIA_QUALITY.md](../product/SOURCE_MEDIA_QUALITY.md) |
| Export / video quality | `test:video-quality-release-readiness`, `test:browser-export-artifacts`, `test:verification:export` | [PREVIEW_AND_EXPORT.md](../architecture/PREVIEW_AND_EXPORT.md) |
| Headless contracts | `test:headless-render-contract`, `test:headless-control-plane` | [HEADLESS_OPERATIONS.md](../operations/HEADLESS_OPERATIONS.md) |

Exact script names live in `package.json`. Prefer a focused `npm run test:<name>` while iterating.

## What passing tests mean

- A provider-free suite passing means the local contract held for that suite.
- It does **not** mean story generation is release-ready.
- It does **not** mean Headless Fly, Neon, or R2 is certified.
- It does **not** replace current evidence verdicts.

Current evidence:

- Story: **not_ready** — [STORY_GENERATION_RELEASE_READINESS.md](../evidence/story-quality/current/STORY_GENERATION_RELEASE_READINESS.md)
- Video: **conditionally ready** — [VIDEO_QUALITY_RELEASE_READINESS.md](../evidence/export/current/VIDEO_QUALITY_RELEASE_READINESS.md)
- Brand sting export baseline: **failed** on a recorded dirty-tree comparison — [BRAND_STING_EXPORT_BASELINE_FAILURE.md](../evidence/export/current/BRAND_STING_EXPORT_BASELINE_FAILURE.md)

## Gated live runs

Scripts named `cert:*`, `*:live`, or documented with `*_QA=1` gates must stay off unless an operator explicitly enables the gate. They must make zero provider connections when the gate is absent.

Do not use those runs to rewrite historical evidence as if it were generated today.

## Documentation links

```bash
node scripts/check-docs-links.mjs
```

This checks relative Markdown links only. It does not fetch the network.
