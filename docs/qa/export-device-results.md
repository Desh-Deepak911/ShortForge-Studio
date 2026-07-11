# Export Device Results (Sprint 6F)

**Rule:** Do not fabricate results. Distinguish evidence classes clearly.

| Evidence class | Meaning |
| --- | --- |
| `automated-semantic` | Node verification / manifest / parity tests |
| `local-artifact` | Real artifact produced on a developer machine |
| `manual-device` | Human playback checklist on a named browser/OS |
| `not-tested` | No run recorded yet |

## Golden projects

| Golden | Format | Focus | Automated semantic | Local artifact | Manual device |
| --- | --- | --- | --- | --- | --- |
| A | WebM silent | Images + final caption | Pass (suite) | Not tested | Not tested |
| B | WebM voice | Mixed media + voice | Pass (suite) | Not tested | Not tested |
| C | WebM voice+music | Primary regression | Pass (suite) | Not tested | Not tested |
| D | MP4 silent | H.264 visual | Pass (suite) | Not tested | Not tested |
| E | MP4 voice | AAC mux | Pass (suite) | Not tested | Not tested |
| F | MP4 voice+music | Full MP4 | Pass (suite) | Not tested | Not tested |
| G | WebM/MP4 stress | Long-run memory | Pass (suite) | Not tested | Not tested |

## Browser matrix

| Browser | Classification | Evidence |
| --- | --- | --- |
| Chromium / Chrome (desktop) | Supported (720p candidate) | automated-semantic; manual device matrix incomplete |
| Safari | Supported with warnings | not-tested |
| Firefox | Supported with warnings | not-tested |

## 720p

| Item | Status |
| --- | --- |
| Policy | Approved (conservative thresholds) |
| Measured wall-clock / memory on CI devices | Not tested (device) |
| Chunk-seam visual inspection | Automated seam suite; visual device Not tested |

## 1080p

| Item | Status |
| --- | --- |
| Policy | Capability-gated (Approved / Warning / Blocked) — Sprint 6F.1 |
| Measured wall-clock / memory on devices | Not tested (device) — see [`export-1080p-results.md`](./export-1080p-results.md) |
| Default | No longer blanket-blocked; video-heavy long remains blocked |

## Runtime MP4 probe

| Item | Status |
| --- | --- |
| Probe module | Implemented |
| Preflight blocks MP4 when unavailable | Automated |
| Real browser encode probe on CI | Not tested (Node defaults for semantic CI) |

## How to record a manual run

1. Open `/dev/export-qa` in development.
2. Select Golden A–G and complete manual checks.
3. Download the QA JSON report.
4. Paste a row here with browser, OS, golden id, format, pass/fail, and link/path to the JSON.

## Gaps that do not auto-block 720p freeze

- Safari / Firefox golden playback matrix
- Real binary artifact CI (`test:export-golden-artifacts` full encode)
- 1080p device experiment

These remain documented debt, not invented passes.
