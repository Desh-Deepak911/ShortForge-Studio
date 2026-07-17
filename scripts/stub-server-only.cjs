/**
 * Preload stub so Node verification can import server-only modules.
 * Used by Retention production integration (and similar) QA scripts.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad.apply(this, arguments);
};
