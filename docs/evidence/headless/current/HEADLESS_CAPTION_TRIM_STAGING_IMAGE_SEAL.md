# Caption/trim parity — staging image seal (sanitized)

## Result

`gate=caption_trim_build_only result=PASS`

Candidate sealed. Machines were not modified. Production was untouched. Upstash remains available for rollback.

## Source / base identity

| Field | Value |
|---|---|
| Latest `origin/staging` | `f6e2bbfb3af3ab86ac71aa5ef254a9e968357861` |
| Caption/trim merge | PR #81 / `d622eaae62c9cdc8fc64b38369630a74540d567d` |
| Ops branch | `staging-headless-caption-trim-rollout-authority` |
| Build-tree commit | `df17a901ce83eb651299d86c7610d6abc6215290` |
| Authority commit | `5e94cbaf5ad3691b66e37d664d1a825def45e573` |

The original checkout on `staging-caption-transparency-video-trim` was not reset, cleaned, or used as the build tree.

## New build identity

`headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity`

Hosted accepted set still includes `24e`, `24e-bridge008`, and `25-cleanup-runtime`. Unknown IDs fail closed. Web default remains `24e`.

## Bundle digests (packaged into the candidate)

| Artifact | SHA-256 |
|---|---|
| `hosted-worker.js` | `9e81fdfd2dbdd901f1aaa6362899ed141ee9d5f4b2edf3db035665b2654b1bac` |
| `page-render.iife.js` | `006981078ccb917ef8ceadfa23876a9cffacc968fa28c5d33ad99578a1d5ec02` |
| `BUILD_INFO.json` | `7e8953ff7887c6dfc58c4964ce1f51787f2b10ecd4c01e42de7d586bf259cc80` |

Deterministic two-build: PASS.

After sealing the candidate digest constant, `dist/headless-worker` was rebuilt. Worker / page / BUILD_INFO digests were identical to the pushed candidate. The authority file is not imported by the hosted worker or page bundle.

## Candidate image

| Field | Value |
|---|---|
| Manifest digest | `def59aabd24568c3798b68d7be9edf9c7600a4fbacd894b53c0c9b108514f09a` |
| Registry reference | `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:def59aabd24568c3798b68d7be9edf9c7600a4fbacd894b53c0c9b108514f09a` |
| Image size | 402 MB |
| Architecture | single-manifest Depot remote build (existing pair is linux/amd64) |
| Build attempts | 1 |
| Differs from current deployed | yes (`b003bf34…`) |
| Differs from placeholder | yes (`0000…`) |
| Differs from historical rejected digests | yes |

## Current deployed / rollback

| Field | Value |
|---|---|
| Deployed digest | `b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe` |
| Rollback digest | same as deployed (`phase2g.25-cleanup-runtime`) |
| Live renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime` |

## Topology (before and after build-only)

| Phase | verify | render | other | region | state | unified digest | release |
|---|---:|---:|---:|---|---|---|---:|
| Before | 1 | 1 | 0 | iad | stopped | `b003bf34…` | 58 |
| After | 1 | 1 | 0 | iad | stopped | `b003bf34…` | 58 |

Machine IDs preserved: verify `d895d12a240938`, render `d895d16f264918`.

## Build-only proof

- Explicit gates required and used once.
- Exact staging app `shortforge-hw-staging-4def8fa0`, org `personal`, region `iad`.
- Clean Git worktree; HEAD descended from `f6e2bbf`.
- `dist/headless-worker` built first; new renderer build ID accepted; page bundle proved CTA, Brand Sting, caption transparency, trim, and transition markers.
- Release-specific Fly config materialized; public services rejected.
- `fly deploy --remote-only --build-only --push --yes` only.
- No Machine update, start, stop, restart, scale, or destroy.
- No secret or environment change.
- Temporary materialized toml cleaned.

## Tests

PASS: caption/trim rollout authority (including sealed forward / rollback-only-prior / placeholder-impossible / attempt budget / topology / secret redaction / no-public-service / build-only state machine), hosted environment classification, image/environment deployment-pair authority (historical table unchanged), deployable-worker packaging / build-manifest, page-render contract, production-bundle smoke, caption-background authority, per-media trim parity, engagement overlays, Brand Sting export, intra-scene transition export, Neon provider-exclusive enqueue, Neon wake/provider, trusted R2 verification, trusted verify promotion, headless control plane, full TypeScript check, ESLint on changed files, `git diff --check`.

PRE-EXISTING on `origin/staging` (not weakened): `test:headless-fly-staging-versioned-image-authority` still asserts the 2G.12 record’s last schema checksum is migration `007`, but the shared fingerprint now ends with migration `008` (`f9e8a062…`). Historical pair records were not edited.

## Explicit non-actions

- Machines were not modified, started, or restarted.
- No Vercel or Fly environment variable changed.
- No Fly secret changed.
- Production was untouched.
- Upstash remains installed and available for rollback.
- No live export ran.
- No database migration ran.
- The rollout script was not executed.
- This branch was not merged.

## Next authorized action after merge

Run a separately authorized Prompt 3B Machine rollout with `scripts/fly-staging/fly-staging-caption-trim-rollout.sh forward` against only `sha256:def59aabd24568c3798b68d7be9edf9c7600a4fbacd894b53c0c9b108514f09a`. Automatic rollback target remains `sha256:b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe`.
