export const OCTO_AVAILABLE_SYSTEM_PROMPT = `
The app's database is the owner's Octo Postgres workspace. Use the \`execute_sql\` tool to run SQL against it and \`get_database_table_schema\` to inspect its schema. There is no separate database to add: the tools are already live. Do not suggest Supabase or Neon, and do not call \`add_integration\`, \`get_supabase_project_info\` or \`get_neon_project_info\` — those providers are not in play and those calls return refusals.

## Schema ownership

The workspace is **shared with other generated apps**, so your tables must not land in \`public\`, where they would collide with another app's. Before any other database work:

1. **Pick the schema name from the app name** — lowercase, letters/digits/underscores only (app "Paceboard" -> schema \`paceboard\`). Derive it the same way every time: this name is what keeps the app's data alive across a regeneration, so do not invent a new one.
2. **Create it once:** \`CREATE SCHEMA IF NOT EXISTS paceboard\` (substitute your name).
3. **Qualify every table with it, everywhere** — in DDL and in every query the app runs: \`CREATE TABLE paceboard.tasks (...)\`, \`SELECT ... FROM paceboard.tasks\`. There is **no session state between calls**, so \`search_path\` cannot be relied on; an unqualified \`tasks\` is created in \`public\` and is a bug.

Send **one SQL command per \`execute_sql\` call** — a call carrying \`params\` is a single statement; a batch belongs in one param-less call only when it is a migration of pure DDL. \`get_database_table_schema\` lists every schema in the workspace with tables shown as \`schema.table\`, so you can see your own tables and other apps' alongside them.

## How the app's server code reaches Octo

\`OCTO_API_KEY\`, \`OCTO_WORKSPACE_ID\` and \`OCTO_BASE_URL\` are **server-only**.

- Never reference them from anything under \`src/\`. Everything under \`src/\` ships to the browser, so a reference there publishes the key to every visitor.
- The browser reaches the database only through an \`/api/*\` route under \`server/routes/api/\`, which reads the key server-side and returns data.
- Call \`enable_nitro\` before writing the first file under \`server/\`.

Octo is **not** Supabase and **not** PostgREST: there is no \`/rest/v1/...\` REST surface (a request there returns the app's own \`index.html\` with HTTP 200, so a client written against PostgREST silently receives a web page instead of data), no \`apikey\` header, and no \`select=\` / \`eq.\` query syntax. There is also **no connection string** — never add \`pg\`, \`postgres\` or \`@neon/serverless\` packages, and never expect \`DATABASE_URL\`. The only data endpoint is Octo's SQL surface:

\`\`\`
POST \${OCTO_BASE_URL}/api/workspaces/\${OCTO_WORKSPACE_ID}/query
Authorization: Bearer \${OCTO_API_KEY}
Content-Type: application/json

{ "sql": "SELECT * FROM paceboard.tasks ORDER BY created_at" }
\`\`\`

The response is \`{ columns: [...], rows: [...], rowCount, truncated }\` — read \`rows\`. **Each entry in \`rows\` is an object already keyed by column name** (\`rows[0].title\`, not \`rows[0][0]\`); never index a row positionally against \`columns\`.

Worked example — \`server/routes/api/tasks.get.ts\` (note the schema-qualified table, as the rule above requires):

\`\`\`ts
import { defineHandler } from "nitro";

export default defineHandler(async () => {
  const base = process.env.OCTO_BASE_URL!.replace(/\\/\$/, "");
  const res = await fetch(
    \`\${base}/api/workspaces/\${process.env.OCTO_WORKSPACE_ID}/query\`,
    {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${process.env.OCTO_API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: "SELECT id, title, priority, done FROM paceboard.tasks ORDER BY created_at",
      }),
    },
  );
  if (!res.ok) throw new Error(\`Octo \${res.status}\`);
  return (await res.json()).rows;
});
\`\`\`

Nitro auto-imports are **not** enabled in this app: import every helper explicitly. Use \`defineHandler\` from \`"nitro"\` (not the older \`defineEventHandler\`, which is only a deprecated alias) and request helpers from \`"nitro/h3"\`.
`;
