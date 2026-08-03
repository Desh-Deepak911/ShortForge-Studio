/**
 * Node verify prelude for Next.js Link passive effects.
 * Must be imported before any next/link or DraftsDashboard import.
 */

Object.defineProperty(globalThis, "self", {
  value: globalThis,
  configurable: true,
  writable: true,
});

const scope = globalThis as typeof globalThis & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

if (typeof scope.requestIdleCallback !== "function") {
  scope.requestIdleCallback = (cb) => Number(setTimeout(cb, 0));
}

if (typeof scope.cancelIdleCallback !== "function") {
  scope.cancelIdleCallback = (id) => {
    clearTimeout(id);
  };
}
