"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { StudioConfirmDialog } from "@/components/studio-overlay";
import { deleteDraft, getDraft, listDrafts, resolveDraftHref, toDraftSummary } from "@/features/drafts";
import { clearDraftSession, seedDraftSession } from "@/features/drafts/session";
import type { DraftWorkflowStatus, StoryDraftSummary } from "@/features/drafts";
import {
  studioChip,
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";

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

function workflowStatusChipClass(status: DraftWorkflowStatus): string {
  switch (status) {
    case "exported":
      return `${studioChip} shrink-0 bg-accent-soft/80 text-accent ring-accent/20`;
    case "storyboard_ready":
      return `${studioChip} shrink-0 bg-emerald-500/10 text-emerald-300/90 ring-emerald-500/20`;
    case "voice_ready":
      return `${studioChip} shrink-0 bg-sky-500/10 text-sky-300/90 ring-sky-500/20`;
    case "script_review":
    default:
      return `${studioChip} shrink-0`;
  }
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
  const [pendingDelete, setPendingDelete] = useState<StoryDraftSummary | null>(null);

  const refreshDrafts = useCallback(() => {
    setDrafts(listDrafts().map(toDraftSummary));
  }, []);

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }

    deleteDraft(pendingDelete.id);
    clearDraftSession(pendingDelete.id);
    setPendingDelete(null);
    refreshDrafts();
  };

  return (
    <section aria-label="Draft dashboard" className="mx-auto min-w-0 max-w-3xl">
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
          Write Story
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className={`${studioPanel} space-y-3 px-5 py-10 text-center sm:px-8 sm:py-12`}>
          <p className="text-sm font-medium text-foreground/90">No stories yet</p>
          <p className={`${studioSubtleText} mx-auto max-w-sm`}>
            Stories you create save here on this device — no sign-in needed.
          </p>
          <Link href="/create" className={`${studioPrimaryButton} inline-flex`}>
            Write Story
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <article className={`${studioPanel} min-w-0 px-4 py-4 sm:px-5 sm:py-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-sm font-semibold text-foreground/95 sm:text-[15px]">
                        {draft.title}
                      </h2>
                      <span className={workflowStatusChipClass(draft.workflowStatus)}>
                        {draft.workflowStatusLabel}
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
                        <dd className="mt-0.5">{formatDisplayDurationSec(draft.totalDuration)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        const storedDraft = getDraft(draft.id);
                        if (storedDraft) {
                          seedDraftSession(storedDraft);
                          router.push(resolveDraftHref(storedDraft));
                          return;
                        }

                        router.push(`/editor/${draft.id}`);
                      }}
                      className={`${studioPrimaryButton} w-full sm:min-w-[6.5rem]`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(draft)}
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

      <StudioConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete draft?"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.title}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </section>
  );
}
