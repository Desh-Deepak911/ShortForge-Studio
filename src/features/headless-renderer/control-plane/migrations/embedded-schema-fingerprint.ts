/**
 * Production-safe embedded schema fingerprint for deployable hosted workers.
 *
 * Build-time authority regenerates/verifies these checksums against the
 * repository migration SQL files. Runtime schema preflight must use this
 * module — never readdir/readFile against the migrations directory.
 *
 * Do not hand-edit checksums; `npm run build:headless-worker` fails on drift.
 */

export type HeadlessEmbeddedMigrationFingerprintEntry = {
  readonly migrationId: string;
  readonly checksumSha256: string;
};

export type HeadlessEmbeddedSchemaFingerprint = {
  readonly version: 1;
  readonly migrations: readonly HeadlessEmbeddedMigrationFingerprintEntry[];
};

/**
 * Exact executable migration set for hosted schema readiness.
 * Companion docs (e.g. 003_*.md) are intentionally absent.
 * Phase 2E.2D.8C.2 adds 007 (slot_key VARCHAR(1024) alignment).
 */
export const HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT: HeadlessEmbeddedSchemaFingerprint =
  Object.freeze({
    version: 1 as const,
    migrations: Object.freeze([
      Object.freeze({
        migrationId: "000_headless_schema_migrations",
        checksumSha256:
          "df24832672ff801f63490556936cd04253fe3873f1081a5e1f97e501acb0ca1d",
      }),
      Object.freeze({
        migrationId: "001_headless_project_ownership",
        checksumSha256:
          "ab0cfc7de2c0df9d238418a4f432f532a02531bfa1a1d9ee9d7db41b2f4965ca",
      }),
      Object.freeze({
        migrationId: "002_headless_jobs",
        checksumSha256:
          "7043f11813ffd63b3034bd4b5f8728001f7a48da16c1010ded5bdd935b04a381",
      }),
      Object.freeze({
        migrationId: "004_headless_owned_objects",
        checksumSha256:
          "a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3",
      }),
      Object.freeze({
        migrationId: "005_headless_cleanup_intents",
        checksumSha256:
          "59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d",
      }),
      Object.freeze({
        migrationId: "006_headless_render_dispatch_outbox",
        checksumSha256:
          "960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1",
      }),
      Object.freeze({
        migrationId: "007_headless_owned_object_slot_key_capacity",
        checksumSha256:
          "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244",
      }),
      Object.freeze({
        migrationId: "008_headless_export_maintenance_lease",
        checksumSha256:
          "931519d8a9d600e8f46dc82c55d08ed6a980e8daa850f5e740ff0b8af0102bf9",
      }),
    ]),
  });

export function embeddedSchemaFingerprintMigrationIds(): readonly string[] {
  return HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.map(
    (m) => m.migrationId,
  );
}

export function embeddedSchemaFingerprintChecksums(): readonly string[] {
  return HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.map(
    (m) => m.checksumSha256,
  );
}

/**
 * Minimal sources for schema preflight — IDs + checksums only.
 * Never includes filesystem paths or SQL text.
 */
export function embeddedSchemaFingerprintAsPreflightSources(): readonly {
  readonly migrationId: string;
  readonly checksumSha256: string;
}[] {
  return HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.map((m) =>
    Object.freeze({
      migrationId: m.migrationId,
      checksumSha256: m.checksumSha256,
    }),
  );
}
