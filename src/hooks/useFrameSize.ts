"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface FrameSize {
  width: number;
  height: number;
}

function readElementSize(element: HTMLElement): FrameSize {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/** Tracks an element's content box size for frame-relative layout math. */
export function useFrameSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<FrameSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      setSize(readElementSize(element));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
