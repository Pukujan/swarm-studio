// ABA model routing — the ONE place every model role is chosen.
//
// The owner's directive (2026-10-09): the builder runs entirely on the owner's
// own models. Text/LLM calls go to the local gateway
// (http://127.0.0.1:4000/v1, model ih/cb/deepseek-v4.1-flash); images to
// InferHub (cb/gpt-image-2); video via the external `progrok` CLI. No Dyad
// models, no other providers.
//
// Every model role below can be changed individually from the repo-root `.env`
// (see `.env.example`). The vars are read here and nowhere else, so this file
// is the single surface for "which model runs this role".
//
// Two forms for a role value:
//   <name>@<providerId>   pin an exact provider (e.g. ih/cb/deepseek-v4.1-flash@localgw)
//   <name>                search the user's custom providers for that apiName
//
// When a role's var is unset, the caller's existing literal is returned
// unchanged — so the copied dyad tree behaves exactly as upstream until the
// owner sets a var. Nothing is cached except the one-time .env load.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { LargeLanguageModel } from "@/lib/schemas";

/** Model roles the owner can set independently. */
export type AbaModelRole =
  | "CHAT"
  | "COMPACTION"
  | "SUBAGENT_EXPLORER"
  | "SUBAGENT_IMPLEMENTER"
  | "SUBAGENT_REVIEWER"
  | "EXPLORE_CODE"
  | "EXPLORE_HISTORY"
  | "SAFETY_REVIEW"
  | "THEMES";

export const ABA_MODEL_ROLES: readonly AbaModelRole[] = [
  "CHAT",
  "COMPACTION",
  "SUBAGENT_EXPLORER",
  "SUBAGENT_IMPLEMENTER",
  "SUBAGENT_REVIEWER",
  "EXPLORE_CODE",
  "EXPLORE_HISTORY",
  "SAFETY_REVIEW",
  "THEMES",
];

const ENV_PREFIX = "ABA_MODEL_";
const DEBUG = () => process.env.ABA_DEBUG === "1";

let envLoaded = false;

/**
 * Load the repo-root `.env` once. `process.loadEnvFile` never overwrites a var
 * already set in the environment, so harness/test runs that set ABA_* directly
 * win, and a real run picks up the file. Missing/malformed file is not fatal:
 * the builder falls back to each role's upstream literal.
 */
function loadEnvOnce(): void {
  if (envLoaded) return;
  envLoaded = true;
  // Tests set ABA_*/OCTO_* per case; loading the developer's real .env here
  // would silently flip provider availability in unrelated suites.
  if (process.env.VITEST) return;
  const file = resolveEnvFile();
  if (!file) {
    if (DEBUG()) console.log("[aba-model] no .env found; using upstream defaults");
    return;
  }
  try {
    process.loadEnvFile(file);
    if (DEBUG()) console.log(`[aba-model] loaded ${file}`);
  } catch (error) {
    if (DEBUG())
      console.log(`[aba-model] could not load ${file}: ${String(error)}`);
  }
}

/** Nearest ancestor `.env`, or ABA_ENV_FILE when set. */
function resolveEnvFile(): string | undefined {
  const explicit = process.env.ABA_ENV_FILE;
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  let dir: string;
  try {
    dir = dirname(fileURLToPath(import.meta.url));
  } catch {
    return undefined;
  }
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve one role. `literal` is the caller's existing pinned model and is
 * returned untouched when the role's env var is unset.
 */
export async function resolveAbaModel(
  role: AbaModelRole,
  literal: LargeLanguageModel,
): Promise<LargeLanguageModel> {
  loadEnvOnce();
  const raw = process.env[`${ENV_PREFIX}${role}`]?.trim();
  if (!raw) return literal;
  return resolveModelSpec(raw, role);
}

/** Parse one `<name>@<providerId>` or bare `<name>` spec. */
async function resolveModelSpec(
  spec: string,
  role: AbaModelRole,
): Promise<LargeLanguageModel> {
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    const name = spec.slice(0, at).trim();
    const provider = spec.slice(at + 1).trim();
    if (!name || !provider)
      throw abaConfigError(role, spec, "expected <name>@<providerId>");
    return { provider, name };
  }
  const match = await findCustomModelByName(spec);
  if (match) return match;
  throw abaConfigError(
    role,
    spec,
    `no custom provider serves a model named "${spec}"`,
  );
}

/**
 * Look up a model by apiName across the user's custom (DB) providers. Custom
 * providers take precedence over builtins and keep their own transport even
 * when Dyad Pro is on — which is exactly why routing a role here avoids the
 * Dyad engine. Queries the DB directly (not via getLanguageModels, which would
 * trigger a remote catalog fetch).
 */
async function findCustomModelByName(
  name: string,
): Promise<LargeLanguageModel | undefined> {
  try {
    const { db } = await import("@/db");
    const { language_models, language_model_providers } = await import(
      "@/db/schema"
    );
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: language_models.id,
        apiName: language_models.apiName,
        providerId: language_model_providers.id,
      })
      .from(language_models)
      .innerJoin(
        language_model_providers,
        eq(language_models.customProviderId, language_model_providers.id),
      )
      .where(eq(language_models.apiName, name));
    const row = rows[0];
    if (!row) return undefined;
    return {
      provider: row.providerId,
      name: row.apiName,
      customModelId: row.id,
    };
  } catch {
    return undefined;
  }
}

function abaConfigError(
  role: AbaModelRole,
  spec: string,
  detail: string,
): Error {
  return new Error(
    `ABA_MODEL_${role}="${spec}" could not be resolved: ${detail}. ` +
      `Use "<name>@<providerId>" to pin a provider, or a bare name served by ` +
      `one of your custom providers.`,
  );
}

/** Image generation route. */
export interface AbaImageConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** InferHub image defaults, matching server/src/imagegen.mjs. */
const INFERHUB_IMAGE_BASE_URL = "https://api.inferhub.dev/v1";
const INFERHUB_IMAGE_DEFAULT_MODEL = "cb/gpt-image-2";

/**
 * Image route. Upstream default is the engine URL + the Dyad auto/Pro key,
 * which our text-only gateway cannot serve. The route is chosen by which key is
 * present: ABA_IMAGE_API_KEY (with ABA_IMAGE_* overrides) wins; else
 * INFERHUB_API_KEY routes to the same InferHub defaults the Pro pipeline uses
 * (server/src/imagegen.mjs); else the upstream engine route. Within the chosen
 * route each field falls back independently.
 */
export function abaImageConfig(upstream: AbaImageConfig): AbaImageConfig {
  loadEnvOnce();
  const abaKey = process.env.ABA_IMAGE_API_KEY?.trim();
  const inferhubKey = process.env.INFERHUB_API_KEY?.trim();

  let baseUrl: string;
  let model: string;
  let apiKey: string;
  if (abaKey) {
    baseUrl = process.env.ABA_IMAGE_BASE_URL?.trim() || upstream.baseUrl;
    model = process.env.ABA_IMAGE_MODEL?.trim() || upstream.model;
    apiKey = abaKey;
  } else if (inferhubKey) {
    baseUrl = process.env.INFERHUB_BASE_URL?.trim() || INFERHUB_IMAGE_BASE_URL;
    model =
      process.env.INFERHUB_IMAGE_MODEL?.trim() || INFERHUB_IMAGE_DEFAULT_MODEL;
    apiKey = inferhubKey;
  } else {
    baseUrl = upstream.baseUrl;
    model = upstream.model;
    apiKey = upstream.apiKey;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), model, apiKey };
}

/** Documented, not implemented here: the owner's video tool is `progrok video`. */
export function abaVideoCommand(): string {
  loadEnvOnce();
  return process.env.ABA_VIDEO_CMD?.trim() || "progrok video";
}

const OCTO_DEFAULT_BASE_URL = "https://octodb.design-bakery.com";
const OCTO_DEFAULT_TIMEOUT_MS = 60_000;

export interface AbaOctoConfig {
  baseUrl: string;
  apiKey: string;
  workspaceId: string;
  /** Whether a call can be attempted at all — missing keys fail loudly. */
  configured: boolean;
  timeoutMs: number;
}

/**
 * The owner's Octo DB workspace (delta 7): the data layer dyad's SQL and
 * schema tools target instead of Supabase/Neon. Present iff OCTO_API_KEY and
 * OCTO_WORKSPACE_ID are set; read where it is used, like the other ABA_* knobs.
 */
export function abaOctoConfig(): AbaOctoConfig {
  loadEnvOnce();
  const apiKey = process.env.OCTO_API_KEY?.trim() ?? "";
  const workspaceId = process.env.OCTO_WORKSPACE_ID?.trim() ?? "";
  const baseUrl =
    (process.env.OCTO_BASE_URL?.trim() || OCTO_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
  const timeoutMs = Number(
    process.env.OCTO_TIMEOUT_MS?.trim() || OCTO_DEFAULT_TIMEOUT_MS,
  );
  return {
    baseUrl,
    apiKey,
    workspaceId,
    configured: Boolean(apiKey && workspaceId),
    timeoutMs,
  };
}
