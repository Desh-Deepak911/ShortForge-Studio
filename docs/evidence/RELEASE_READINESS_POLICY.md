# Release-readiness evidence policy

## Purpose

A readiness document may say **ready**, **conditionally ready**, or **not_ready**. Those words are claims about a frozen tree plus named evidence. They are not marketing status.

## What may be called certified

Only a claim that a **current** evidence file supports, including:

- the command or harness
- the tree / fingerprint when the run required one
- provider-call budget when providers were used
- Pass / Fail / conditional language already in that file

Allowed examples: a named Headless harness Pass, a voice-speed matrix recorded in `VOICE_SPEED_CLARITY_AUDIT.md`, provider-free story-quality gates.

## What may not be called certified

- Passing `npm run lint` or a subset of verification
- A previous sprint freeze on a different tree
- Manual Studio smoke that is still unchecked
- Browser export success implying Headless success
- Headless 4K capacity implying every 4K story
- Story `model_direct` on one sample implying ranking readiness
- Planned ROADMAP items

## Honesty rules

- Conditional, incomplete, baseline-only, and failed records stay labeled that way
- Do not rewrite historical numbers as if they were measured today
- Do not move Headless or SHA-bound QA files without a path-and-SHA migration
- Keep raw provider payloads and media out of Git
- An honest quality warning does not block readiness by itself
- Incorrect rescue of supported coherent speech does block story readiness

## Current top-level verdicts

Read the files; do not copy stale summaries from chat:

- Story: **not_ready**
- Video quality: **conditionally ready**
- Brand sting export baseline: **failed**
