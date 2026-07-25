/**
 * CLI bootstrap for provider-free page diagnostic (outside production worker).
 */

import { runPageDiagnostic } from "./page-diagnostic-runner";

void runPageDiagnostic()
  .then((result) => {
    process.exitCode = result.exitCode;
    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
  })
  .catch(() => {
    process.exitCode = 1;
    process.exit(1);
  });
