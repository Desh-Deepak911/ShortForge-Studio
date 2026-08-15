# Headless production bundle — Fit-with-background

## Tracking

`dist/headless-worker/**` is **intentionally untracked** (`.gitignore` has `/dist/`).

Dockerfiles copy prebuilt artifacts:

- `deploy/headless-worker/Dockerfile` requires prior `npm run build:headless-worker`
- Copies `hosted-worker.js`, `page-render.iife.js`, `BUILD_INFO.json`

## Canonical rebuild (CI / deploy prep)

```bash
npm run build:headless-worker
```

Then package/image builds consume `dist/headless-worker/*`. Do not commit those files.

## Rebuild evidence (local closeout)

Command: `npm run build:headless-worker`

| Artifact | SHA-256 |
| --- | --- |
| `page-render.iife.js` | `a3000d67434ed5572a105ac68e6e16b15a24ba881b3e6e07dcfb04f3f8fe893c` |
| `hosted-worker.js` | `6096c860ef9d11c37ffe7bac8981393c5fe4d72f5a228af2a8fbaed35ac8e2f2` |
| `BUILD_INFO.json` | `815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d` |

Deterministic two-build digests: PASS.

## Bundle surface probes

Present in rebuilt `page-render.iife.js`:

- `media-background-treatment-blurred-fill-v1`
- `blurred_fill` / `backgroundTreatment`
- `fitWithBlurredBackgroundEnabled` (capability-gated hydration)
- `drawFitWithBlurredBackgroundLayers` + `FIT_BACKGROUND_OFFSCREEN_MAX_WIDTH`
- non-terminal fallback string `fit-with-background: blur unavailable`
- `EXPORT_MANIFEST_V5_VERSION`

## Smoke

`npm run test:fit-with-background-production-bundle` — **8 PASS**

- Accepts v5 Fit-with-background job via local worker using rebuilt page IIFE
- Proves incapable supported-set rejects `media-background-treatment-blurred-fill-v1`
- Worker capability preflight accepts capable set
- Short 1080p MP4 render succeeds without provider access
- Measured JSON: `.tmp/fit-with-background-cert/production-bundle-1080-fit-with-background.json`
