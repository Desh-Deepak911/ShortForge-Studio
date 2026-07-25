/**
 * Relation-bound schema-readiness preflight for gated Neon live QA.
 * Never auto-runs migrations. Fail closed on missing/drifted/misbound schema.
 */

import { embeddedSchemaFingerprintAsPreflightSources } from "../migrations/embedded-schema-fingerprint";
import {
  discoverHeadlessMigrationSources,
  type HeadlessMigrationSource,
} from "../migrations/migration-catalog";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "../../domain/headless-source-slot-key";
import type { HeadlessSqlClient, HeadlessSqlExecutor } from "./sql-client";

export type HeadlessSchemaPreflightResult =
  | {
      readonly ok: true;
      readonly fingerprint: {
        readonly migrationIds: readonly string[];
        readonly checksums: readonly string[];
      };
    }
  | {
      readonly ok: false;
      readonly code:
        | "SCHEMA_MISSING"
        | "SCHEMA_DRIFT"
        | "DATABASE_UNAVAILABLE"
        | "SCHEMA_INCOHERENT";
      readonly message: string;
    };

export type HeadlessSchemaPreflightSource = {
  readonly migrationId: string;
  readonly checksumSha256: string;
};

export type HeadlessSchemaPreflightOptions = {
  readonly sql: HeadlessSqlExecutor;
  /**
   * Test/dev override: discover executable migrations from a directory.
   * Production hosted workers must omit this and use the embedded fingerprint.
   */
  readonly migrationsDirectory?: string;
  readonly expectedSources?: readonly HeadlessSchemaPreflightSource[];
};

function resolveExpectedSources(
  options: HeadlessSchemaPreflightOptions,
): readonly HeadlessSchemaPreflightSource[] {
  if (options.expectedSources != null) {
    return options.expectedSources;
  }
  if (options.migrationsDirectory != null) {
    return discoverHeadlessMigrationSources(options.migrationsDirectory).map(
      (s: HeadlessMigrationSource) => ({
        migrationId: s.migrationId,
        checksumSha256: s.checksumSha256,
      }),
    );
  }
  // Deployable default: embedded fingerprint — never readdir the migrations dir.
  return embeddedSchemaFingerprintAsPreflightSources();
}

type RequiredConstraint = {
  readonly name: string;
  readonly table: string;
  readonly contype: "u" | "c" | "f";
  readonly validated: boolean;
  readonly fkRefTable?: string;
  readonly fkColumns?: readonly string[];
  readonly fkRefColumns?: readonly string[];
};

type RequiredIndex = {
  readonly name: string;
  readonly table: string;
  readonly unique: boolean;
  readonly columns: readonly string[];
  readonly predicateIncludes?: readonly string[];
};

const REQUIRED_TABLES = [
  "headless_schema_migrations",
  "headless_project_ownership",
  "headless_jobs",
  "headless_owned_objects",
  "headless_cleanup_intents",
  "headless_render_dispatch_outbox",
] as const;

const REQUIRED_CONSTRAINTS: readonly RequiredConstraint[] = [
  {
    name: "headless_project_ownership_project_owner_unique",
    table: "headless_project_ownership",
    contype: "u",
    validated: true,
  },
  {
    name: "headless_project_ownership_project_id_uuid_v4",
    table: "headless_project_ownership",
    contype: "c",
    validated: true,
  },
  {
    name: "headless_jobs_fk_project_owner",
    table: "headless_jobs",
    contype: "f",
    validated: true,
    fkRefTable: "headless_project_ownership",
    fkColumns: ["project_id", "owner_id"],
    fkRefColumns: ["project_id", "owner_id"],
  },
  {
    name: "headless_jobs_stage_valid",
    table: "headless_jobs",
    contype: "c",
    validated: true,
  },
  {
    name: "headless_jobs_canonical_state_matches_json",
    table: "headless_jobs",
    contype: "c",
    validated: true,
  },
  {
    name: "headless_owned_objects_fk_project_owner",
    table: "headless_owned_objects",
    contype: "f",
    validated: true,
    fkRefTable: "headless_project_ownership",
    fkColumns: ["project_id", "owner_id"],
    fkRefColumns: ["project_id", "owner_id"],
  },
  {
    name: "headless_owned_objects_unique_object_identity",
    table: "headless_owned_objects",
    contype: "u",
    validated: true,
  },
  {
    name: "headless_owned_objects_stage_valid",
    table: "headless_owned_objects",
    contype: "c",
    validated: true,
  },
  {
    name: "headless_cleanup_intents_fk_project_owner",
    table: "headless_cleanup_intents",
    contype: "f",
    validated: true,
    fkRefTable: "headless_project_ownership",
    fkColumns: ["project_id", "owner_id"],
    fkRefColumns: ["project_id", "owner_id"],
  },
  {
    name: "headless_cleanup_intents_idempotency_unique",
    table: "headless_cleanup_intents",
    contype: "u",
    validated: true,
  },
  {
    name: "headless_cleanup_intents_state_valid",
    table: "headless_cleanup_intents",
    contype: "c",
    validated: true,
  },
  {
    name: "headless_render_dispatch_outbox_fk_project_owner",
    table: "headless_render_dispatch_outbox",
    contype: "f",
    validated: true,
    fkRefTable: "headless_project_ownership",
    fkColumns: ["project_id", "owner_id"],
    fkRefColumns: ["project_id", "owner_id"],
  },
  {
    name: "headless_render_dispatch_outbox_job_attempt_unique",
    table: "headless_render_dispatch_outbox",
    contype: "u",
    validated: true,
  },
  {
    name: "headless_render_dispatch_outbox_delivery_id_unique",
    table: "headless_render_dispatch_outbox",
    contype: "u",
    validated: true,
  },
  {
    name: "headless_render_dispatch_outbox_state_valid",
    table: "headless_render_dispatch_outbox",
    contype: "c",
    validated: true,
  },
];

const REQUIRED_INDEXES: readonly RequiredIndex[] = [
  {
    name: "uidx_headless_jobs_idempotency_authority",
    table: "headless_jobs",
    unique: true,
    columns: ["owner_id", "project_id", "idempotency_authority_key"],
  },
  {
    name: "idx_headless_jobs_canonical_queued_unclaimed",
    table: "headless_jobs",
    unique: false,
    columns: ["created_at_ms", "job_id"],
    predicateIncludes: [
      "stage",
      "canonical",
      "queued",
      "claim_token",
    ],
  },
  {
    name: "idx_headless_jobs_render_claim_recovery",
    table: "headless_jobs",
    unique: false,
    columns: ["claimed_at_ms", "job_id"],
    predicateIncludes: ["claim_token", "canonical"],
  },
  {
    name: "idx_headless_owned_objects_owner_job",
    table: "headless_owned_objects",
    unique: false,
    columns: ["owner_id", "job_id"],
  },
  {
    name: "idx_headless_owned_objects_verification_claims",
    table: "headless_owned_objects",
    unique: false,
    columns: ["verification_claimed_at_ms", "object_id"],
    predicateIncludes: ["verification_claim_token", "staging"],
  },
  {
    name: "idx_headless_cleanup_intents_owner_retryable",
    table: "headless_cleanup_intents",
    unique: false,
    columns: ["owner_id", "created_at_ms", "cleanup_id"],
    predicateIncludes: ["pending", "claimed"],
  },
  {
    name: "idx_headless_cleanup_intents_claim_recovery",
    table: "headless_cleanup_intents",
    unique: false,
    columns: ["claimed_at_ms", "cleanup_id"],
    predicateIncludes: ["claimed", "claim_token"],
  },
  {
    name: "idx_headless_render_dispatch_outbox_due",
    table: "headless_render_dispatch_outbox",
    unique: false,
    columns: ["next_attempt_at_ms", "dispatch_id"],
    predicateIncludes: ["pending"],
  },
  {
    name: "idx_headless_render_dispatch_outbox_claim_recovery",
    table: "headless_render_dispatch_outbox",
    unique: false,
    columns: ["claimed_at_ms", "dispatch_id"],
    predicateIncludes: ["claimed", "claim_token"],
  },
];

function fail(
  code: Extract<HeadlessSchemaPreflightResult, { ok: false }>["code"],
  message: string,
): HeadlessSchemaPreflightResult {
  return { ok: false, code, message };
}

async function assertOrdinaryPublicTable(
  client: HeadlessSqlClient,
  table: string,
): Promise<HeadlessSchemaPreflightResult | null> {
  const found = await client.query<{
    relkind: string;
    relpersistence: string;
  }>(
    `
SELECT c.relkind::text AS relkind, c.relpersistence::text AS relpersistence
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = $1
`,
    [table],
  );
  if (found.rows.length !== 1) {
    return fail(
      "SCHEMA_MISSING",
      "Schema readiness failed: required Headless table is missing.",
    );
  }
  const row = found.rows[0]!;
  if (row.relkind !== "r" || row.relpersistence !== "p") {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: required table is not an ordinary persistent table.",
    );
  }
  return null;
}

async function assertConstraint(
  client: HeadlessSqlClient,
  spec: RequiredConstraint,
): Promise<HeadlessSchemaPreflightResult | null> {
  const found = await client.query<{
    contype: string;
    convalidated: boolean;
    table_name: string;
    nspname: string;
    confrelid: string | null;
    conkey: number[] | null;
    confkey: number[] | null;
  }>(
    `
SELECT
  c.contype::text AS contype,
  c.convalidated AS convalidated,
  rel.relname::text AS table_name,
  n.nspname::text AS nspname,
  c.confrelid::text AS confrelid,
  c.conkey AS conkey,
  c.confkey AS confkey
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE c.conname = $1
  AND n.nspname = 'public'
  AND rel.relname = $2
`,
    [spec.name, spec.table],
  );
  if (found.rows.length !== 1) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: required constraint is missing or misbound.",
    );
  }
  const row = found.rows[0]!;
  if (row.contype !== spec.contype) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: constraint type mismatch.",
    );
  }
  if (spec.validated && row.convalidated !== true) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: constraint is not validated.",
    );
  }
  if (spec.contype === "f") {
    const ref = await client.query<{
      ref_table: string;
      ref_nsp: string;
      cols: string[];
      ref_cols: string[];
    }>(
      `
SELECT
  ref.relname::text AS ref_table,
  rn.nspname::text AS ref_nsp,
  ARRAY(
    SELECT a.attname::text
    FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  ) AS cols,
  ARRAY(
    SELECT a.attname::text
    FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  ) AS ref_cols
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
JOIN pg_class ref ON ref.oid = c.confrelid
JOIN pg_namespace rn ON rn.oid = ref.relnamespace
WHERE c.conname = $1
  AND n.nspname = 'public'
  AND rel.relname = $2
`,
      [spec.name, spec.table],
    );
    if (ref.rows.length !== 1) {
      return fail(
        "SCHEMA_INCOHERENT",
        "Schema readiness failed: foreign key binding is missing.",
      );
    }
    const fk = ref.rows[0]!;
    if (fk.ref_nsp !== "public" || fk.ref_table !== spec.fkRefTable) {
      return fail(
        "SCHEMA_INCOHERENT",
        "Schema readiness failed: foreign key references wrong relation.",
      );
    }
    if (
      JSON.stringify(fk.cols) !== JSON.stringify(spec.fkColumns) ||
      JSON.stringify(fk.ref_cols) !== JSON.stringify(spec.fkRefColumns)
    ) {
      return fail(
        "SCHEMA_INCOHERENT",
        "Schema readiness failed: foreign key columns mismatch.",
      );
    }
  }
  return null;
}

async function assertIndex(
  client: HeadlessSqlClient,
  spec: RequiredIndex,
): Promise<HeadlessSchemaPreflightResult | null> {
  const found = await client.query<{
    indisunique: boolean;
    indisvalid: boolean;
    indisready: boolean;
    table_name: string;
    nspname: string;
    columns: string[];
    pred: string | null;
  }>(
    `
SELECT
  i.indisunique AS indisunique,
  i.indisvalid AS indisvalid,
  i.indisready AS indisready,
  rel.relname::text AS table_name,
  n.nspname::text AS nspname,
  ARRAY(
    SELECT a.attname::text
    FROM unnest(i.indkey::int[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  ) AS columns,
  pg_get_expr(i.indpred, i.indrelid) AS pred
FROM pg_index i
JOIN pg_class idx ON idx.oid = i.indexrelid
JOIN pg_class rel ON rel.oid = i.indrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
JOIN pg_namespace ni ON ni.oid = idx.relnamespace
WHERE idx.relname = $1
  AND n.nspname = 'public'
  AND ni.nspname = 'public'
  AND rel.relname = $2
`,
    [spec.name, spec.table],
  );
  if (found.rows.length !== 1) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: required index is missing or misbound.",
    );
  }
  const row = found.rows[0]!;
  if (row.indisvalid !== true || row.indisready !== true) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: index is not valid/ready.",
    );
  }
  if (row.indisunique !== spec.unique) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: index uniqueness mismatch.",
    );
  }
  if (JSON.stringify(row.columns) !== JSON.stringify(spec.columns)) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: index columns mismatch.",
    );
  }
  if (spec.predicateIncludes) {
    const pred = (row.pred ?? "").toLowerCase();
    for (const token of spec.predicateIncludes) {
      if (!pred.includes(token.toLowerCase())) {
        return fail(
          "SCHEMA_INCOHERENT",
          "Schema readiness failed: index predicate mismatch.",
        );
      }
    }
  }
  return null;
}

async function assertOwnershipTrigger(
  client: HeadlessSqlClient,
): Promise<HeadlessSchemaPreflightResult | null> {
  const found = await client.query<{
    tgenabled: string;
    fn_name: string;
    fn_nsp: string;
  }>(
    `
SELECT
  t.tgenabled::text AS tgenabled,
  p.proname::text AS fn_name,
  n.nspname::text AS fn_nsp
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace rn ON rn.oid = rel.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE t.tgname = 'trg_headless_project_ownership_immutable'
  AND rn.nspname = 'public'
  AND rel.relname = 'headless_project_ownership'
  AND NOT t.tgisinternal
`,
  );
  if (found.rows.length !== 1) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: ownership immutability trigger is missing.",
    );
  }
  const row = found.rows[0]!;
  // O = origin enabled, A = always; D = disabled
  if (row.tgenabled === "D") {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: ownership trigger is disabled.",
    );
  }
  if (
    row.fn_nsp !== "public" ||
    row.fn_name !== "headless_project_ownership_reject_owner_change"
  ) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: ownership trigger function mismatch.",
    );
  }
  return null;
}

/** Post-007 effective SQL capacity for public.headless_owned_objects.slot_key. */
const OWNED_OBJECT_SLOT_KEY_SQL_CAPACITY =
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH;

async function assertOwnedObjectSlotKeyColumnCapacity(
  client: HeadlessSqlClient,
): Promise<HeadlessSchemaPreflightResult | null> {
  const bound = await client.query<{
    character_maximum_length: number | null;
    is_nullable: string;
    table_schema: string;
    table_name: string;
  }>(
    `
SELECT
  c.character_maximum_length,
  c.is_nullable,
  c.table_schema,
  c.table_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'headless_owned_objects'
  AND c.column_name = 'slot_key'
`,
  );
  if (bound.rows.length !== 1) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: owned-object slot_key column is missing or misbound.",
    );
  }
  const row = bound.rows[0]!;
  if (
    row.table_schema !== "public" ||
    row.table_name !== "headless_owned_objects"
  ) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: slot_key is not bound to public.headless_owned_objects.",
    );
  }
  if (row.is_nullable !== "YES") {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: slot_key must remain nullable.",
    );
  }
  if (row.character_maximum_length !== OWNED_OBJECT_SLOT_KEY_SQL_CAPACITY) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: slot_key effective capacity is not canonical.",
    );
  }

  const foreignColumn = await client.query<{ n: string }>(
    `
SELECT COUNT(*)::text AS n
FROM information_schema.columns c
WHERE c.column_name = 'slot_key'
  AND c.character_maximum_length = $1
  AND NOT (c.table_schema = 'public' AND c.table_name = 'headless_owned_objects')
`,
    [OWNED_OBJECT_SLOT_KEY_SQL_CAPACITY],
  );
  const foreignCount = Number(foreignColumn.rows[0]?.n ?? "0");
  if (!Number.isFinite(foreignCount) || foreignCount > 0) {
    return fail(
      "SCHEMA_INCOHERENT",
      "Schema readiness failed: slot_key capacity satisfied by wrong relation.",
    );
  }

  return null;
}

/**
 * Verify expected Headless schema is present, public-bound, and coherent.
 */
export async function runHeadlessSchemaPreflight(
  options: HeadlessSchemaPreflightOptions,
): Promise<HeadlessSchemaPreflightResult> {
  const sources = resolveExpectedSources(options);

  try {
    return await options.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );

      for (const table of REQUIRED_TABLES) {
        const tableFail = await assertOrdinaryPublicTable(client, table);
        if (tableFail) return tableFail;
      }

      const ledger = await client.query<{
        migration_id: string;
        checksum_sha256: string;
      }>(
        `
SELECT migration_id, checksum_sha256
FROM public.headless_schema_migrations
ORDER BY migration_id ASC
`,
      );

      const byId = new Map<string, string>();
      for (const row of ledger.rows) {
        if (
          typeof row.migration_id !== "string" ||
          typeof row.checksum_sha256 !== "string"
        ) {
          return fail(
            "SCHEMA_INCOHERENT",
            "Schema readiness failed: migration ledger row is malformed.",
          );
        }
        if (byId.has(row.migration_id)) {
          return fail(
            "SCHEMA_INCOHERENT",
            "Schema readiness failed: duplicate migration ledger ID.",
          );
        }
        byId.set(row.migration_id, row.checksum_sha256);
      }

      if (byId.size !== sources.length) {
        // Unexpected newer/extra IDs or missing IDs.
        for (const id of byId.keys()) {
          if (!sources.some((s) => s.migrationId === id)) {
            return fail(
              "SCHEMA_DRIFT",
              "Schema readiness failed: unexpected migration ID in ledger.",
            );
          }
        }
      }

      for (const source of sources) {
        const applied = byId.get(source.migrationId);
        if (applied == null) {
          return fail(
            "SCHEMA_MISSING",
            "Schema readiness failed: required migration has not been applied.",
          );
        }
        if (applied !== source.checksumSha256) {
          return fail(
            "SCHEMA_DRIFT",
            "Schema readiness failed: migration checksum drift detected.",
          );
        }
      }

      for (const constraint of REQUIRED_CONSTRAINTS) {
        const constraintFail = await assertConstraint(client, constraint);
        if (constraintFail) return constraintFail;
      }

      for (const index of REQUIRED_INDEXES) {
        const indexFail = await assertIndex(client, index);
        if (indexFail) return indexFail;
      }

      const triggerFail = await assertOwnershipTrigger(client);
      if (triggerFail) return triggerFail;

      const slotKeyFail = await assertOwnedObjectSlotKeyColumnCapacity(client);
      if (slotKeyFail) return slotKeyFail;

      return {
        ok: true,
        fingerprint: {
          migrationIds: sources.map((s) => s.migrationId),
          checksums: sources.map((s) => s.checksumSha256),
        },
      };
    });
  } catch {
    return fail(
      "DATABASE_UNAVAILABLE",
      "Schema readiness failed: durable database is temporarily unavailable.",
    );
  }
}
