# Sprint 11E Phase 2E.2D.2 — Local Docker image authority and native-runtime smoke

**Status:** FAIL (stopped at Chromium sandbox smoke)  
**Branch:** `feature/sprint-11-headless-renderer`  
**Start (UTC):** `2026-07-21T21:11:00Z` (approx. build start)  
**Stop (UTC):** `2026-07-21T21:15:25Z`  
**Scope:** local container verification only  
**Out of scope:** Fly config/deploy, Neon/R2/Upstash/Clerk credentials, migrations, route activation, commit/push

## Preconditions

| Check | Result |
|------|--------|
| Branch | PASS |
| `git diff --check` | PASS |
| Docker client/daemon | PASS (`29.6.2`) |
| Linux containers | PASS (`OSType=linux`) |
| Host arch | `arm64` (darwin/arm64 client → linux/arm64 engine) |
| Fly staging template arch pin | none (process VMs only); built `linux/arm64` to match host engine |
| Artifact hashes (pre/post deterministic rebuild) | unchanged PASS |

### Artifact hashes

| File | SHA-256 |
|------|---------|
| `hosted-worker.js` | `0a784d611bda77cb9751deee5d355017d56e7f6bc1e4b2d4a604ad2a589a8173` |
| `page-render.iife.js` | `43595a5b3a2c321d59be64d30f0c5ea5e6f287d90ff6cfeb948b9ed16a0658f8` |
| `BUILD_INFO.json` | `7dee6dd8e05ebb8dad015f8ec85db2b1c1a0a0901f53e9d118db73e52a8629f0` |

## Image build

| Field | Result |
|------|--------|
| Deterministic worker build | PASS |
| Dockerfile | `deploy/headless-worker/Dockerfile` (repo-root context) |
| Tag | `footiebitz/headless-worker:2e2d2-local` |
| Platform | `linux/arm64` |
| Build exit | `0` |
| Registry push | NOT DONE |
| Application provider contact during build | NONE (base image + Debian packages only) |

### Image identity

| Field | Value |
|------|--------|
| Image ID / manifest | `sha256:147c844d1913a40bd629f905dd3d5c8566e8494d659f3001129dfed1aa1bf2aa` |
| Architecture / OS | `arm64` / `linux` |
| Reported size | ~1.62 GB (`SizeBytes≈435081276` compressed/content-addressed inspect size) |
| Reproducible image bytes | NOT CLAIMED (apt/base inputs not digest-pinned) |

## Static inspection — PASS

| Assertion | Result |
|------|--------|
| `imageClass=deployable_worker` | PASS |
| Node major 24 (`v24.18.0`) | PASS |
| Default user `worker` (uid 10001, non-root) | PASS |
| Entrypoint uses `tini` | PASS (`/usr/bin/tini -- /app/docker-entrypoint.sh`) |
| Entrypoint accepts only `render`\|`verify` | PASS |
| No public port / no HTTP service | PASS (`ExposedPorts` absent) |
| No application credentials / staging URLs in config/history | PASS |
| Worker + page IIFE + BUILD_INFO present | PASS |
| Repository `src/` tree absent | PASS |
| Test/fake/memory/verification modules absent from shipped JS | PASS |
| Source maps absent | PASS |
| Workspace `/tmp/footiebitz-headless-worker` writable by worker | PASS |
| Artifacts readable by worker | PASS |

Image ENV is limited to non-secret binary paths, `NODE_ENV=production`, `HEADLESS_HOSTED_IMAGE_CLASS=deployable_worker`, and Puppeteer skip-download flags.

## Fail-closed CLI smoke — PASS (bounded)

Ran with `--network none`, non-privileged, no host network, no Docker socket, no application credentials.

| Case | Exit | Bounded reason | Module resolve | Provider network |
|------|------|----------------|----------------|------------------|
| `render` | 1 | `partial_configuration` | PASS (none) | PASS (none) |
| `verify` | 1 | `partial_configuration` | PASS (none) | PASS (none) |
| invalid mode | 1 | `invalid_mode` | PASS | PASS |
| partial env | 1 | `partial_configuration` | PASS | PASS |

**Note:** Pure `environment_unconfigured` is unreachable for `render`/`verify` invocations because the entrypoint always sets `HEADLESS_WORKER_MODE` and the image bakes Chromium/FFmpeg/ffprobe paths. Classifier correctly returns fail-closed `partial_configuration` when Neon/R2/Upstash/build-id/env-name are absent. No secrets dumped.

## Native runtime authority (recorded before stop) — PASS

| Fact | Value |
|------|--------|
| `node --version` | `v24.18.0` |
| Chromium | `Chromium 150.0.7871.124` (Debian bookworm package) |
| FFmpeg | `5.1.9-0+deb12u1` |
| ffprobe | `5.1.9-0+deb12u1` |
| Encoders VP9 / H.264 / Opus / AAC | PASS (`libvpx-vp9`, `libx264`, `libopus`, `aac`) |
| Decoders/formats (vp9/h264/opus/aac/png/webm/mp4/matroska/image2pipe) | PASS |
| Fonts liberation / dejavu / noto | present |
| Workspace writable | PASS |

## Chromium sandbox smoke — FAIL (stop)

| Field | Result |
|------|--------|
| User | `worker` (non-root) |
| Privileged | no |
| Network | `none` |
| `--no-sandbox` | not passed; absent from Dockerfile/entrypoint |
| Load target | local `data:` URL only |
| Exit | `1` |
| DOM marker | FAIL (did not render) |
| Failure class | **`sandbox_unavailable`** |
| Bounded stderr prefix | `No usable sandbox! If this is a Debian system, please install the chrom…` (`zygote_host_impl_linux`) |

**Stop rule applied:** no `--no-sandbox`, no security weakening, no remediation/rerun, no further hosted readiness claims.

## Not run (stopped)

| Step | Status |
|------|--------|
| FFmpeg/ffprobe synthetic codec matrix | NOT RUN |
| Bundled page-artifact Chromium load | NOT RUN |
| Resource peak measurements (Chromium/FFmpeg) | NOT RUN (idle image size only recorded) |

## Resource honesty (smoke-only)

| Observation | Value | Label |
|------|--------|--------|
| Image size | ~1.62 GB | smoke-only packaging size |
| Idle container memory | not measured after stop | N/A |
| Chromium/FFmpeg peaks | not measured | N/A |

Do **not** interpret as 4K / 60s / Fly capacity.

## Cleanup

| Action | Result |
|------|--------|
| Smoke containers removed | PASS |
| Temporary media | none retained (chromium user-data cleaned in script) |
| Local image retained | YES (`footiebitz/headless-worker:2e2d2-local`) — acceptable |
| `.env.local` edited | NO |
| Commit / push | NONE |

## Local suites after stop

| Suite | Result |
|------|--------|
| `test:headless-hosted-worker-container-authority` | PASS (6) |
| `test:headless-deployable-worker-packaging-2e2c2` | PASS (11) |
| `git diff --check` | PASS |

## Provider / Fly / routes

| Item | Status |
|------|--------|
| Neon / R2 / Upstash / Clerk contact | NONE |
| Fly configuration | NOT STARTED |
| Fly deployment | NOT RUN |
| Production routes | CONFIGURATION-BLOCKED |

## Eligibility

**Not eligible** for Fly staging preparation until Chromium can start under the non-root worker **without** `--no-sandbox` (sandbox helper / user-namespace readiness in the image/runtime must be resolved in a later authorized packaging fix).
