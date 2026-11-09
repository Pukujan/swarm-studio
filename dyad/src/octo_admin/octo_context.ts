// Octo as dyad's data layer (owner directive 2026-10-13, delta 7).
//
// Octo runs the SQL for us: the caller posts `{sql}` (or `{sql, params}`) to
// `POST /api/workspaces/<id>/query` and Octo connects as the workspace's own
// role. No connection string, host or port is held here — the API key is the
// whole credential, so it stays server-side and never reaches a client bundle.
//
// This mirrors `supabase_admin/`: a small context module the agent tools call.
// It is the native provider path; Supabase and Neon stay in the tree but never
// resolve once OCTO_API_KEY + OCTO_WORKSPACE_ID are set (see
// `src/shared/database_provider.ts`).
//
// Three behaviours on Octo's side shape this module, ported from the proven
// client in `server/src/octo.mjs`:
//   - read scope opens a read-only transaction, so a read cannot mutate;
//   - a write carrying no params runs the simple protocol, so a multi-statement
//     migration is a single call;
//   - the service cold-starts, so the first request after idle may answer 502
//     before the real status. That one is retried, not surfaced.
import { abaOctoConfig, type AbaOctoConfig } from "@/lib/aba_model_config";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { IS_TEST_BUILD } from "@/ipc/utils/test_utils";

const COLD_START_RETRIES = 2;

interface OctoAnswer {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  raw: string;
}

/**
 * POST one statement (or one param-less batch) to Octo's SQL surface.
 *
 * Resolves with Octo's own envelope for every answer the server actually gave,
 * including a rejected statement, because the caller wants the Postgres error
 * verbatim. Throws only when no answer arrived (unreachable, timed out) or when
 * the config is missing.
 */
async function octoQuery(
  cfg: AbaOctoConfig,
  { sql, params }: { sql: string; params?: unknown[] },
): Promise<OctoAnswer> {
  if (!cfg.configured) {
    throw new DyadError(
      "Octo is not configured: set OCTO_API_KEY and OCTO_WORKSPACE_ID.",
      DyadErrorKind.Precondition,
    );
  }
  const url = `${cfg.baseUrl}/api/workspaces/${cfg.workspaceId}/query`;
  // Params force the extended protocol, which is single-statement only; the
  // param-less shape is what lets a migration batch through.
  const payload = params && params.length ? { sql, params } : { sql };

  let lastError: unknown;
  for (let attempt = 0; attempt <= COLD_START_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      lastError = err;
      continue;
    }
    // A cold start is not an answer about the SQL; try again.
    if (res.status === 502 || res.status === 503) {
      lastError = new Error(`Octo answered ${res.status} (cold start)`);
      continue;
    }
    const raw = await res.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // A non-JSON body is still the server's answer; keep `raw` for the caller.
    }
    return { ok: res.ok, status: res.status, body, raw };
  }
  throw new DyadError(
    `Octo request failed after ${COLD_START_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    DyadErrorKind.External,
  );
}

const cell = (v: unknown): string =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

/**
 * Render Octo's answer as the text a model reads back. A rejected statement
 * keeps Postgres's own message and SQLSTATE, because that is what the model
 * needs to correct itself — a paraphrase would cost it the fix.
 */
export function formatQueryResult({ ok, status, body, raw }: OctoAnswer): string {
  if (ok && body && Array.isArray(body.rows)) {
    const cols = (body.columns as string[] | undefined) ?? [];
    const rows = body.rows as Record<string, unknown>[];
    if (!cols.length)
      return `OK (${(body.statementCount as number | undefined) ?? 1} statement(s), no result set)`;
    const lines = rows.map((r) => cols.map((c) => cell(r[c])).join(" | "));
    const suffix = body.truncated ? " (truncated)" : "";
    return [`OK — ${rows.length} row(s)${suffix}`, cols.join(" | "), ...lines].join(
      "\n",
    );
  }
  const message =
    (body?.message as string | undefined) ??
    (body?.error as string | undefined) ??
    raw ??
    `HTTP ${status}`;
  const code = body?.code ? ` [${body.code as string}]` : "";
  return `SQL error${code}: ${message}`;
}

/** Execute SQL against the Octo workspace and return model-readable text. */
export async function executeOctoSql({ query }: { query: string }): Promise<string> {
  if (IS_TEST_BUILD) {
    return `[[TEST_OCTO_SQL_RESULT: ${query.slice(0, 50)}]]`;
  }
  const cfg = abaOctoConfig();
  const answer = await octoQuery(cfg, { sql: query });
  return formatQueryResult(answer);
}

// Octo exposes no schema-introspection endpoint, so the schema is read from
// `information_schema` through the same SQL surface. This lists every user
// schema, not just `current_schema()`: the workspace is shared, each generated
// app owns a schema of its own, and `current_schema()` is always `public` here,
// so a single-schema filter would hide the app's own tables from the model.
const SCHEMA_SQL = `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_schema NOT LIKE 'pg_%'`;

function schemaSql(tableName?: string): { sql: string; params?: string[] } {
  return tableName
    ? {
        sql: `${SCHEMA_SQL} AND table_name = $1 ORDER BY table_schema, table_name, ordinal_position`,
        params: [tableName],
      }
    : { sql: `${SCHEMA_SQL} ORDER BY table_schema, table_name, ordinal_position` };
}

/** Group `information_schema.columns` rows into a readable per-table listing. */
export function formatSchema(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "No tables found in this workspace.";
  const byTable = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = r.table_schema
      ? `${r.table_schema as string}.${r.table_name as string}`
      : (r.table_name as string);
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key)!.push(r);
  }
  const out: string[] = [];
  for (const [table, cols] of byTable) {
    out.push(`${table} (`);
    for (const c of cols) {
      const notNull = c.is_nullable === "NO" ? " NOT NULL" : "";
      const def = c.column_default ? ` DEFAULT ${c.column_default as string}` : "";
      out.push(`  ${c.column_name as string} ${c.data_type as string}${notNull}${def}`);
    }
    out.push(")");
  }
  return out.join("\n");
}

/** Read the workspace schema (all tables, or one) as model-readable text. */
export async function getOctoTableSchema({
  tableName,
}: {
  tableName?: string;
}): Promise<string> {
  if (IS_TEST_BUILD) {
    return `[[TEST_OCTO_SCHEMA: ${tableName ?? "all"}]]`;
  }
  const cfg = abaOctoConfig();
  const answer = await octoQuery(cfg, schemaSql(tableName));
  if (!answer.ok || !answer.body || !Array.isArray(answer.body.rows)) {
    return formatQueryResult(answer);
  }
  return formatSchema(answer.body.rows as Record<string, unknown>[]);
}
