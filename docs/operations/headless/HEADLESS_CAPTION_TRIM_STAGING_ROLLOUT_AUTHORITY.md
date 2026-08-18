# Caption/trim parity — staging rollout authority

**Status:** sealed candidate, Machines not updated
**Prompt:** 3A — build-only + seal
**Branch:** `staging-headless-caption-trim-rollout-authority`
**Base staging SHA:** `f6e2bbfb3af3ab86ac71aa5ef254a9e968357861`

## Authorization

This authority creates and seals one staging-only immutable candidate image. It does **not** update, start, or restart either Fly Machine, change Vercel or Fly environment variables, run a live export, apply migrations, remove Upstash, change production, or merge the PR.

| Gate | Env | Usable in 3A |
|---|---|---|
| Build-only push | `HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1` and `HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_BUILD_ONLY=1` | yes — executed once |
| Forward rollout | `HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLOUT=1` | no |
| Rollback | `HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLBACK=1` | no |
| Live certification | `HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_CERTIFY=1` | no |

Scripts:

- `scripts/fly-staging/fly-staging-caption-trim-build-only.sh`
- `scripts/fly-staging/fly-staging-caption-trim-rollout.sh` (sealed, not executed)

Historical `scripts/fly-staging/fly-staging-cleanup-runtime-rollout.sh` still dies with `no_authorized_cleanup_forward_digest`. Do not make it executable for this release.

## Identities

| Field | Value |
|---|---|
| App | `shortforge-hw-staging-4def8fa0` |
| Org / region | `personal` / `iad` |
| Verifier | `d895d12a240938` (shared 1 CPU / 2048 MB) |
| Renderer | `d895d16f264918` (performance 4 CPU / 8192 MB) |
| Queue provider | Neon |
| Maintenance | disabled |
| New renderer build ID | `headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity` |
| Web / default job identity | remains `headless-local-chromium-ffmpeg-11e-phase2g.24e` |
| Candidate image | `sha256:def59aabd24568c3798b68d7be9edf9c7600a4fbacd894b53c0c9b108514f09a` |
| Current deployed / rollback | `sha256:b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe` |

The generic Fly template still advertises the historical `24e` identity. The new ID is materialized only through the caption/trim pair authority.

Merging this PR does not change the live phase2g.25 worker. Staging web requests continue to send `24e`.

## Next authorized action after merge

A separately authorized Prompt 3B may run:

```sh
HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED=1 \
HEADLESS_FLY_STAGING_AUTHORIZE_CAPTION_TRIM_ROLLOUT=1 \
./scripts/fly-staging/fly-staging-caption-trim-rollout.sh forward
```

That script accepts only the sealed candidate digest, requires the two known idle Machines, preserves Neon / secrets / region / VM sizes, and restores `b003bf34…` on forward acceptance failure. One forward attempt and one rollback attempt per sealed release.

Do not deploy the candidate image in Prompt 3A.
