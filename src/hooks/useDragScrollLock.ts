"use client";

import { useEffect } from "react";

/** Prevents page scrolling while dragging on touch devices. */
export function useDragScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousRootOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.overscrollBehavior = "none";

    const preventTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventTouchScroll, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventTouchScroll);
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overscrollBehavior = previousRootOverscroll;
    };
  }, [active]);
}
