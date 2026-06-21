"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { deleteDraft, listDrafts, toDraftSummary } from "@/features/drafts";
import type { DraftStatus, StoryDraftSummary } from "@/features/drafts";
import {
  studioChip,
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/studioUi";

function formatDraftTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDraftStatus(status: DraftStatus): string {
  return status === "exported" ? "Exported" : "Draft";
}

function statusChipClass(status: DraftStatus): string {
  return status === "exported"
    ? `${studioChip} shrink-0 bg-accent-soft/80 text-accent ring-accent/20`
    : `${studioChip} shrink-0`;
}

function promptPreview(prompt: string | undefined, title: string): string {
  const source = prompt?.trim() || title.trim();
  if (!source) {
    return "No prompt";
  }

  if (source.length <= 120) {
    return source;
  }

  return `${source.slice(0, 117).trimEnd()}…`;
}

export default function DraftsDashboard() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<StoryDraftSummary[]>(() =>
    listDrafts().map(toDraftSummary),
  );

  const refreshDrafts = useCallback(() => {
    setDrafts(listDrafts().map(toDraftSummary));
  }, []);

  const handleDelete = (draft: StoryDraftSummary) => {
    const confirmed = window.confirm(`Delete "${draft.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    deleteDraft(draft.id);
    refreshDrafts();
  };

  return (
    <section aria-label="Draft dashboard" className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={studioStepLabel}>Drafts</p>
          <h1 className={studioSectionTitle}>Your stories</h1>
          <p className={`${studioSectionDesc} mt-2`}>
            Saved locally in this browser — no sign-in required.
          </p>
        </div>
        <Link href="/create" className={`${studioPrimaryButton} w-full sm:w-auto`}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          New Story
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className={`${studioPanel} space-y-4 px-5 py-10 text-center sm:px-8 sm:py-12`}>
          <p className="text-sm font-medium text-foreground/90">
            No drafts yet. Create your first story.
          </p>
          <Link href="/create" className={`${studioPrimaryButton} inline-flex`}>
            Create a Story
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <article className={`${studioPanel} px-4 py-4 sm:px-5 sm:py-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-sm font-semibold text-foreground/95 sm:text-[15px]">
                        {draft.title}
                      </h2>
                      <span className={statusChipClass(draft.status)}>
                        {formatDraftStatus(draft.status)}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                      {promptPreview(draft.prompt, draft.title)}
                    </p>

                    <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-foreground/70">Created</dt>
                        <dd className="mt-0.5">{formatDraftTimestamp(draft.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/70">Updated</dt>
                        <dd className="mt-0.5">{formatDraftTimestamp(draft.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/70">Scenes</dt>
                        <dd className="mt-0.5">{draft.sceneCount}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/70">Duration</dt>
                        <dd className="mt-0.5">{draft.totalDuration}s</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => router.push(`/editor/${draft.id}`)}
                      className={`${studioPrimaryButton} w-full sm:min-w-[6.5rem]`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(draft)}
                      aria-label={`Delete ${draft.title}`}
                      className={`${studioSecondaryButton} w-full text-red-300/90 hover:bg-red-950/20 hover:text-red-300 sm:min-w-[6.5rem]`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <p className={`${studioSubtleText} mt-6`}>
        Drafts are stored in localStorage on this device. Audio and uploaded images may need to be
        re-added after a full page reload.
      </p>
    </section>
  );
}
