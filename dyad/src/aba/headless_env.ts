/**
 * Env the headless bundle must set BEFORE dyad's module graph is imported.
 *
 * Imported first by `headless_cli.ts`, and re-applied by `applyHeadlessEnv` in
 * `@/aba/headless`. Both are needed because several dyad modules capture
 * `process.env` into a module-level const at import time — `socket_firewall.ts`
 * pins `DYAD_DEFAULT_APPROVE_BUILDS_URL` to its api.dyad.sh default that way
 * (line 68). Setting the var inside `bootDyadHeadless` is too late: ES imports
 * are hoisted above the module body, so dyad's graph is already evaluated. The
 * run would then carry the api.dyad.sh URL and the egress guard would refuse it
 * — a false violation in RUN_META, and a real request to dyad's servers under
 * `--no-egress-guard`.
 *
 * Each value below is a dyad.sh-shaped endpoint dyad falls back to on its own;
 * pointing them at a dead loopback port makes each fetch fail closed so dyad
 * uses its bundled defaults (the language-model catalog and the pnpm allow-build
 * list both ship in-tree).
 */
export const HEADLESS_DEAD_PORT = "http://127.0.0.1:9";

export const HEADLESS_STATIC_ENV = {
  DYAD_DEFAULT_APPROVE_BUILDS_URL: `${HEADLESS_DEAD_PORT}/default-approve-builds.txt`,
  DYAD_DESKTOP_CONFIG_URL: `${HEADLESS_DEAD_PORT}/desktop-config`,
  DYAD_LANGUAGE_MODEL_CATALOG_URL: `${HEADLESS_DEAD_PORT}/language-model-catalog`,
  DYAD_MCP_CATALOG_URL: `${HEADLESS_DEAD_PORT}/mcp-catalog`,
  DYAD_USER_INFO_URL: `${HEADLESS_DEAD_PORT}/user/info`,
  DYAD_SUBSCRIPTION_STATUS_URL: `${HEADLESS_DEAD_PORT}/subscription-status`,
} as const;

export function applyStaticHeadlessEnv(): void {
  for (const [key, value] of Object.entries(HEADLESS_STATIC_ENV)) {
    process.env[key] = value;
  }
}

// Module side effect: runs when this module is evaluated, which — via the
// first-import ordering in headless_cli.ts — is before dyad's graph.
applyStaticHeadlessEnv();
