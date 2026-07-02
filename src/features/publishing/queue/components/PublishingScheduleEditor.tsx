"use client";

import {
  DEFAULT_PUBLISHING_TIMEZONE,
  buildPublishingScheduleFromLocalInput,
  formatPublishingSchedule,
  localInputFromSchedule,
  PUBLISHING_TIMEZONE_OPTIONS,
  type LocalScheduleInput,
} from "@/features/publishing/publishing-schedule.utils";
import type {
  PublishingPackage,
  PublishingScheduleRecurrence,
} from "@/features/publishing/publishing.types";
import {
  studioFieldLabel,
  studioInput,
  studioSecondaryButton,
  studioSelect,
  studioSelectChevron,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

interface PublishingScheduleEditorProps {
  pkg: PublishingPackage;
  onSave: (input: LocalScheduleInput) => void;
  onClear: () => void;
  onApplyDailyPreset: () => void;
}

export default function PublishingScheduleEditor({
  pkg,
  onSave,
  onClear,
  onApplyDailyPreset,
}: PublishingScheduleEditorProps) {
  const initial = useMemo(() => localInputFromSchedule(pkg.schedule), [pkg.schedule]);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [timezone, setTimezone] = useState(initial.timezone ?? DEFAULT_PUBLISHING_TIMEZONE);
  const [recurrence, setRecurrence] = useState<PublishingScheduleRecurrence>(
    initial.recurrence ?? "none",
  );

  const schedulePreview = buildPublishingScheduleFromLocalInput({ date, time, timezone, recurrence });
  const schedulePreviewLabel = schedulePreview ? formatPublishingSchedule({
    ...pkg,
    schedule: schedulePreview,
  }) : null;

  return (
    <section className="space-y-3 rounded-xl bg-surface-elevated/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground/90">Publishing reminder</p>
        <p className={`${studioSubtleText} mt-1`}>
          Reminder-only — FootieBitz will not post automatically. Alerts appear while this page is
          open.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`schedule-date-${pkg.id}`} className={studioFieldLabel}>
            Date
          </label>
          <input
            id={`schedule-date-${pkg.id}`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={`${studioInput} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`schedule-time-${pkg.id}`} className={studioFieldLabel}>
            Time
          </label>
          <input
            id={`schedule-time-${pkg.id}`}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={`${studioInput} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`schedule-timezone-${pkg.id}`} className={studioFieldLabel}>
            Timezone
          </label>
          <div className="relative mt-1.5">
            <select
              id={`schedule-timezone-${pkg.id}`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className={studioSelect}
            >
              {PUBLISHING_TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevron} />
          </div>
        </div>
        <div>
          <label htmlFor={`schedule-recurrence-${pkg.id}`} className={studioFieldLabel}>
            Recurrence
          </label>
          <div className="relative mt-1.5">
            <select
              id={`schedule-recurrence-${pkg.id}`}
              value={recurrence}
              onChange={(event) =>
                setRecurrence(event.target.value as PublishingScheduleRecurrence)
              }
              className={studioSelect}
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <ChevronDown className={studioSelectChevron} />
          </div>
        </div>
      </div>

      {schedulePreviewLabel ? (
        <p className={studioSubtleText}>Preview: {schedulePreviewLabel}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className={studioSecondaryButton}
          onClick={() => onSave({ date, time, timezone, recurrence })}
        >
          Save reminder
        </button>
        <button type="button" className={studioSecondaryButton} onClick={onApplyDailyPreset}>
          Daily 10 PM IST
        </button>
        {pkg.schedule ? (
          <button type="button" className={studioSecondaryButton} onClick={onClear}>
            Clear reminder
          </button>
        ) : null}
      </div>
    </section>
  );
}
