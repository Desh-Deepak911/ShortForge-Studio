/**
 * Deterministic Headless SQL migration discovery + checksum authority.
 * Applied migration files are immutable; content changes require a new ID.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type HeadlessMigrationSource = {
  readonly migrationId: string;
  readonly fileName: string;
  readonly absolutePath: string;
  readonly sqlText: string;
  readonly checksumSha256: string;
};

/**
 * Executable migration filename pattern — `.sql` only.
 * Non-executable companion docs (e.g. `003_*.md` CAS spec) are intentionally
 * excluded from discovery; executable IDs may be non-contiguous (000,001,002,004).
 */
export const EXECUTABLE_HEADLESS_MIGRATION_ID_PATTERN =
  /^(\d{3}_[a-z0-9_]+)\.sql$/;

/** Stable advisory-lock key for concurrent migration serialization. */
export const HEADLESS_MIGRATION_ADVISORY_LOCK_KEY = 0x4844_4d_47; // "HDMG"

export function defaultHeadlessMigrationsDirectory(): string {
  return path.join(__dirname);
}

/** True only for catalog-discovered executable `NNN_*.sql` filenames. */
export function isExecutableHeadlessMigrationFile(fileName: string): boolean {
  return EXECUTABLE_HEADLESS_MIGRATION_ID_PATTERN.test(fileName);
}

/**
 * Discover ordered `NNN_*.sql` migrations.
 * Markdown / non-`.sql` companions (including `003_headless_cas_transaction_spec.md`)
 * are excluded — the catalog never invents a phantom executable `003`.
 */
export function discoverHeadlessMigrationSources(
  migrationsDirectory: string = defaultHeadlessMigrationsDirectory(),
): readonly HeadlessMigrationSource[] {
  const names = readdirSync(migrationsDirectory)
    .filter((name) => isExecutableHeadlessMigrationFile(name))
    .sort((a, b) => a.localeCompare(b));

  const sources: HeadlessMigrationSource[] = [];
  for (const fileName of names) {
    const match = EXECUTABLE_HEADLESS_MIGRATION_ID_PATTERN.exec(fileName);
    if (!match) continue;
    const absolutePath = path.join(migrationsDirectory, fileName);
    const sqlText = readFileSync(absolutePath, "utf8");
    for (const line of sqlText.split("\n")) {
      if (/^\s*BEGIN\s*;\s*$/i.test(line) || /^\s*COMMIT\s*;\s*$/i.test(line)) {
        throw new Error(
          `Migration ${fileName} must not own BEGIN/COMMIT; runner owns transactions.`,
        );
      }
    }
    sources.push({
      migrationId: match[1]!,
      fileName,
      absolutePath,
      sqlText,
      checksumSha256: sha256Hex(sqlText),
    });
  }
  return sources;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Expected migration IDs for schema-readiness preflight. */
export function requiredHeadlessMigrationIds(
  migrationsDirectory: string = defaultHeadlessMigrationsDirectory(),
): readonly string[] {
  return discoverHeadlessMigrationSources(migrationsDirectory).map(
    (m) => m.migrationId,
  );
}
