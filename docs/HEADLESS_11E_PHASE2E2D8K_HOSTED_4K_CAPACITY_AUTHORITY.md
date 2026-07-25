# Sprint 11E Phase 2E.2D.8K — Hosted 4K Capacity Authority Preparation

Local-only phase. No provider contact. No hosted 4K matrix execution.

## Canonical 4K production profiles

| Profile | Native target | FPS | Video | Audio | Container |
|---------|---------------|-----|-------|-------|-----------|
| `4k-webm-30` | 2160×3840 | 30 | VP9 (`libvpx-vp9`) | Opus | WebM |
| `4k-mp4-30` | 2160×3840 | 30 | H.264 (`libx264`) | AAC | MP4 |

**1080p snapshot:** 4K jobs keep a frozen 1080p ExportManifest; pixels elevate only at render-target (`apply-output-profile.ts`, `render-target.ts`).

### Duration limits (both profiles)

| Limit | Content ms | Render ms | Max frames |
|-------|------------|-----------|------------|
| Operational | 60_000 | 60_400 | 1812 |
| Architectural | 180_000 | 180_400 | (derived) |

### Resource limits (both profiles)

| Limit | Value |
|-------|-------|
| maxSingleFrameBytes | 24 MiB |
| maxAggregateFrameBytes | 48 GiB |
| maxWorkspaceBytes | 1536 MiB |
| maxArtifactBytes | 768 MiB |
| videoBitrate | 20M |
| audioBitrate | 96k |

## Certification levels

### A. Short functional smoke

- contentDurationMs: **2000**
- renderDurationMs: **2400**
- contentFrames: **60**
- renderedFrames: **72**
- paddingTailFrames: **12**
- Does **not** infer operational-duration capacity

### B. Operational-duration capacity

- contentDurationMs: **60000**
- renderDurationMs: **60400**
- contentFrames: **1800**
- renderedFrames: **1812**
- paddingTailFrames: **12**
- Separate certification — must not be inferred from 2s smoke

## Smallest authorized short hosted 4K matrix (35 cases)

**Shared preflight (7):** `env.config`, `fly.verify_machine_healthy`, `fly.render_machine_healthy`, `fly.render_vm_shape`, `fly.immutable_image_equality`, `neon.schema_fingerprint`, `outbox.quiescence`

**Per profile full production path (13 each):** job.create_queued → dispatch_outbox.intent → upstash.enqueue_render → hosted.render_claim → chromium → ffmpeg → R2 upload → owned_object.finalized → binding → succeeded CAS → download/codec verify → replay → cleanup

**Cross-cutting (2):** `process_tree.memory_observation`, `evidence.privacy`

Gate env: `HEADLESS_FLY_RENDER_4K_QA=1` (separate from `HEADLESS_FLY_RENDER_QA`).

Precontact refuses unless: 4K gate, image `7a97f472…`, render VM performance/4/8192, verify=1 render=1, quiescent outbox/claims, schema/secrets ready.

## Process-tree memory observer

Module: `hosted-4k-process-tree-memory-observer.ts`

- Samples on Linux render Machine via `/proc/{pid}/status` (VmRSS)
- Collects worker coordinator + Chromium + FFmpeg + descendants
- Excludes observer and SSH session PIDs
- Reports: summed RSS, peak RSS, sample count, interval (250ms cadence)
- Never substitutes Node-only RSS, macOS RSS, or Fly billing memory
- Emits no command lines, env values, raw PIDs, or secrets

## Frozen headroom rule

- Render VM limit: **8192 MiB**
- OOM safety ratio: **0.85**
- Peak RSS ceiling: **6_963_148_800 bytes** (8192 × 1024² × 0.85)
- Full capacity claim requires: complete sampling, no OOM/restart, peak ≤ VM ceiling, peak ≤ profile workspace + artifact budget

## Accepted backend evidence (unchanged)

- Render-live 25/25 PASS: `f808db98a4925057e235dbda9f212232959b66089d4bce1e0476e52f9468f693`
- Execution-probe PASS: `c7f944dba578539ad4f3ebc2431f38fb60640c041cb582bb28e239067adf500a`

## Worker artifact hashes (must remain byte-identical)

- worker: `79852daa3fc005e41968bd4a3b3d942be3ab4f094243c42caf9cc2834e3ab1fb`
- page: `677bd1a8e01c7ebf7c97500e70d78da89892c7c72c09b689d6fcd9c4436c5efe`
- BUILD_INFO: `6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a`

## Staging

Pinned at verify=1/render=1 on image `7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794`.
