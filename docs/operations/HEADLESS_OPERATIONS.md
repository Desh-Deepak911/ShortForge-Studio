# Headless operations and failure investigation

This is the operator entry point. Chronological implementation authorities live under [../architecture/headless/](../architecture/headless/README.md). Evidence stays under [../evidence/headless/](../evidence/headless/README.md) and must not be moved without a path-and-SHA audit.

## What Headless is

A user-triggered export path that renders frames in Chromium and encodes with native ffmpeg. It is not the default Browser export path.

Local isolated workers resolve system Chrome and Homebrew/macOS ffmpeg paths by default. Optional overrides:

- `HEADLESS_CHROME_PATH`
- `HEADLESS_FFMPEG_PATH`
- `HEADLESS_FFPROBE_PATH`

These are server-only. Never use `NEXT_PUBLIC_*` for secrets or binary paths.

## What is not implied by “Headless exists in the repo”

- Production routes may still be **configuration-blocked**
- Fly deploy, Neon migrate, R2 live, and Upstash live are **gated operator actions**
- A passing provider-free contract test is not a hosted certification
- Hosted worker images are documented as **Node 24**; the Next.js app is not

Current Headless evidence files record **Pass** on named gated staging harnesses (for example Fly render live smoke, and separate 4K capacity vs operational-capacity records). A short 4K capacity Pass is not the same as `full capacity claim justified`. Read the specific `docs/evidence/headless/current/` file before stating a Pass. Do not treat those harnesses as an ungated production default.

## Environment classification

Clerk, Neon, R2, Upstash, and hosted-worker settings are classified (`unconfigured` / `configured` / `invalid`). Invalid or missing configuration must fail closed without revealing which secret failed.

Ordinary Studio development does not require these variables. See [ENV_AND_FEATURE_FLAGS.md](ENV_AND_FEATURE_FLAGS.md) for names and gates. Do not copy secret values into documentation.

## Failure investigation

1. Confirm whether the job was Browser or Headless.
2. For Browser issues use [EXPORT_FAILURE_FORENSICS.md](EXPORT_FAILURE_FORENSICS.md).
3. For Headless, start with [../evidence/headless/README.md](../evidence/headless/README.md) and the matching `current/` harness file.
4. Do not rerun a live harness in a way that overwrites official evidence unless the harness is designed to update that file.
5. Archive files (`*.pre-*`) are immutable snapshots.

Fly staging scripts live in `scripts/fly-staging/`. They are fail-closed operator tools, not part of `npm run dev`.

## Local worker build

```bash
npm run build:headless-worker
```

Provider-free contract checks:

```bash
npm run test:headless-render-contract
npm run test:headless-control-plane
```
