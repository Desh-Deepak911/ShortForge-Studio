/**
 * CLI bootstrap for the hosted worker process (outside Next.js).
 * Bundled by `npm run build:headless-worker`.
 */

import { main } from "./hosted-entrypoint";

void main();
