"use client";

/**
 * Dev-only Sprint 10H / 10H.1 Retention Story local product sign-off harness.
 * Not linked from production navigation. Unavailable in production.
 * Tri-state evidence only — never infer Pass from structural checks alone.
 */

import { useCallback, useMemo, useState, type ChangeEvent } from "react";

import {
  AUDIO_FIRST_CHECK_KEYS,
  AUDIO_FIRST_CHECK_LABELS,
  AUDIO_FIRST_POLICY_COPY,
  CREATE_CHECK_KEYS,
  CREATE_CHECK_LABELS,
  GENERATED_CHECK_KEYS,
  GENERATED_CHECK_LABELS,
  PERSISTENCE_CHECK_KEYS,
  PERSISTENCE_CHECK_LABELS,
  buildSafeRetentionStoryEvidenceReport,
  createEmptyChecklist,
  deriveLocalSignOffVerdict,
  formatSafeBrowserLabel,
  summarizeChecklist,
  type AudioFirstCheckKey,
  type CreateCheckKey,
  type EvidenceCheckResult,
  type GeneratedCheckKey,
  type PersistenceCheckKey,
} from "@/features/retention-story/qa/retention-story-local-evidence";
import {
  RETENTION_STORY_GOLDEN_PROJECTS,
  type RetentionStoryGoldenId,
} from "@/verification/retention-story/goldens";

const EVIDENCE_OPTIONS: readonly EvidenceCheckResult[] = [
  "not-tested",
  "pass",
  "fail",
];

function TriStateChecklistGroup<T extends string>({
  title,
  keys,
  labels,
  checks,
  onChange,
  groupId,
}: {
  title: string;
  keys: readonly T[];
  labels: Record<T, string>;
  checks: Record<T, EvidenceCheckResult>;
  onChange: (key: T, value: EvidenceCheckResult) => void;
  groupId: string;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 bg-white/80 p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <ul className="space-y-3 text-[12px] text-neutral-800">
        {keys.map((key) => {
          const name = `${groupId}-${key}`;
          return (
            <li key={key} className="space-y-1">
              <p>{labels[key]}</p>
              <div
                role="radiogroup"
                aria-label={labels[key]}
                className="flex flex-wrap gap-3"
              >
                {EVIDENCE_OPTIONS.map((option) => (
                  <label key={option} className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={name}
                      value={option}
                      checked={checks[key] === option}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        onChange(key, e.target.value as EvidenceCheckResult)
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function RetentionStoryQaPage() {
  const [goldenId, setGoldenId] = useState<RetentionStoryGoldenId>(
    "rs-30-auto-fast-story",
  );
  const [create, setCreate] = useState(() =>
    createEmptyChecklist(CREATE_CHECK_KEYS),
  );
  const [generated, setGenerated] = useState(() =>
    createEmptyChecklist(GENERATED_CHECK_KEYS),
  );
  const [persistence, setPersistence] = useState(() =>
    createEmptyChecklist(PERSISTENCE_CHECK_KEYS),
  );
  const [audioFirst, setAudioFirst] = useState(() =>
    createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS),
  );
  const [audioFirstConfigured, setAudioFirstConfigured] = useState(false);
  const [notes, setNotes] = useState("");
  const [sessionStartedAt] = useState(() => new Date().toISOString());

  const selected = useMemo(
    () => RETENTION_STORY_GOLDEN_PROJECTS.find((g) => g.id === goldenId),
    [goldenId],
  );

  const summary = useMemo(() => {
    const parts = [
      summarizeChecklist(create),
      summarizeChecklist(generated),
      summarizeChecklist(persistence),
      summarizeChecklist(audioFirst),
    ];
    return parts.reduce(
      (acc, cur) => ({
        pass: acc.pass + cur.pass,
        fail: acc.fail + cur.fail,
        notTested: acc.notTested + cur.notTested,
      }),
      { pass: 0, fail: 0, notTested: 0 },
    );
  }, [create, generated, persistence, audioFirst]);

  const verdict = useMemo(
    () =>
      deriveLocalSignOffVerdict({
        create,
        generated,
        persistence,
        audioFirst,
        audioFirstConfiguredForSignOff: audioFirstConfigured,
      }),
    [audioFirst, audioFirstConfigured, create, generated, persistence],
  );

  const browserLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Browser";
    return formatSafeBrowserLabel(navigator.userAgent);
  }, []);

  const resetAll = useCallback(() => {
    setCreate(createEmptyChecklist(CREATE_CHECK_KEYS));
    setGenerated(createEmptyChecklist(GENERATED_CHECK_KEYS));
    setPersistence(createEmptyChecklist(PERSISTENCE_CHECK_KEYS));
    setAudioFirst(createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS));
    setNotes("");
    setAudioFirstConfigured(false);
  }, []);

  const downloadEvidence = useCallback(() => {
    const report = buildSafeRetentionStoryEvidenceReport({
      create,
      generated,
      persistence,
      audioFirst,
      audioFirstConfiguredForSignOff: audioFirstConfigured,
      notes: `golden=${goldenId}; session=${sessionStartedAt}; ${notes}`,
      browser: typeof navigator !== "undefined" ? navigator.userAgent : "Browser",
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `retention-story-local-evidence-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    audioFirst,
    audioFirstConfigured,
    create,
    generated,
    goldenId,
    notes,
    persistence,
    sessionStartedAt,
  ]);

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-semibold">Unavailable</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Retention Story QA harness is not available in production builds.
        </p>
      </main>
    );
  }

  const verdictLabel =
    verdict === "eligible"
      ? "ELIGIBLE (all required observed Pass)"
      : verdict === "capability-gated-audio"
        ? "CORE LOCAL READY — audio-first capability-gated"
        : verdict === "incomplete"
          ? "INCOMPLETE — not eligible"
          : "NOT ELIGIBLE";

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-stone-50 to-stone-100 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-800/70">
            Sprint 10H.1 · Dev QA
          </p>
          <h1 className="font-serif text-3xl tracking-tight">
            Retention Story Intelligence
          </h1>
          <p className="max-w-2xl text-sm text-stone-600">
            Local product sign-off checklist. Mark Pass only after you observe
            the behavior in Create / Review. Structural automated suites never
            promote these to Pass. Incomplete checklists cannot produce an
            eligible verdict.
          </p>
          <p className="text-[12px] text-stone-500">
            Browser: {browserLabel} · Session: {sessionStartedAt}
          </p>
        </header>

        <section className="space-y-3 rounded-lg border border-emerald-200/70 bg-white/70 p-4">
          <h2 className="text-sm font-semibold">Operator workflow</h2>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-stone-700">
            <li>
              Open Create → confirm Story Strategy defaults to Auto; try
              Retention-first / Standard; change duration across 15–60s.
            </li>
            <li>
              Generate a 25–35s story; confirm narration feel, payoff, and Review
              Story intelligence panel.
            </li>
            <li>Save draft, reload, confirm narration + explainability.</li>
            <li>
              If voice/TTS is configured for sign-off, enable the audio-first
              toggle below and complete those checks; otherwise leave them Not
              tested.
            </li>
            <li>Record tri-state evidence and download the report.</li>
          </ol>
          <p className="text-[12px] text-stone-500">
            Live model gate (separate):{" "}
            <code className="rounded bg-stone-100 px-1">
              RETENTION_LIVE_QA=1 QA_BASE_URL=http://localhost:3000 npm run
              test:retention-story-live-qa
            </code>
          </p>
        </section>

        <section className="space-y-2 rounded-lg border border-neutral-200 bg-white/80 p-4">
          <label className="block text-sm font-semibold" htmlFor="golden">
            Reference golden fixture
          </label>
          <select
            id="golden"
            className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            value={goldenId}
            onChange={(e) =>
              setGoldenId(e.target.value as RetentionStoryGoldenId)
            }
          >
            {RETENTION_STORY_GOLDEN_PROJECTS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id} — {g.title}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="text-[12px] text-stone-600">
              Proves: {selected.proves}
            </p>
          ) : null}
        </section>

        <TriStateChecklistGroup
          title="Core Create"
          groupId="create"
          keys={CREATE_CHECK_KEYS}
          labels={CREATE_CHECK_LABELS}
          checks={create}
          onChange={(key: CreateCheckKey, value) =>
            setCreate((prev) => ({ ...prev, [key]: value }))
          }
        />

        <TriStateChecklistGroup
          title="Core generated story"
          groupId="generated"
          keys={GENERATED_CHECK_KEYS}
          labels={GENERATED_CHECK_LABELS}
          checks={generated}
          onChange={(key: GeneratedCheckKey, value) =>
            setGenerated((prev) => ({ ...prev, [key]: value }))
          }
        />

        <TriStateChecklistGroup
          title="Core persistence"
          groupId="persistence"
          keys={PERSISTENCE_CHECK_KEYS}
          labels={PERSISTENCE_CHECK_LABELS}
          checks={persistence}
          onChange={(key: PersistenceCheckKey, value) =>
            setPersistence((prev) => ({ ...prev, [key]: value }))
          }
        />

        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h3 className="text-sm font-semibold">Audio-first policy</h3>
          <p className="text-[12px] text-stone-700">{AUDIO_FIRST_POLICY_COPY}</p>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={audioFirstConfigured}
              onChange={(e) => {
                setAudioFirstConfigured(e.target.checked);
                if (!e.target.checked) {
                  setAudioFirst(createEmptyChecklist(AUDIO_FIRST_CHECK_KEYS));
                }
              }}
            />
            Voice/TTS is configured for Sprint 10 sign-off (make audio-first
            Core-required)
          </label>
        </section>

        <TriStateChecklistGroup
          title="Core audio-first"
          groupId="audio-first"
          keys={AUDIO_FIRST_CHECK_KEYS}
          labels={AUDIO_FIRST_CHECK_LABELS}
          checks={audioFirst}
          onChange={(key: AudioFirstCheckKey, value) =>
            setAudioFirst((prev) => ({ ...prev, [key]: value }))
          }
        />

        <section className="space-y-2 rounded-lg border border-neutral-200 bg-white/80 p-4">
          <label className="block text-sm font-semibold" htmlFor="notes">
            Operator notes
          </label>
          <textarea
            id="notes"
            className="min-h-[88px] w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observed outcomes — no secrets, tokens, or credential URLs."
          />
          <p className="text-[12px] font-medium text-stone-800">
            Local verdict: {verdictLabel}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[12px] text-stone-600">
              Summary: {summary.pass} Pass · {summary.fail} Fail ·{" "}
              {summary.notTested} Not tested
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetAll}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50"
              >
                Reset All
              </button>
              <button
                type="button"
                onClick={downloadEvidence}
                className="rounded bg-emerald-800 px-3 py-1.5 text-sm text-white hover:bg-emerald-900"
              >
                Download evidence JSON
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
