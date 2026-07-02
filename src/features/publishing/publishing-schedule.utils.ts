import type {
  PublishingPackage,
  PublishingSchedule,
  PublishingScheduleRecurrence,
} from "./publishing.types";

export const DEFAULT_PUBLISHING_TIMEZONE = "Asia/Kolkata";

export const PUBLISHING_TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "India (IST — Asia/Kolkata)" },
  { value: "Europe/London", label: "UK (Europe/London)" },
  { value: "America/New_York", label: "US Eastern (America/New_York)" },
  { value: "America/Los_Angeles", label: "US Pacific (America/Los_Angeles)" },
  { value: "UTC", label: "UTC" },
] as const;

export type PublishingScheduleReminderState =
  | "unscheduled"
  | "upcoming"
  | "due_today"
  | "overdue";

export interface PublishingScheduleStateResult {
  state: PublishingScheduleReminderState;
  nextOccurrenceIso?: string;
  label: string;
}

export interface LocalScheduleInput {
  date: string;
  time: string;
  timezone?: string;
  recurrence?: PublishingScheduleRecurrence;
}

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const DUE_GRACE_BEFORE_MS = 30 * 60 * 1000;
const DUE_GRACE_AFTER_MS = 3 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function clonePackage(pkg: PublishingPackage): PublishingPackage {
  return structuredClone(pkg);
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function parseDateValue(value: string): { year: number; month: number; day: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

/** Reads calendar/time parts for an instant in an IANA timezone. */
export function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    weekday: weekdayMap[read("weekday")] ?? 0,
  };
}

/** Converts a local date/time in a timezone to UTC milliseconds. */
export function zonedLocalDateTimeToUtcMs(
  parts: Pick<ZonedDateTimeParts, "year" | "month" | "day" | "hour" | "minute">,
  timeZone: string,
): number {
  let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const local = getZonedDateTimeParts(new Date(timestamp), timeZone);
    const desiredAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    const actualAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      0,
    );

    const delta = desiredAsUtc - actualAsUtc;
    if (delta === 0) {
      break;
    }

    timestamp += delta;
  }

  return timestamp;
}

function addCalendarDays(
  parts: Pick<ZonedDateTimeParts, "year" | "month" | "day">,
  days: number,
): Pick<ZonedDateTimeParts, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function normalizeRecurrence(value: unknown): PublishingScheduleRecurrence {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  return "none";
}

/** Normalizes schedule input — reminder-only, safe timezone fallback. */
export function normalizePublishingSchedule(
  partial: Partial<PublishingSchedule> | undefined,
): PublishingSchedule | undefined {
  if (!partial?.scheduledForIso?.trim()) {
    return undefined;
  }

  const scheduledDate = new Date(partial.scheduledForIso);
  if (Number.isNaN(scheduledDate.getTime())) {
    return undefined;
  }

  const timezone =
    partial.timezone && isValidTimezone(partial.timezone)
      ? partial.timezone
      : DEFAULT_PUBLISHING_TIMEZONE;

  return {
    scheduledForIso: scheduledDate.toISOString(),
    timezone,
    recurrence: normalizeRecurrence(partial.recurrence),
    reminderOnly: true,
  };
}

export function buildPublishingScheduleFromLocalInput(
  input: LocalScheduleInput,
): PublishingSchedule | null {
  const date = parseDateValue(input.date);
  const time = parseTimeValue(input.time);
  if (!date || !time) {
    return null;
  }

  const timezone = input.timezone && isValidTimezone(input.timezone)
    ? input.timezone
    : DEFAULT_PUBLISHING_TIMEZONE;

  const scheduledForIso = new Date(
    zonedLocalDateTimeToUtcMs(
      {
        year: date.year,
        month: date.month,
        day: date.day,
        hour: time.hour,
        minute: time.minute,
      },
      timezone,
    ),
  ).toISOString();

  return (
    normalizePublishingSchedule({
      scheduledForIso,
      timezone,
      recurrence: input.recurrence ?? "none",
      reminderOnly: true,
    }) ?? null
  );
}

/** Builds a daily reminder schedule such as “Daily at 10 PM IST”. */
export function buildDailyPublishingSchedule(input: {
  hour: number;
  minute?: number;
  timezone?: string;
  from?: Date;
}): PublishingSchedule {
  const timezone = input.timezone && isValidTimezone(input.timezone)
    ? input.timezone
    : DEFAULT_PUBLISHING_TIMEZONE;
  const minute = input.minute ?? 0;
  const from = input.from ?? new Date();
  const fromParts = getZonedDateTimeParts(from, timezone);

  let dayParts = {
    year: fromParts.year,
    month: fromParts.month,
    day: fromParts.day,
  };

  let occurrenceMs = zonedLocalDateTimeToUtcMs(
    { ...dayParts, hour: input.hour, minute },
    timezone,
  );

  if (occurrenceMs <= from.getTime()) {
    dayParts = addCalendarDays(dayParts, 1);
    occurrenceMs = zonedLocalDateTimeToUtcMs(
      { ...dayParts, hour: input.hour, minute },
      timezone,
    );
  }

  return {
    scheduledForIso: new Date(occurrenceMs).toISOString(),
    timezone,
    recurrence: "daily",
    reminderOnly: true,
  };
}

function getAnchorTimeParts(schedule: PublishingSchedule): Pick<ZonedDateTimeParts, "hour" | "minute"> {
  const anchor = getZonedDateTimeParts(new Date(schedule.scheduledForIso), schedule.timezone);
  return { hour: anchor.hour, minute: anchor.minute };
}

function getNextOccurrenceMs(schedule: PublishingSchedule, now: Date): number {
  const recurrence = normalizeRecurrence(schedule.recurrence);
  const anchorMs = new Date(schedule.scheduledForIso).getTime();

  if (recurrence === "none") {
    return anchorMs;
  }

  const nowParts = getZonedDateTimeParts(now, schedule.timezone);
  const anchorParts = getZonedDateTimeParts(new Date(schedule.scheduledForIso), schedule.timezone);
  const timeParts = getAnchorTimeParts(schedule);

  if (recurrence === "daily") {
    let dayParts = {
      year: nowParts.year,
      month: nowParts.month,
      day: nowParts.day,
    };

    let candidateMs = zonedLocalDateTimeToUtcMs({ ...dayParts, ...timeParts }, schedule.timezone);
    if (candidateMs <= now.getTime()) {
      dayParts = addCalendarDays(dayParts, 1);
      candidateMs = zonedLocalDateTimeToUtcMs({ ...dayParts, ...timeParts }, schedule.timezone);
    }

    return candidateMs;
  }

  const dayParts = {
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  };

  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDay = addCalendarDays(dayParts, offset);
    const candidateParts = {
      ...candidateDay,
      ...timeParts,
    };
    const candidateMs = zonedLocalDateTimeToUtcMs(candidateParts, schedule.timezone);
    const candidateWeekday = getZonedDateTimeParts(new Date(candidateMs), schedule.timezone).weekday;

    if (candidateWeekday === anchorParts.weekday && candidateMs > now.getTime()) {
      return candidateMs;
    }
  }

  return anchorMs;
}

function isFullyPublished(pkg: PublishingPackage): boolean {
  return pkg.status === "published";
}

function reminderStateLabel(state: PublishingScheduleReminderState): string {
  switch (state) {
    case "due_today":
      return "Due today";
    case "upcoming":
      return "Upcoming";
    case "overdue":
      return "Overdue";
    default:
      return "Unscheduled";
  }
}

/** Resolves reminder state for queue badges — client-side only, no cron guarantees. */
export function getPublishingScheduleState(
  pkg: PublishingPackage,
  now: Date = new Date(),
): PublishingScheduleStateResult {
  const schedule = normalizePublishingSchedule(pkg.schedule);
  if (!schedule || isFullyPublished(pkg)) {
    return { state: "unscheduled", label: reminderStateLabel("unscheduled") };
  }

  const nextOccurrenceMs = getNextOccurrenceMs(schedule, now);
  const nextOccurrenceIso = new Date(nextOccurrenceMs).toISOString();
  const nowMs = now.getTime();
  const dueWindowStart = nextOccurrenceMs - DUE_GRACE_BEFORE_MS;
  const dueWindowEnd = nextOccurrenceMs + DUE_GRACE_AFTER_MS;

  if (nowMs >= dueWindowStart && nowMs <= dueWindowEnd) {
    return {
      state: "due_today",
      nextOccurrenceIso,
      label: reminderStateLabel("due_today"),
    };
  }

  if (nowMs < dueWindowStart) {
    return {
      state: "upcoming",
      nextOccurrenceIso,
      label: reminderStateLabel("upcoming"),
    };
  }

  return {
    state: "overdue",
    nextOccurrenceIso,
    label: reminderStateLabel("overdue"),
  };
}

function formatTimeInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
  }).format(date);
}

function timezoneAbbreviation(timeZone: string): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(new Date());

  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/** Human-readable schedule label for queue cards. */
export function formatPublishingSchedule(pkg: PublishingPackage): string | null {
  const schedule = normalizePublishingSchedule(pkg.schedule);
  if (!schedule) {
    return null;
  }

  const anchor = new Date(schedule.scheduledForIso);
  const timeLabel = formatTimeInTimezone(anchor, schedule.timezone);
  const tzLabel = timezoneAbbreviation(schedule.timezone);

  switch (normalizeRecurrence(schedule.recurrence)) {
    case "daily":
      return `Daily at ${timeLabel} ${tzLabel}`;
    case "weekly":
      return `Weekly at ${timeLabel} ${tzLabel}`;
    default:
      return `${formatDateInTimezone(anchor, schedule.timezone)} at ${timeLabel} ${tzLabel}`;
  }
}

/** Applies a reminder-only schedule immutably. */
export function updatePublishingSchedule(
  pkg: PublishingPackage,
  schedule: PublishingSchedule,
): PublishingPackage {
  const next = clonePackage(pkg);
  next.schedule = normalizePublishingSchedule(schedule);
  next.updatedAt = nowIso();
  return next;
}

/** Clears schedule metadata immutably — history-safe when already published. */
export function clearPublishingSchedule(pkg: PublishingPackage): PublishingPackage {
  const next = clonePackage(pkg);
  next.schedule = undefined;
  next.updatedAt = nowIso();
  return next;
}

const REMINDER_STATE_SORT_ORDER: Record<PublishingScheduleReminderState, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  unscheduled: 3,
};

/** Sorts queue packages by reminder urgency, then newest update. */
export function sortPublishingPackagesBySchedule(
  packages: PublishingPackage[],
  now: Date = new Date(),
): PublishingPackage[] {
  return [...packages].sort((left, right) => {
    const leftState = getPublishingScheduleState(left, now).state;
    const rightState = getPublishingScheduleState(right, now).state;
    const stateDelta = REMINDER_STATE_SORT_ORDER[leftState] - REMINDER_STATE_SORT_ORDER[rightState];

    if (stateDelta !== 0) {
      return stateDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function scheduleStateChipClass(state: PublishingScheduleReminderState): string {
  switch (state) {
    case "overdue":
      return "bg-amber-500/10 text-amber-300/90 ring-amber-500/20";
    case "due_today":
      return "bg-emerald-500/10 text-emerald-300/90 ring-emerald-500/20";
    case "upcoming":
      return "bg-sky-500/10 text-sky-300/90 ring-sky-500/20";
    default:
      return "";
  }
}

export function localInputFromSchedule(schedule: PublishingSchedule | undefined): LocalScheduleInput {
  const normalized = normalizePublishingSchedule(schedule);
  if (!normalized) {
    return {
      date: "",
      time: "",
      timezone: DEFAULT_PUBLISHING_TIMEZONE,
      recurrence: "none",
    };
  }

  const parts = getZonedDateTimeParts(new Date(normalized.scheduledForIso), normalized.timezone);
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    timezone: normalized.timezone,
    recurrence: normalizeRecurrence(normalized.recurrence),
  };
}
