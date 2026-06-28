import type { KeyboardEvent } from "react";

interface RadiogroupOption<T extends string> {
  value: T;
}

/**
 * Arrow-key navigation for motion panel radiogroups — presentation only.
 */
export function handleMotionRadiogroupKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  options: readonly RadiogroupOption<T>[],
  currentValue: T,
  onChange: (value: T) => void,
): void {
  if (options.length === 0) {
    return;
  }

  const currentIndex = options.findIndex((option) => option.value === currentValue);
  if (currentIndex === -1) {
    return;
  }

  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % options.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + options.length) % options.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = options.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextValue = options[nextIndex]!.value;
  onChange(nextValue);

  const group = event.currentTarget;
  window.requestAnimationFrame(() => {
    const nextButton = group.querySelector<HTMLButtonElement>(
      `[data-motion-radiogroup-value="${nextValue}"]`,
    );
    nextButton?.focus();
  });
}
