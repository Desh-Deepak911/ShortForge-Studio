"use client";

import { useId, type KeyboardEvent } from "react";

import {
  SUBJECT_FOCUS_GRID_OPTIONS,
  type SubjectFocusGridId,
} from "../domain/subject-focus";

export interface SubjectFocusPickerProps {
  readonly value: SubjectFocusGridId | null;
  readonly onChange: (id: SubjectFocusGridId) => void;
  readonly disabled?: boolean;
  readonly labelledBy?: string;
}

function indexOfId(id: SubjectFocusGridId | null): number {
  if (!id) return -1;
  return SUBJECT_FOCUS_GRID_OPTIONS.findIndex((option) => option.id === id);
}

/**
 * Accessible 3×3 subject-focus radiogroup.
 * Does not create focus metadata on open — caller writes via commands.
 */
export default function SubjectFocusPicker({
  value,
  onChange,
  disabled = false,
  labelledBy,
}: SubjectFocusPickerProps) {
  const fallbackLabelId = useId();
  const groupLabelId = labelledBy ?? fallbackLabelId;
  const selectedIndex = indexOfId(value);
  const tabIndexFor = (index: number): number => {
    if (disabled) return -1;
    if (selectedIndex < 0) return index === 4 ? 0 : -1; // Center default tab stop
    return index === selectedIndex ? 0 : -1;
  };

  const moveSelection = (nextIndex: number) => {
    const clamped = Math.min(
      SUBJECT_FOCUS_GRID_OPTIONS.length - 1,
      Math.max(0, nextIndex),
    );
    const option = SUBJECT_FOCUS_GRID_OPTIONS[clamped];
    if (option) {
      onChange(option.id);
    }
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (disabled) return;
    const option = SUBJECT_FOCUS_GRID_OPTIONS[index];
    if (!option) return;
    const row = option.row;
    const col = option.col;

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        moveSelection(row * 3 + Math.min(2, col + 1));
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        moveSelection(row * 3 + Math.max(0, col - 1));
        break;
      }
      case "ArrowDown": {
        event.preventDefault();
        moveSelection(Math.min(2, row + 1) * 3 + col);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        moveSelection(Math.max(0, row - 1) * 3 + col);
        break;
      }
      case "Home": {
        event.preventDefault();
        moveSelection(0);
        break;
      }
      case "End": {
        event.preventDefault();
        moveSelection(SUBJECT_FOCUS_GRID_OPTIONS.length - 1);
        break;
      }
      case " ":
      case "Enter": {
        event.preventDefault();
        onChange(option.id);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={groupLabelId}
      data-subject-focus-picker=""
      className="min-w-0"
    >
      {!labelledBy ? (
        <p
          id={fallbackLabelId}
          className="mb-1.5 text-[11px] font-medium text-foreground/85"
        >
          Subject focus
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-1">
        {SUBJECT_FOCUS_GRID_OPTIONS.map((option, index) => {
          const checked = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={tabIndexFor(index)}
              disabled={disabled}
              data-subject-focus-cell={option.id}
              data-subject-focus-selected={checked ? "true" : "false"}
              className={[
                "min-w-0 rounded-md px-1 py-2 text-[10px] leading-tight transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                checked
                  ? "bg-accent/20 font-medium text-foreground ring-1 ring-accent/40"
                  : "bg-surface-elevated/40 text-foreground/80 ring-1 ring-border/30 hover:bg-surface-elevated/70",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
              onClick={() => {
                if (!disabled) onChange(option.id);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
