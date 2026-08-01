# Visual-Retention Capabilities — Local QA

## Scope

Local-only verification against staging baseline
`b5455ff4e5996207b2847c8fe8b0eb1121e94347`. No provider operation, remote
database mutation, deployment, or staging flag activation was performed.

## Results

| Check | Result |
|-------|--------|
| Visual-retention capabilities focused suite | PASS |
| TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint for visual-retention sources | PASS |
| Browser export capability preflight | PASS — 19 tests |
| ExportManifest regression | PASS — 9 tests |
| Scene Media export regression | PASS — 54 tests |
| Headless render contract regression | PASS — 32 tests |
| Headless product UI regression | PASS — 7 tests |

## Focused authority proven

- Visual-retention phases default off.
- Main/master and Vercel production hard-disable every visual-retention phase.
- Unknown phase IDs reject the full gate snapshot.
- Later phases cannot activate across a dependency gap.
- Narration timing is present in the base capability set; music is absent from
  the capability model and cannot become a pacing requirement.
- Required capability gaps return non-retryable `UNSUPPORTED_CAPABILITY` at
  `pre_dispatch`.
- Optional capability gaps warn without blocking.
- Headless preference leaves Browser selectable when Browser is supported.
- Browser remains 720p/1080p and Headless remains 720p/1080p/4K.
- Engagement-overlay and ShortForge Studio brand-sting extensions are optional.
- An absent or disabled brand sting adds zero duration.
- The brand sting contract rejects narration, captions, non-fixed playback
  speed, non-ShortForge title text, and unsupported 2–3 second durations.
- ExportManifest v2/8D, v3/9C, and v4/9D identifiers remain unchanged.

## Commands used

```bash
npm run test:visual-retention-capabilities
npm run typecheck
```

## Safety

No commit, push, merge, deploy, provider operation, or main/production change
was performed for this local QA record.
